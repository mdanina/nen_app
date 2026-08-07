import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { authorMatches, titleScore } from "../core.mjs";

export function createNenEditorialSource({ root, workCoverMode = false } = {}) {
  let byId = new Map();
  return {
    key: "nen-editorial",
    priority: 120,
    coverageComplete: () => true,
    async init() {
      const payload = JSON.parse(await readFile(resolve(root, "data/source/nen-collection-books.json"), "utf8"));
      byId = new Map((payload.books ?? []).map((book) => [book.id, book]));
    },
    async search(book) {
      const editorial = byId.get(book.id);
      if (!editorial?.coverUrl || !editorial?.sourceMetadata?.sourceUrl) return [];
      const authors = editorial.authors ?? [];
      if (titleScore(book.title, editorial.title) < 0.9 || !authorMatches(book.author, authors)) return [];
      return [{
        sourceKey: "nen-editorial", sourceName: "НЭН",
        sourceUrl: editorial.sourceMetadata.sourceUrl,
        sourceRecordId: `${editorial.sourceMetadata.sourceUrl}#${editorial.id}`,
        sourcePriority: 120, trustedCoverSource: true, officialPublisher: false,
        title: editorial.title, authors,
        publisher: editorial.publisher ?? book.publisher,
        publicationYear: editorial.publicationYear ?? book.publicationYear,
        ...(!workCoverMode ? { isbn13: editorial.isbn13 ?? book.isbn13 } : {}),
        pages: editorial.pages ?? book.pages,
        seriesName: editorial.seriesName ?? book.seriesName,
        language: editorial.language ?? book.language ?? "ru",
        isRussianEdition: true, confidence: 0.99,
        cover: { url: editorial.coverUrl, official: true, attribution: "Обложка из редакционного материала НЭН." },
      }];
    },
  };
}
