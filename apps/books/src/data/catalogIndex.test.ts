import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StaticBooksRepository } from "./booksRepository";
import { emptyFilters } from "../domain/books/filters";
import type { Book } from "../domain/books/types";
import { validateBooks } from "../domain/books/validation";

// Индекс каталога — это отдельный файл, который собирается сборкой и грузится в
// браузере. Если он не пройдёт валидацию, каталог откроется пустым, и ни один
// тест на data/generated/books.json этого не заметит.
const indexPath = fileURLToPath(new URL("../../public/data/catalog-index.json", import.meta.url));
const index = JSON.parse(readFileSync(indexPath, "utf8")) as unknown[];

describe("индекс каталога для браузера", () => {
  it("проходит валидацию целиком", () => {
    const validated = validateBooks(index);
    expect(validated.issues).toEqual([]);
    expect(validated.items.length).toBe(index.length);
  });

  it("несёт всё, что нужно карточке и фильтрам", () => {
    const books = validateBooks(index).items;
    for (const field of ["slug", "title", "author", "ageLabel", "whyRecommended", "shortDescription"] as const) {
      expect(books.every((book) => Boolean(book[field]))).toBe(true);
    }
    expect(books.every((book) => Array.isArray(book.themes) && Array.isArray(book.genres))).toBe(true);
  });

  it("не тащит в список полное описание и служебные данные импорта", () => {
    const record = index[0] as Record<string, unknown>;
    expect(record.fullDescription).toBeUndefined();
    expect(record.sourceMetadata).toBeUndefined();
    expect(record.annotationProvenance).toBeUndefined();
    expect(record.bibliographicSources).toBeUndefined();
  });

  it("остаётся в размере, который не стыдно отдать с телефона", () => {
    const megabytes = new TextEncoder().encode(JSON.stringify(index)).length / 1048576;
    expect(megabytes).toBeLessThan(4.5);
  });

  it("поиск и фильтры работают поверх индекса", async () => {
    const repository = new StaticBooksRepository(index);
    const result = await repository.search({ ...emptyFilters, age: 5 });
    expect(result.exact.length).toBeGreaterThan(0);
    expect(result.exact.every(({ book }) => book.ageMin <= 5 && book.ageMax >= 5)).toBe(true);
  });

  it("страница книги открывается по слагу из индекса", async () => {
    const repository = new StaticBooksRepository(index);
    const first = (validateBooks(index).items as Book[])[0];
    expect(await repository.getBySlug(first.slug)).toMatchObject({ id: first.id });
  });
});
