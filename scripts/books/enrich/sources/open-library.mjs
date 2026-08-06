import { normalizeLanguage, normalizedIsbn, validPages, validYear, workTitles } from "../core.mjs";
import { fetchJson } from "../http.mjs";

export function createOpenLibrarySource({ cache } = {}) {
  return {
    key: "open-library",
    priority: 30,
    async search(book) {
      const cacheKey = `${this.key}:isbn-cover-first-v3`;
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const params = new URLSearchParams({
        ...(book.isbn13 ? { isbn: book.isbn13 } : { title: workTitles(book)[0], author: book.author.split(";")[0] }),
        fields: "key,title,author_name,isbn,publisher,publish_year,number_of_pages_median,language,cover_i",
        limit: "10",
      });
      let payload = { docs: [] };
      if (!book.isbn13) {
        try { payload = await fetchJson(`https://openlibrary.org/search.json?${params}`, { attempts: 1, timeoutMs: 4_000 }); }
        catch { /* continue with the next source */ }
      }
      const result = (payload.docs ?? []).map((item) => {
        const years = (item.publish_year ?? []).map(validYear).filter(Boolean);
        const isbn13 = (item.isbn ?? []).map(normalizedIsbn).find(Boolean);
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
          isRussianEdition: language === "ru" || isbn13?.startsWith("9785"),
          confidence: 0.87,
          trustedCoverSource: Boolean(item.cover_i),
          cover: item.cover_i ? {
            official: true,
            url: `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg?default=false`,
            attribution: "Обложка: Open Library",
          } : undefined,
        };
      });
      if (book.isbn13 && !result.some((item) => item.isbn13 === book.isbn13 && item.cover)) {
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
