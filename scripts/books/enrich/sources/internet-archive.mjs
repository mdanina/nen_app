import { authorMatches, normalizeLanguage, titleScore, transliterateRussian, validYear, workTitles } from "../core.mjs";
import { fetchJson } from "../http.mjs";

function first(value) { return Array.isArray(value) ? value[0] : value; }

export function createInternetArchiveSource({ cache } = {}) {
  return {
    key: "internet-archive", priority: 40, coverageComplete: () => true,
    async search(book) {
      const cacheKey = "internet-archive:v1-work-author-transliteration";
      const cached = cache?.get(cacheKey, book);
      if (cached) return cached;
      const title = workTitles(book).find((value) => /^[a-z0-9]/iu.test(value)) ?? transliterateRussian(book.title);
      const author = transliterateRussian(book.author.split(";")[0]);
      const query = `mediatype:texts AND title:("${title.replaceAll('"', "")}") AND creator:("${author.replaceAll('"', "")}")`;
      const params = new URLSearchParams({ q: query, "fl[]": ["identifier", "title", "creator", "year", "language"], rows: "10", page: "1", output: "json" });
      let docs = [];
      try { docs = (await fetchJson(`https://archive.org/advancedsearch.php?${params}`, { attempts: 1, timeoutMs: 12_000 })).response?.docs ?? []; }
      catch { /* continue to the next source */ }
      const result = docs.filter((item) => {
        const score = Math.max(...workTitles(book).map((alias) => titleScore(alias, item.title)), 0);
        return score >= 0.78 && authorMatches(book.author, [first(item.creator)].filter(Boolean));
      }).map((item) => ({
        sourceKey: "internet-archive", sourceName: "Internet Archive",
        sourceUrl: `https://archive.org/details/${item.identifier}`,
        sourceRecordId: item.identifier, sourcePriority: 40,
        officialPublisher: false, trustedCoverSource: true, trustedLibrarySource: true,
        title: item.title, authors: [first(item.creator)].filter(Boolean),
        publicationYear: validYear(item.year), language: normalizeLanguage(first(item.language)),
        isRussianEdition: normalizeLanguage(first(item.language)) === "ru", confidence: 0.9,
        cover: { official: true, url: `https://archive.org/download/${item.identifier}/page/n0_w600.jpg`, attribution: "Обложка: Internet Archive" },
      }));
      cache?.set(cacheKey, book, result);
      return result;
    },
  };
}
