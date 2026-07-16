import { describe, expect, it } from "vitest";
import { emptyFilters, searchBooks } from "./filters";
import { getSimilarBooks } from "./similarity";
import type { Book } from "./types";
import { validateBooks } from "./validation";

const book = (overrides: Partial<Book> = {}): Book => ({
  id: "1", slug: "one", title: "Первая", author: "Автор", shortDescription: "История о дружбе", whyRecommended: "Для разговора", ageMin: 6, ageMax: 9, ageLabel: "6–9 лет", readingMode: "both", genres: ["приключения"], themes: ["дружба", "школа"], moods: ["спокойное"], lengthCategory: "short", sensitiveTopics: [], status: "published", ...overrides,
});

describe("validateBooks", () => {
  it("не ломает каталог из-за одной плохой записи", () => { const result = validateBooks([book(), { id: "bad" }]); expect(result.items).toHaveLength(1); expect(result.issues.length).toBeGreaterThan(0); });
  it("отклоняет повторяющиеся slug", () => { const result = validateBooks([book(), book({ id: "2" })]); expect(result.items).toHaveLength(1); expect(result.issues.some((issue) => issue.field === "slug")).toBe(true); });
});

describe("searchBooks", () => {
  const books = [book({ suitableForBedtime: true }), book({ id: "2", slug: "two", title: "Вторая", themes: ["животные"], moods: ["смешное"], lengthCategory: "medium" }), book({ id: "3", slug: "three", title: "Третья", ageMin: 10, ageMax: 12 })];
  it("возвращает много точных результатов", () => expect(searchBooks(books, { ...emptyFilters, age: 7 }).exact).toHaveLength(2));
  it("возвращает один точный результат", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["животные"] }).exact).toHaveLength(1));
  it("не ослабляет возраст", () => { const result = searchBooks(books, { ...emptyFilters, age: 11, themes: ["несуществующая"] }); expect(result.exact).toHaveLength(0); expect(result.nearby.every((item) => item.book.ageMin <= 11 && item.book.ageMax >= 11)).toBe(true); });
  it("объясняет неизвестную тему", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["космос"] }).nearby[0].relaxed).toContain("темы"));
  it("предпочитает соседнюю длительность", () => expect(searchBooks(books, { ...emptyFilters, age: 7, lengths: ["very-short"], themes: ["нет"] }).nearby[0].book.lengthCategory).toBe("short"));
  it("выбирает максимальное число совпадений", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["дружба", "животные"], moods: ["спокойное"] }).nearby[0].book.id).toBe("1"));
  it("понимает запрос перед сном", () => expect(searchBooks(books, { ...emptyFilters, age: 7, search: "почитать перед сном" }).exact[0].book.id).toBe("1"));
});

describe("getSimilarBooks", () => {
  it("не показывает текущую и объясняет сходство", () => { const source = book(); const result = getSimilarBooks(source, [source, book({ id: "2", slug: "two" }), book({ id: "3", slug: "draft", status: "draft" })]); expect(result).toHaveLength(1); expect(result[0].book.id).toBe("2"); expect(result[0].reasons.length).toBeGreaterThan(0); });
});
