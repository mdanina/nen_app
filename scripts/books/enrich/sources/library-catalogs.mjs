import { authorMatches, normalize, titleScore, workTitles } from "../core.mjs";
import { fetchText, mapLimit } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

function links(html, baseUrl, pattern) {
  return [...new Set([...String(html).matchAll(/href=["']([^"']+)["']/giu)].map((match) => {
    try { return new URL(match[1], baseUrl).href; } catch { return undefined; }
  }).filter((url) => url && pattern.test(url)))];
}

const catalogs = [
  { key: "rsl", name: "Российская государственная библиотека", search: (query) => `https://search.rsl.ru/ru/search?q=${encodeURIComponent(query)}`, record: /^https:\/\/search\.rsl\.ru\/ru\/record\//u, attribution: "Обложка: Российская государственная библиотека" },
  { key: "rusneb", name: "Национальная электронная библиотека", search: (query) => `https://rusneb.ru/search/?q=${encodeURIComponent(query)}`, record: /^https:\/\/rusneb\.ru\/(?:catalog|record)\//u, attribution: "Обложка: Национальная электронная библиотека" },
];

export function createLibraryCatalogSource({ cache, concurrency = 3, workCoverMode = false } = {}) {
  return {
    key: "library-catalogs", priority: 45, coverageComplete: () => false,
    async search(book) {
      const cacheKey = workCoverMode ? "library-catalogs:canonical-work-cover-v1" : "library-catalogs:v1-work-author";
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const query = workCoverMode ? `${workTitles(book)[0]} ${book.author.split(";")[0]}` : book.isbn13 ?? `${workTitles(book)[0]} ${book.author.split(";")[0]}`;
      const candidates = [];
      for (const catalog of catalogs) {
        try {
          const searchUrl = catalog.search(query);
          const html = await fetchText(searchUrl, { attempts: 1, timeoutMs: 15_000 });
          if (/отключите vpn/iu.test(html)) continue;
          const records = await mapLimit(links(html, searchUrl, catalog.record).slice(0, 5), concurrency, async (url) => {
            try {
              const parsed = parseBookPage(await fetchText(url, { attempts: 1, timeoutMs: 12_000 }), url);
              if (titleScore(workTitles(book)[0], parsed.title) < 0.72) return undefined;
              if (parsed.authors.length && !authorMatches(book.author, parsed.authors, parsed.evidenceText)) return undefined;
              return { ...parsed, authors: parsed.authors.length ? parsed.authors : [book.author], sourceKey: catalog.key, sourceName: catalog.name, sourceUrl: url, sourceRecordId: new URL(url).pathname, sourcePriority: 45, officialPublisher: false, trustedCoverSource: true, trustedLibrarySource: true, isRussianEdition: normalize(parsed.language) === "ru", confidence: 0.9, cover: parsed.coverUrl ? { url: parsed.coverUrl, official: true, attribution: catalog.attribution } : undefined };
            } catch { return undefined; }
          });
          candidates.push(...records.filter(Boolean));
        } catch { /* an unavailable library must not block the next one */ }
      }
      cache?.set(cacheKey, book, candidates);
      return candidates;
    },
  };
}
