import { authorMatches, titleScore, workTitles } from "../core.mjs";
import { fetchText, mapLimit } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

const trustedHosts = [
  /(?:^|\.)n-e-n\.ru$/u, /(?:^|\.)search\.rsl\.ru$/u, /(?:^|\.)rusneb\.ru$/u,
  /(?:^|\.)worldcat\.org$/u, /(?:^|\.)archive\.org$/u, /(?:^|\.)books\.google\./u,
  /(?:^|\.)book24\.ru$/u, /(?:^|\.)chitai-gorod\.ru$/u, /(?:^|\.)labirint\.ru$/u,
  /(?:^|\.)ozon\.ru$/u, /(?:^|\.)wildberries\.ru$/u, /(?:^|\.)amazon\./u,
  /(?:^|\.)(?:azbooka|eksmo|rosman|detlit|strecoza|samokatbook|polyandria|albuscorvus|kompasgid|clever-media|archipelag-publishing|alpinabook|mann-ivanov-ferber|pgbooks|gvardiya|melik-pashaev|ast)\.ru$/u,
];

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

export function createWebDiscoverySource({ cache, concurrency = 2 } = {}) {
  return {
    key: "web-discovery", priority: 55, coverageComplete: () => false,
    async search(book) {
      const cacheKey = "web-discovery:v3-duckduckgo-bing";
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const queries = book.isbn13
        ? [`${book.isbn13} ${book.title}`, `"${book.title}" "${book.author.split(";")[0]}"`]
        : [`"${workTitles(book)[0]}" "${book.author.split(";")[0]}"`, `"${book.title}" книга`];
      const urls = [];
      for (const query of queries) {
        try {
          const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { attempts: 1, timeoutMs: 5_000, headers: { "user-agent": "Mozilla/5.0" } });
          urls.push(...discoveryLinks(html));
        } catch { /* try the next query */ }
        if (!urls.length) {
          try {
            const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { attempts: 1, timeoutMs: 7_000, headers: { "user-agent": "Mozilla/5.0" } });
            urls.push(...bingLinks(html));
          } catch { /* try the next query */ }
        }
        if (urls.length >= 5) break;
      }
      const pages = await mapLimit([...new Set(urls)].slice(0, 3), concurrency, async (url) => {
        try {
          const parsed = parseBookPage(await fetchText(url, { attempts: 1, timeoutMs: 5_000, headers: { "user-agent": "Mozilla/5.0" } }), url);
          const isbnMatched = Boolean(book.isbn13 && parsed.isbn13 === book.isbn13);
          const titleMatched = Math.max(...workTitles(book).map((alias) => titleScore(alias, parsed.title)), 0) >= 0.78;
          const authorMatched = parsed.authors.length ? authorMatches(book.author, parsed.authors, parsed.evidenceText) : authorMatches(book.author, [], parsed.evidenceText);
          if (!parsed.coverUrl || !(isbnMatched || (titleMatched && authorMatched))) return undefined;
          const host = new URL(url).hostname.replace(/^www\./u, "");
          return {
            ...parsed, authors: parsed.authors.length ? parsed.authors : [book.author],
            sourceKey: "web-discovery", sourceName: host, sourceUrl: url,
            sourceRecordId: new URL(url).pathname, sourcePriority: 55,
            officialPublisher: /(?:azbooka|eksmo|rosman|detlit|strecoza|samokatbook|polyandria|albuscorvus|kompasgid|clever-media|archipelag-publishing|alpinabook|mann-ivanov-ferber|pgbooks|gvardiya|melik-pashaev|ast)\.ru$/u.test(host),
            trustedCoverSource: true, isRussianEdition: parsed.language === "ru" || parsed.isbn13?.startsWith("9785"),
            confidence: isbnMatched ? 0.98 : 0.91,
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
