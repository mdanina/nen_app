import { normalizeLanguage, normalizedIsbn, validPages, validYear } from "../core.mjs";
import { fetchJson } from "../http.mjs";

export function createOpenLibrarySource({ cache } = {}) {
  return {
    key: "open-library",
    priority: 30,
    async search(book) {
      const cached = cache?.get(this.key, book);
      if (cached) return cached;
      const params = new URLSearchParams({
        title: book.title,
        author: book.author.split(";")[0],
        fields: "key,title,author_name,isbn,publisher,publish_year,number_of_pages_median,language",
        limit: "10",
      });
      const payload = await fetchJson(`https://openlibrary.org/search.json?${params}`);
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
        };
      });
      cache?.set(this.key, book, result);
      return result;
    },
  };
}

