import { authorMatches, authorMatchesNearTitle, normalize, publisherMatches, titleScore, titleTokens } from "../core.mjs";
import { fetchText, mapLimit } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

const definitions = [
  { key: "azbooka", name: "Издательская группа «Азбука-Аттикус»", publisher: "Азбука-Аттикус", sitemaps: ["https://azbooka.ru/sitemap.xml"], product: /^https:\/\/azbooka\.ru\/books\//u },
  { key: "eksmo", name: "Издательство «Эксмо»", publisher: "Эксмо", sitemaps: ["https://eksmo.ru/sitemap/books1.xml", "https://eksmo.ru/sitemap/books2.xml", "https://eksmo.ru/sitemap/books3.xml"], product: /^https:\/\/eksmo\.ru\/(?:amp\/)?book\//u },
  { key: "rosman", name: "Издательство «Росмэн»", publisher: "Росмэн", sitemaps: ["https://rosman.ru/sitemap-iblock-21.xml"], product: /^https:\/\/rosman\.ru\/catalog\//u },
  { key: "detlit", name: "Издательство «Детская литература»", publisher: "Детская литература", sitemaps: ["https://detlit.ru/sitemap.xml"], product: /^https:\/\/detlit\.ru\/(?!$|series\/|sitemap\/)/u },
  { key: "strekoza", name: "Издательство «Стрекоза»", publisher: "Стрекоза", sitemaps: ["https://strecoza.ru/product-sitemap.xml", "https://strecoza.ru/product-sitemap2.xml", "https://strecoza.ru/product-sitemap3.xml", "https://strecoza.ru/product-sitemap4.xml"], product: /^https:\/\/strecoza\.ru\/product\//u },
  { key: "samokat", name: "Издательство «Самокат»", publisher: "Самокат", sitemaps: ["https://samokatbook.ru/sitemap-iblock-1.xml"], product: /^https:\/\/samokatbook\.ru\/book\//u },
  { key: "polyandria", name: "Издательство «Поляндрия»", publisher: "Поляндрия", sitemaps: ["https://www.polyandria.ru/sitemap-iblock-4.xml"], product: /^https?:\/\/www\.polyandria\.ru\/catalog\/[^/]+\/[^/]+\/?$/u },
  { key: "white-crow", name: "Издательство «Белая ворона»", publisher: "Белая ворона", sitemaps: ["https://albuscorvus.ru/product-sitemap.xml"], product: /^https:\/\/albuscorvus\.ru\/product\/[^/]+\/?$/u },
  { key: "kompasgid", name: "Издательство «КомпасГид»", publisher: "КомпасГид", sitemaps: ["https://kompasgid.ru/product-sitemap.xml"], product: /^https:\/\/kompasgid\.ru\/product\/[^/]+\/?$/u },
  { key: "clever", name: "Издательство Clever", publisher: "Clever", sitemaps: ["https://www.clever-media.ru/sitemap.xml"], product: /^https:\/\/www\.clever-media\.ru\/product\/[^/]+\/?$/u },
  { key: "archipelag", name: "Издательство «Архипелаг»", publisher: "Архипелаг", sitemaps: ["https://archipelag-publishing.ru/sitemap.xml"], product: /^https:\/\/archipelag-publishing\.ru\/catalog\/[^/]+\/\d+\/?$/u },
  { key: "alpina", name: "Издательство «Альпина.Дети»", publisher: "Альпина.Дети", sitemaps: ["https://alpinabook.ru/upload/sitemap.xml"], product: /^https:\/\/alpinabook\.ru\/catalog\/book-[^/]+\/?$/u },
  { key: "mif", name: "Издательство «МИФ»", publisher: "МИФ.Детство", sitemaps: ["https://www.mann-ivanov-ferber.ru/sitemap.xml"], sitemapTimeoutMs: 120_000, product: /^https:\/\/www\.mann-ivanov-ferber\.ru\/catalog\/product\/[^/]+\/?$/u },
  { key: "pink-giraffe", name: "Издательство «Розовый жираф»", publisher: "Розовый жираф", sitemaps: ["https://pgbooks.ru/sitemap_index.xml"], recursiveSitemaps: true, indexPageTitles: true, product: /^https:\/\/pgbooks\.ru\/books\/book\/\d+\/?$/u },
  { key: "young-guard", name: "Издательство «Молодая гвардия»", publisher: "Молодая гвардия", listingPages: Array.from({ length: 79 }, (_, index) => `https://gvardiya.ru/books?page=${index + 1}&order=popularity&tags=&series=&saleOnly=0`), product: /^https:\/\/gvardiya\.ru\/books\/[^/]+\/[^/?#]+\/?$/u },
  { key: "melik-pashaev", name: "Издательство «Мелик-Пашаев»", publisher: "Мелик-Пашаев", sitemaps: ["https://melik-pashaev.ru/product-sitemap.xml"], product: /^https:\/\/melik-pashaev\.ru\/product\/[^/]+\/?$/u },
  { key: "ast-full", name: "Издательство «АСТ»", publisher: "АСТ", sitemaps: ["https://ast.ru/sitemap.xml"], recursiveSitemaps: true, product: /^https:\/\/ast\.ru\/book\/[^/]+\/?$/u },
];

function sitemapUrls(xml = "") {
  return [...xml.matchAll(/<loc>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/loc>/giu)].map((match) => match[1].trim());
}

function pageLinks(html = "", baseUrl) {
  return [...html.matchAll(/href=["']([^"']+)["']/giu)].map((match) => {
    try { return new URL(match[1], baseUrl).href; } catch { return undefined; }
  }).filter(Boolean);
}

const transliteration = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
function latin(value) { return [...normalize(value)].map((letter) => transliteration[letter] ?? letter).join("").replace(/[^a-z0-9]+/gu, " ").trim(); }
function urlTokens(url) {
  let path = new URL(url).pathname;
  try { path = decodeURIComponent(path); } catch {}
  return new Set([...titleTokens(path), ...titleTokens(latin(path))]);
}
function bookTokens(book) { return [...new Set([...titleTokens(book.title), ...titleTokens(latin(book.title))])]; }

export function createOfficialPublisherSource({ cache, concurrency = 6, root, matchLevel = 1, publisherKeys } = {}) {
  const activeDefinitions = publisherKeys?.length ? definitions.filter((definition) => publisherKeys.includes(definition.key)) : definitions;
  const sitemapCachePath = root ? resolve(root, "data/.cache/books-enrich/publisher-urls.json") : undefined;
  const pageTitleCachePath = root ? resolve(root, "data/.cache/books-enrich/publisher-page-titles.json") : undefined;
  const source = {
    key: "official-publishers",
    priority: 100,
    status: [],
    coverageComplete() {
      return activeDefinitions.every((definition) => definition.urls?.length > 0)
        && !source.status.some((item) => item.status === "unavailable" || item.status === "empty");
    },
    async init() {
      let cachedUrls = {};
      let cachedPageTitles = {};
      if (sitemapCachePath) {
        try {
          const cached = JSON.parse(await readFile(sitemapCachePath, "utf8"));
          if (Date.now() - new Date(cached.generatedAt).getTime() < 7 * 86_400_000) cachedUrls = cached.sources ?? {};
        } catch { /* cache is optional */ }
      }
      if (pageTitleCachePath) {
        try { cachedPageTitles = JSON.parse(await readFile(pageTitleCachePath, "utf8")); }
        catch { /* cache is optional */ }
      }
      await mapLimit(activeDefinitions, 4, async (definition) => {
        if (Array.isArray(cachedUrls[definition.key])) definition.urls = cachedUrls[definition.key];
        else {
          const sitemapDocuments = await mapLimit(definition.sitemaps ?? [], 3, async (url) => {
            try { return await fetchText(url, { timeoutMs: definition.sitemapTimeoutMs ?? 20_000 }); }
            catch (error) { source.status.push({ source: definition.key, status: "unavailable", error: String(error) }); return ""; }
          });
          const childSitemaps = definition.recursiveSitemaps
            ? sitemapDocuments.flatMap(sitemapUrls).filter((url) => /\.xml(?:\?|$)/iu.test(url))
            : [];
          const childDocuments = await mapLimit(childSitemaps, 4, async (url) => {
            try { return await fetchText(url, { timeoutMs: definition.sitemapTimeoutMs ?? 30_000 }); }
            catch (error) { source.status.push({ source: definition.key, status: "child_sitemap_unavailable", url, error: String(error) }); return ""; }
          });
          const listingDocuments = await mapLimit(definition.listingPages ?? [], 4, async (url) => {
            try { return { url, html: await fetchText(url, { timeoutMs: 30_000 }) }; }
            catch (error) { source.status.push({ source: definition.key, status: "listing_unavailable", url, error: String(error) }); return { url, html: "" }; }
          });
          const discovered = [
            ...sitemapDocuments.flatMap(sitemapUrls),
            ...childDocuments.flatMap(sitemapUrls),
            ...listingDocuments.flatMap(({ url, html }) => pageLinks(html, url)),
          ];
          definition.urls = [...new Set(discovered
            .map((url) => url.replace(/^http:\/\/www\.polyandria\.ru/iu, "https://www.polyandria.ru"))
            .filter((url) => definition.product.test(url)))];
        }
        if (definition.indexPageTitles) {
          const knownTitles = cachedPageTitles[definition.key] ?? {};
          const missing = definition.urls.filter((url) => !knownTitles[url]);
          const discoveredTitles = await mapLimit(missing, 8, async (url) => {
            try {
              const parsed = parseBookPage(await fetchText(url, { attempts: 1, timeoutMs: 8_000 }), url, definition);
              return [url, parsed.title];
            } catch { return [url, ""]; }
          });
          definition.pageTitles = { ...knownTitles, ...Object.fromEntries(discoveredTitles.filter(([, title]) => title)) };
          cachedPageTitles[definition.key] = definition.pageTitles;
        }
        definition.index = definition.urls.map((url) => ({
          url,
          tokens: new Set([...urlTokens(url), ...titleTokens(definition.pageTitles?.[url]), ...titleTokens(latin(definition.pageTitles?.[url]))]),
        }));
        definition.tokenIndex = new Map();
        for (const item of definition.index) {
          for (const token of item.tokens) {
            const entries = definition.tokenIndex.get(token);
            if (entries) entries.push(item);
            else definition.tokenIndex.set(token, [item]);
          }
        }
        source.status.push({ source: definition.key, status: definition.urls.length ? "ready" : "empty", records: definition.urls.length });
        console.log(`[books:enrich] индекс ${definition.key}: ${definition.urls.length}`);
      });
      if (sitemapCachePath) {
        await mkdir(dirname(sitemapCachePath), { recursive: true });
        await writeFile(sitemapCachePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: { ...cachedUrls, ...Object.fromEntries(activeDefinitions.map((item) => [item.key, item.urls])) } })}\n`, "utf8");
      }
      if (pageTitleCachePath) {
        await mkdir(dirname(pageTitleCachePath), { recursive: true });
        await writeFile(pageTitleCachePath, `${JSON.stringify(cachedPageTitles)}\n`, "utf8");
      }
    },
    async search(book) {
      const cacheKey = `${source.key}:adapter-v2:match-level-${matchLevel}:publishers-${activeDefinitions.map((item) => item.key).join(",")}`;
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const wanted = bookTokens(book);
      const trials = [];
      const existingPage = book.cover?.sourcePageUrl;
      if (existingPage) {
        const definition = activeDefinitions.find((item) => item.product.test(existingPage));
        if (definition) trials.push({ url: existingPage, definition, score: 1.1 });
      }
      for (const definition of activeDefinitions) {
        const possible = [...new Map(wanted.flatMap((token) => definition.tokenIndex?.get(token) ?? []).map((item) => [item.url, item])).values()];
        const minimumScore = matchLevel === 1 ? 0.62 : matchLevel === 2 ? 0.45 : 0.3;
        const perPublisher = matchLevel === 1 ? 3 : matchLevel === 2 ? 6 : 12;
        const ranked = possible.map((item) => {
          const common = wanted.filter((token) => item.tokens.has(token)).length;
          return { ...item, definition, score: common / Math.max(1, wanted.length) };
        }).filter((item) => item.score >= minimumScore).sort((a, b) => b.score - a.score).slice(0, perPublisher);
        trials.push(...ranked.filter((trial) => !trials.some((existing) => existing.url === trial.url)));
      }
      if (!trials.length && (!publisherKeys?.length || publisherKeys.includes("ast-full"))) {
        try {
          const surname = normalize(book.author).split(" ").at(-1) ?? "";
          const searchUrl = `https://ast.ru/search/?q=${encodeURIComponent(`${book.title} ${surname}`)}`;
          const html = await fetchText(searchUrl);
          for (const path of [...new Set([...html.matchAll(/href=["'](\/book\/[^"'?#]+\/)["']/giu)].map((match) => match[1]))].slice(0, 5)) {
            trials.push({ url: new URL(path, searchUrl).href, definition: { key: "ast", name: "Издательство «АСТ»", publisher: "АСТ" }, score: 0.75 });
          }
        } catch { /* next source will be used */ }
      }
      let pageErrors = 0;
      const trialLimit = matchLevel === 1 ? 1 : matchLevel === 2 ? 2 : 3;
      const attemptedTrials = trials
        .sort((left, right) => (
          Number(publisherMatches(book.publisher, right.definition.publisher)) - Number(publisherMatches(book.publisher, left.definition.publisher))
          || right.score - left.score
        ))
        .slice(0, trialLimit);
      const pages = await mapLimit(attemptedTrials, concurrency, async (trial) => {
        try {
          const parsed = parseBookPage(await fetchText(trial.url, { attempts: 1, timeoutMs: 8_000 }), trial.url, trial.definition);
          const score = titleScore(book.title, parsed.title);
          const authorMatch = parsed.authors.length
            ? authorMatches(book.author, parsed.authors)
            : authorMatchesNearTitle(book.author, parsed.title, parsed.evidenceText);
          if (score < 0.72 || !authorMatch) return undefined;
          return {
            ...parsed,
            authors: parsed.authors.length ? parsed.authors : [book.author],
            authorEvidence: parsed.authors.length ? "structured_data" : "official_page_near_title",
            sourceKey: trial.definition.key,
            sourceName: trial.definition.name,
            sourceUrl: trial.url,
            sourceRecordId: new URL(trial.url).pathname,
            sourcePriority: 100,
            officialPublisher: true,
            isRussianEdition: parsed.language === "ru" || parsed.isbn13?.startsWith("9785"),
            confidence: Math.min(0.99, 0.78 + score * 0.15 + (parsed.isbn13 ? 0.04 : 0.02)),
            cover: parsed.coverUrl ? { url: parsed.coverUrl, official: true } : undefined,
          };
        } catch { pageErrors += 1; return undefined; }
      });
      if (attemptedTrials.length > 0 && pageErrors === attemptedTrials.length) {
        throw new Error(`all_official_product_pages_unavailable:${attemptedTrials.length}`);
      }
      const result = pages.filter(Boolean);
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
  return source;
}
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
