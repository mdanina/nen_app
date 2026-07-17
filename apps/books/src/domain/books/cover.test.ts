import { describe, expect, it } from "vitest";
import type { Book } from "./types";
import { placeholderTone, resolveBookCover } from "./cover";

const book = (cover?: Book["cover"]): Book => ({
  id: "nen-test", slug: "test", title: "Тестовая книга", author: "Автор", shortDescription: "Описание",
  whyRecommended: "Причина", ageMin: 5, ageMax: 7, ageLabel: "5–7 лет", readingMode: "both",
  genres: ["сказка"], themes: ["дружба"], moods: ["уютное"], sensitiveTopics: [], status: "published", cover,
});

describe("resolveBookCover", () => {
  it("показывает временную внешнюю обложку только с разрешённым статусом", () => {
    expect(resolveBookCover(book({ kind: "external", url: "https://covers.openlibrary.org/book.jpg", rightsStatus: "external-display-only", temporary: true })).kind).toBe("image");
  });
  it("заменяет неподтверждённую обложку заглушкой", () => {
    expect(resolveBookCover(book({ kind: "external", url: "https://example.com/book.jpg", rightsStatus: "unverified" })).kind).toBe("placeholder");
  });
  it("выбирает оформление заглушки детерминированно", () => {
    expect(placeholderTone("nen-test")).toBe(placeholderTone("nen-test"));
  });
});
