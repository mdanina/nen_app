import { describe, expect, it } from "vitest";
import curatedSource from "../../../../../data/source/curated-publisher-books.json";

describe("curated publisher catalog", () => {
  it("содержит не менее 150 новых художественных книг", () => {
    expect(curatedSource.books.length).toBeGreaterThanOrEqual(150);
    expect(curatedSource.books.every((book) => !/(нон-фикшн|энциклоп|учебн|пособ)/iu.test(book.sourceMetadata.publisherGenre))).toBe(true);
  });

  it("сохраняет обязательные данные и официальный источник аннотации", () => {
    for (const book of curatedSource.books) {
      expect(book.title).toBeTruthy();
      expect(book.authors.length).toBeGreaterThan(0);
      expect(book.publisher).toBeTruthy();
      expect(book.ageMin).toBeTypeOf("number");
      expect(book.ageMax).toBeTypeOf("number");
      expect(book.genres.length).toBeGreaterThan(0);
      expect(book.themes.length).toBeGreaterThan(0);
      expect(book.shortDescription.length).toBeGreaterThan(40);
      expect(book.cover.url).toMatch(/^https:\/\//);
      expect(book.annotationProvenance.method).toBe("official_publisher_description");
      expect(book.annotationProvenance.sourceUrl).toMatch(/^https:\/\/samokatbook\.ru\/book\//);
      expect(book).not.toHaveProperty("originalTitle");
    }
  });

  it("не содержит повторяющихся ISBN и сочетаний названия с автором", () => {
    const isbn = curatedSource.books.map((book) => book.isbn13);
    const titleAuthor = curatedSource.books.map((book) => `${book.title.toLocaleLowerCase("ru")}|${book.authors.join(";").toLocaleLowerCase("ru")}`);
    expect(new Set(isbn).size).toBe(isbn.length);
    expect(new Set(titleAuthor).size).toBe(titleAuthor.length);
  });
});
