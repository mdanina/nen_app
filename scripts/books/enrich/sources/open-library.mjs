import { normalizeLanguage, normalizedIsbn, validPages, validYear, workTitles } from "../core.mjs";
import { fetchJson } from "../http.mjs";

export function createOpenLibrarySource({ cache, workCoverMode = false } = {}) {
  return {
    key: "open-library",
    priority: 30,
    async search(book) {
      const cacheKey = `${this.key}:${workCoverMode ? "canonical-work-cover-v2" : "isbn-cover-first-v3"}`;
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const searches = workCoverMode ? workTitles(book).slice(0, 3) : [workTitles(book)[0]];
      const documents = [];
      if (workCoverMode || !book.isbn13) {
        for (const title of searches) {
          const params = new URLSearchParams({
            title,
            author: book.author.split(";")[0],
            fields: workCoverMode ? "key,title,author_name,language,cover_i" : "key,title,author_name,isbn,publisher,publish_year,number_of_pages_median,language,cover_i",
            limit: "20",
          });
          try { documents.push(...((await fetchJson(`https://openlibrary.org/search.json?${params}`, { attempts: 1, timeoutMs: 6_000 })).docs ?? [])); }
          catch { /* continue with the next source */ }
          if (workCoverMode && documents.some((item) => item.cover_i)) break;
        }
      }
      const result = [...new Map(documents.map((item) => [item.key, item])).values()].map((item) => {
        const years = (item.publish_year ?? []).map(validYear).filter(Boolean);
        const isbn13 = workCoverMode ? undefined : (item.isbn ?? []).map(normalizedIsbn).find(Boolean);
        const language = (item.language ?? []).map(normalizeLanguage).find(Boolean);
        return {
          sourceKey: this.key,
          sourceName: "Open Library",
          sourceUrl: `https://openlibrary.org${item.key}`,
          sourceRecordId: item.key,
          sourcePriority: this.priority,
          officialPublisher: false,
          title: item.title,
          authors: item.author_name ?? [],
          isbn13,
          publisher: item.publisher?.[0],
          publicationYear: years.length ? Math.max(...years) : undefined,
          pages: validPages(item.number_of_pages_median),
          language,
          evidenceText: [item.title, ...(item.author_name ?? []), ...(item.publisher ?? [])].join(" "),
          isRussianEdition: language === "ru",
          confidence: 0.87,
          trustedCoverSource: Boolean(item.cover_i),
          cover: item.cover_i ? {
            official: true,
            url: `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg?default=false`,
            attribution: "Обложка: Open Library",
          } : undefined,
        };
      });
      if (!workCoverMode && book.isbn13 && !result.some((item) => item.isbn13 === book.isbn13 && item.cover)) {
        result.push({
          sourceKey: this.key,
          sourceName: "Open Library Covers",
          sourceUrl: `https://openlibrary.org/isbn/${book.isbn13}`,
          sourceRecordId: `isbn:${book.isbn13}`,
          sourcePriority: this.priority,
          officialPublisher: false,
          trustedCoverSource: true,
          title: book.title,
          authors: [book.author],
          isbn13: book.isbn13,
          publisher: book.publisher,
          publicationYear: book.publicationYear,
          pages: book.pages,
          language: book.language,
          evidenceText: `${book.title} ${book.author} ISBN ${book.isbn13}`,
          isRussianEdition: book.language === "ru" || book.isbn13.startsWith("9785"),
          confidence: 0.96,
          cover: {
            official: true,
            url: `https://covers.openlibrary.org/b/isbn/${book.isbn13}-L.jpg?default=false`,
            attribution: "Обложка: Open Library",
          },
        });
      }
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
