import { describe, expect, it } from "vitest";
import productionBooks from "../../../../../data/generated/books.json";
import importedBooks from "../../../../../data/source/openlibrary-books.json";
import { StaticBooksRepository } from "../../data/booksRepository";
import { emptyFilters, searchBooks } from "./filters";
import type { Book } from "./types";
import { validateBooks } from "./validation";

describe("connected Open Library catalog", () => {
  it("keeps 200 editorial records first and appends 618 imported books", () => {
    expect(productionBooks).toHaveLength(818);
    expect(productionBooks.slice(200)).toEqual(importedBooks);
  });

  it("passes the current runtime validator", () => {
    const result = validateBooks(productionBooks);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(818);
  });

  it("has stable unique routes and Open Library work provenance", () => {
    const slugs = productionBooks.map((book) => book.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true);

    const workIds = importedBooks.flatMap((book) => [
      ...(book.sourceMetadata?.workIds ?? []),
      ...(!book.sourceMetadata?.workIds?.length && book.sourceMetadata?.workId ? [book.sourceMetadata.workId] : []),
    ]);
    expect(new Set(workIds).size).toBe(workIds.length);
  });

  it("uses only exact permanent book paths and safe cover URLs", () => {
    expect(productionBooks.every((book) => `/books/${book.slug}`.split("?").length === 1)).toBe(true);
    const external = importedBooks.filter((book) => book.cover?.kind === "external");
    expect(external.every((book) => /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-L\.jpg$/.test(book.cover?.url ?? ""))).toBe(true);
    expect(external.every((book) => book.cover?.isbn13 === book.isbn13)).toBe(true);
  });

  it("includes imported books in search and every primary filter", () => {
    const books = productionBooks as Book[];
    const imported = books[200];
    const result = searchBooks(books, {
      ...emptyFilters,
      age: imported.ageMin,
      reading: imported.readingMode,
      genres: [imported.genres[0]],
      themes: [imported.themes[0]],
      search: imported.title,
    });
    expect(result.exact.some(({ book }) => book.id === imported.id)).toBe(true);
  });

  it("opens an imported book by slug and keeps its stable id usable by favorites", async () => {
    const books = productionBooks as Book[];
    const imported = books[200];
    const repository = new StaticBooksRepository(books);
    expect(await repository.getBySlug(imported.slug)).toMatchObject({ id: imported.id });
    const favorites = [imported.id];
    expect(books.filter((book) => favorites.includes(book.id))).toEqual([imported]);
  });
});
