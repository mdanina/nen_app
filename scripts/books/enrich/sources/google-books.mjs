import { normalizeLanguage, normalizedIsbn, validPages, validYear, workTitles } from "../core.mjs";
import { fetchJson } from "../http.mjs";

export function createGoogleBooksSource({ cache } = {}) {
  return {
    key: "google-books",
    priority: 60,
    async search(book) {
      const cacheKey = `${this.key}:isbn-first-v2`;
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const query = book.isbn13
        ? `isbn:${book.isbn13}`
        : `intitle:${JSON.stringify(workTitles(book)[0])} inauthor:${JSON.stringify(book.author.split(";")[0])}`;
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=ru&printType=books&maxResults=10`;
      const payload = await fetchJson(url);
      const result = (payload.items ?? []).map((item) => {
        const value = item.volumeInfo ?? {};
        const isbn13 = normalizedIsbn((value.industryIdentifiers ?? []).find((identifier) => identifier.type === "ISBN_13")?.identifier);
        return {
          sourceKey: this.key,
          sourceName: "Google Books",
          sourceUrl: value.infoLink ?? `https://books.google.com/books?id=${item.id}`,
          sourceRecordId: item.id,
          sourcePriority: this.priority,
          officialPublisher: false,
          title: value.title,
          authors: value.authors ?? [],
          isbn13,
          publisher: value.publisher,
          publicationYear: validYear(value.publishedDate),
          pages: validPages(value.pageCount),
          language: normalizeLanguage(value.language),
          evidenceText: [value.title, ...(value.authors ?? []), value.publisher].filter(Boolean).join(" "),
          isRussianEdition: value.language === "ru" || isbn13?.startsWith("9785"),
          confidence: 0.9,
        };
      });
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
