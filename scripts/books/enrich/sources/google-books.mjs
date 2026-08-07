import { normalizeLanguage, normalizedIsbn, validPages, validYear, workTitles } from "../core.mjs";
import { fetchJson } from "../http.mjs";

let googleQueue = Promise.resolve();
function paced(request) {
  const result = googleQueue.then(request);
  googleQueue = result.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, 900)));
  return result;
}

export function createGoogleBooksSource({ cache, workCoverMode = false } = {}) {
  return {
    key: "google-books",
    priority: 60,
    async search(book) {
      const cacheKey = `${this.key}:${workCoverMode ? "canonical-work-cover-v2" : "isbn-cover-paced-v4"}`;
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const author = book.author.split(";")[0];
      const queries = workCoverMode
        ? workTitles(book).slice(0, 2).map((title) => `${title} ${author}`)
        : [book.isbn13 ? `isbn:${book.isbn13}` : `intitle:${workTitles(book)[0]} inauthor:${author}`];
      const items = [];
      for (const query of [...new Set(queries)]) {
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&printType=books&maxResults=20`;
        let payload = { items: [] };
        try { payload = await paced(() => fetchJson(url, { attempts: 1, timeoutMs: 12_000 })); }
        catch (error) {
          if (/HTTP 429/u.test(String(error))) {
            await new Promise((resolve) => setTimeout(resolve, 5_000));
            try { payload = await paced(() => fetchJson(url, { attempts: 1, timeoutMs: 12_000 })); } catch { /* continue */ }
          }
        }
        items.push(...(payload.items ?? []));
        if (workCoverMode && items.some((item) => item.volumeInfo?.imageLinks)) break;
      }
      const result = [...new Map(items.map((item) => [item.id, item])).values()].map((item) => {
        const value = item.volumeInfo ?? {};
        const isbn13 = workCoverMode ? undefined : normalizedIsbn((value.industryIdentifiers ?? []).find((identifier) => identifier.type === "ISBN_13")?.identifier);
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
          isRussianEdition: value.language === "ru",
          confidence: 0.9,
          trustedCoverSource: Boolean(value.imageLinks?.thumbnail),
          cover: value.imageLinks?.thumbnail ? {
            official: true,
            url: value.imageLinks.extraLarge ?? value.imageLinks.large ?? value.imageLinks.medium ?? value.imageLinks.thumbnail.replace(/^http:/u, "https:"),
            attribution: "Обложка: Google Books",
          } : undefined,
        };
      });
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
