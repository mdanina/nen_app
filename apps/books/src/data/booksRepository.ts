import type { ReadonlyRepository, ValidationIssue } from "@nen/data-core";
import rawBooks from "../../../../data/generated/books.json";
import { searchBooks } from "../domain/books/filters";
import { getSimilarBooks } from "../domain/books/similarity";
import type { Book, BookFilters, BookSearchResult } from "../domain/books/types";
import { validateBooks } from "../domain/books/validation";

export interface BooksRepository extends ReadonlyRepository<Book, BookFilters, BookSearchResult> {
  getSimilar(bookId: string): Promise<Book[]>;
  getIssues(): ValidationIssue[];
}

export class StaticBooksRepository implements BooksRepository {
  private readonly books: Book[];
  private readonly issues: ValidationIssue[];
  constructor(input: unknown = rawBooks) {
    const validated = validateBooks(input);
    this.books = validated.items;
    this.issues = validated.issues;
  }
  async getAll() { return this.books; }
  async getBySlug(slug: string) { return this.books.find((book) => book.slug === slug) ?? null; }
  async search(query: BookFilters) { return searchBooks(this.books, query); }
  async getSimilar(bookId: string) { const source = this.books.find((book) => book.id === bookId); return source ? getSimilarBooks(source, this.books).map((item) => item.book) : []; }
  getIssues() { return this.issues; }
}

export const booksRepository = new StaticBooksRepository();
