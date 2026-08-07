import { titleScore, workTitles } from "../core.mjs";
import { fetchText, mapLimit } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

const origin = "https://www.labirint.ru";

export function labirintProductLinks(html = "") {
  return [...new Set([...String(html).matchAll(/href=["'](\/books\/\d+\/?)["']/giu)]
    .map((match) => new URL(match[1], origin).href))];
}

function queryVariants(book) {
  const primaryAuthor = String(book.author ?? "").split(";")[0].trim();
  return [...new Set(workTitles(book).slice(0, 4).flatMap((title) => [
    `${title} ${primaryAuthor}`,
    title,
  ]).filter(Boolean))];
}

export function createLabirintSource({ cache, concurrency = 2 } = {}) {
  return {
    key: "labirint",
    priority: 70,
    coverageComplete: () => false,
    async search(book) {
      const cacheKey = "labirint:canonical-work-cover-v4";
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const productUrls = [];
      for (const query of queryVariants(book)) {
        try {
          const searchUrl = `${origin}/search/${encodeURIComponent(query)}/`;
          const html = await fetchText(searchUrl, { attempts: 2, timeoutMs: 25_000, headers: { "user-agent": "Mozilla/5.0" } });
          productUrls.push(...labirintProductLinks(html));
        } catch { /* continue with the next title or source */ }
        if (productUrls.length >= 20) break;
      }
      const pages = await mapLimit([...new Set(productUrls)].slice(0, 20), concurrency, async (url) => {
        try {
          const parsed = parseBookPage(await fetchText(url, { attempts: 2, timeoutMs: 25_000, headers: { "user-agent": "Mozilla/5.0" } }), url);
          const score = Math.max(...workTitles(book).map((title) => titleScore(title, parsed.title)), 0);
          const bookId = url.match(/\/books\/(\d+)/u)?.[1];
          const coverUrl = parsed.coverUrl ?? (bookId ? `https://imo10.labirint.ru/books/${bookId}/cover.jpg/484-0` : undefined);
          if (!coverUrl) return undefined;
          return {
            ...parsed,
            coverUrl,
            sourceKey: "labirint",
            sourceName: "Книжный магазин «Лабиринт»",
            sourceUrl: url,
            sourceRecordId: new URL(url).pathname,
            sourcePriority: 70,
            officialPublisher: false,
            trustedCoverSource: true,
            confidence: Math.min(0.96, 0.76 + score * 0.2),
            cover: {
              official: true,
              url: coverUrl,
              productMain: parsed.coverEvidence === "product_main",
              attribution: "Обложка опубликована в книжном каталоге «Лабиринт».",
            },
          };
        } catch { return undefined; }
      });
      const result = pages.filter(Boolean);
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
