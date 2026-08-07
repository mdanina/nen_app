import { authorMatches, titleScore, workTitles } from "../core.mjs";
import { fetchText, mapLimit } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

const trustedHosts = [
  /(?:^|\.)n-e-n\.ru$/u, /(?:^|\.)search\.rsl\.ru$/u, /(?:^|\.)rusneb\.ru$/u,
  /(?:^|\.)worldcat\.org$/u, /(?:^|\.)archive\.org$/u, /(?:^|\.)books\.google\./u,
  /(?:^|\.)book24\.ru$/u, /(?:^|\.)chitai-gorod\.ru$/u, /(?:^|\.)labirint\.ru$/u,
  /(?:^|\.)ozon\.ru$/u, /(?:^|\.)wildberries\.ru$/u, /(?:^|\.)amazon\./u,
  /(?:^|\.)(?:azbooka|eksmo|rosman|detlit|strecoza|samokatbook|polyandria|albuscorvus|kompasgid|clever-media|archipelag-publishing|alpinabook|mann-ivanov-ferber|pgbooks|gvardiya|melik-pashaev|ast|livebooks)\.ru$/u,
  /(?:^|\.)(?:penguinrandomhouse|harpercollins|simonandschuster|panmacmillan|candlewick|scholastic|bloomsbury|hachettechildrens|walker)\.(?:com|co\.uk)$/u,
];

const officialPublisherHost = /(?:azbooka|eksmo|rosman|detlit|strecoza|samokatbook|polyandria|albuscorvus|kompasgid|clever-media|archipelag-publishing|alpinabook|mann-ivanov-ferber|pgbooks|gvardiya|melik-pashaev|ast|livebooks)\.ru$|(?:penguinrandomhouse|harpercollins|simonandschuster|panmacmillan|candlewick|scholastic|bloomsbury|hachettechildrens|walker)\.(?:com|co\.uk)$/u;

function discoveryLinks(html) {
  const result = [];
  for (const match of String(html).matchAll(/class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)/giu)) {
    try {
      const redirect = new URL(match[1], "https://duckduckgo.com");
      const target = redirect.searchParams.get("uddg") ?? redirect.href;
      const url = new URL(target);
      if (trustedHosts.some((pattern) => pattern.test(url.hostname))) result.push(url.href);
    } catch { /* ignore malformed result */ }
  }
  return [...new Set(result)];
}

function bingLinks(html) {
  const result = [];
  for (const match of String(html).matchAll(/<li class=["']b_algo["'][\s\S]*?<h2[^>]*><a[^>]+href=["']([^"']+)/giu)) {
    try {
      const redirect = new URL(match[1].replaceAll("&amp;", "&"));
      const encoded = redirect.searchParams.get("u");
      const target = encoded?.startsWith("a1") ? Buffer.from(encoded.slice(2), "base64url").toString("utf8") : redirect.href;
      const url = new URL(target);
      if (trustedHosts.some((pattern) => pattern.test(url.hostname))) result.push(url.href);
    } catch { /* ignore malformed result */ }
  }
  return [...new Set(result)];
}

export function createWebDiscoverySource({ cache, concurrency = 2, workCoverMode = false } = {}) {
  return {
    key: "web-discovery", priority: 55, coverageComplete: () => false,
    async search(book) {
      const cacheKey = workCoverMode ? "web-discovery:canonical-work-cover-v4" : "web-discovery:v3-duckduckgo-bing";
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const queries = !workCoverMode && book.isbn13
        ? [`${book.isbn13} ${book.title}`, `"${book.title}" "${book.author.split(";")[0]}"`]
        : [...new Set([
          ...workTitles(book).slice(0, 2).map((title) => `"${title}" "${book.author.split(";")[0]}"`),
          ...(book.originalTitle ? [`"${book.originalTitle}" book publisher`] : []),
        ])];
      const urls = [];
      for (const query of queries) {
        try {
          const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { attempts: 1, timeoutMs: 3_000, headers: { "user-agent": "Mozilla/5.0" } });
          urls.push(...discoveryLinks(html));
        } catch { /* try the next query */ }
        if (!urls.length) {
          try {
            const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { attempts: 1, timeoutMs: 4_000, headers: { "user-agent": "Mozilla/5.0" } });
            urls.push(...bingLinks(html));
          } catch { /* try the next query */ }
        }
        if (urls.length >= 5) break;
      }
      const pages = await mapLimit([...new Set(urls)].slice(0, 3), concurrency, async (url) => {
        try {
          const parsed = parseBookPage(await fetchText(url, { attempts: 1, timeoutMs: 5_000, headers: { "user-agent": "Mozilla/5.0" } }), url);
          const titleMatched = Math.max(...workTitles(book).map((alias) => titleScore(alias, parsed.title)), 0) >= 0.78;
          const authorMatched = parsed.authors.length ? authorMatches(book.author, parsed.authors, parsed.evidenceText) : authorMatches(book.author, [], parsed.evidenceText);
          if (!parsed.coverUrl || !(titleMatched && authorMatched)) return undefined;
          const host = new URL(url).hostname.replace(/^www\./u, "");
          return {
            ...parsed, authors: parsed.authors.length ? parsed.authors : [book.author],
            sourceKey: "web-discovery", sourceName: host, sourceUrl: url,
            sourceRecordId: new URL(url).pathname, sourcePriority: 55,
            officialPublisher: officialPublisherHost.test(host),
            trustedCoverSource: true, isRussianEdition: parsed.language === "ru",
            confidence: 0.91,
            cover: { official: true, url: parsed.coverUrl, attribution: `Обложка: ${host}` },
          };
        } catch { return undefined; }
      });
      const result = pages.filter(Boolean);
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
