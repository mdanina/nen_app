import type { ReadonlyRepository, ValidationIssue } from "@nen/data-core";
import { href } from "../app/routes";
import { searchBooks } from "../domain/books/filters";
import { getSimilarBooks } from "../domain/books/similarity";
import type { Book, BookFilters, BookSearchResult } from "../domain/books/types";
import { validateBooks } from "../domain/books/validation";

// Каталог не входит в JS-бандл: индекс списка и полная карточка книги приезжают
// отдельными файлами. Иначе человек, открывший одну книгу, скачивает все 2500.
const INDEX_URL = href("/data/catalog-index.json");
const bookUrl = (slug: string) => href(`/data/books/${encodeURIComponent(slug)}.json`);

export interface BooksRepository extends ReadonlyRepository<Book, BookFilters, BookSearchResult> {
  getSimilar(bookId: string): Promise<Book[]>;
  getIssues(): ValidationIssue[];
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

export class StaticBooksRepository implements BooksRepository {
  private books: Book[] = [];
  private issues: ValidationIssue[] = [];
  private loading: Promise<Book[]> | null = null;
  private readonly details = new Map<string, Book>();

  private readonly load: () => Promise<unknown>;
  // Готовый массив принимается для тестов и превью: тогда каталог уже полный
  // и подгружать карточку книги отдельным файлом не нужно.
  private readonly indexIsComplete: boolean;

  constructor(source: unknown = () => fetchJson(INDEX_URL)) {
    this.indexIsComplete = typeof source !== "function";
    this.load = typeof source === "function" ? (source as () => Promise<unknown>) : async () => source;
  }

  async getAll() {
    if (!this.loading) {
      this.loading = this.load().then((input) => {
        const validated = validateBooks(input);
        this.books = validated.items;
        this.issues = validated.issues;
        return this.books;
      });
    }
    return this.loading;
  }

  /** Карточка списка несёт выдержку описания; полный текст догружается страницей книги. */
  async getBySlug(slug: string) {
    const cached = this.details.get(slug);
    if (cached) return cached;
    const books = await this.getAll();
    const indexed = books.find((book) => book.slug === slug);
    if (!indexed || this.indexIsComplete) return indexed ?? null;
    try {
      const detailed = (await fetchJson(bookUrl(slug))) as Book;
      this.details.set(slug, detailed);
      return detailed;
    } catch {
      // Сеть подвела — показываем то, что уже есть в индексе, вместо страницы «не найдено».
      return indexed;
    }
  }

  async search(query: BookFilters) { return searchBooks(await this.getAll(), query); }

  async getSimilar(bookId: string) {
    const books = await this.getAll();
    const source = books.find((book) => book.id === bookId);
    return source ? getSimilarBooks(source, books).map((item) => item.book) : [];
  }

  getIssues() { return this.issues; }
}

export const booksRepository = new StaticBooksRepository();
