import { useEffect, useMemo, useState } from "react";
import { Icon } from "@nen/ui";
import { href, ROUTES } from "../app/routes";
import { BookCard } from "../components/BookCard";
import { BookFilters } from "../components/BookFilters";
import type { Book, BookFilters as Filters } from "../domain/books/types";
import { emptyFilters, searchBooks } from "../domain/books/filters";
import { BOOKS, plural, pluralForm } from "../domain/books/plural";
import { filtersFromUrl, filtersToUrl } from "../domain/books/url";
import { useSeo } from "../hooks/useSeo";

const PAGE_SIZE = 24;

const readingLabels = {
  independent: "самостоятельно",
  together: "читаем вместе",
  both: "подойдёт и для самостоятельного, и для совместного чтения",
};

export function BooksPage({ books, favorites, toggleFavorite, navigate }: { books: Book[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: (path: string) => void }) {
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl(window.location.search));
  const [input, setInput] = useState(filters.search);
  const [sheet, setSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useSeo("Каталог детских книг — НЭН", "Книги для детей по возрасту, темам, настроению и формату чтения.", ROUTES.catalog, Boolean(window.location.search));

  useEffect(() => {
    const query = filtersToUrl(filters);
    window.history.replaceState({}, "", `${href(ROUTES.catalog)}${query ? `?${query}` : ""}`);
    setLimit(PAGE_SIZE);
  }, [filters]);

  useEffect(() => {
    const handler = () => {
      const next = filtersFromUrl(window.location.search);
      setFilters(next);
      setInput(next.search);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  useEffect(() => {
    if (input === filters.search) return;
    const timer = setTimeout(() => setFilters((current) => ({ ...current, search: input })), 250);
    return () => clearTimeout(timer);
  }, [input, filters.search]);

  useEffect(() => {
    document.body.classList.toggle("sheet-open", sheet);
    return () => document.body.classList.remove("sheet-open");
  }, [sheet]);

  const result = useMemo(() => searchBooks(books, filters), [books, filters]);
  const shown = result.exact.length ? result.exact : result.nearby;
  const active = filters.age !== null || filters.reading || filters.lengths.length || filters.genres.length || filters.themes.length || filters.publishers.length || filters.moods.length || filters.difficulty || filters.search;
  const clear = () => { setFilters(emptyFilters); setInput(""); };

  const labels = [
    filters.age !== null ? `${filters.age} лет` : "",
    filters.reading ? readingLabels[filters.reading] : "",
    ...filters.themes, ...filters.genres, ...filters.publishers, ...filters.moods, ...filters.lengths,
  ].filter(Boolean);

  return <section className="catalog-page">
    <header className="catalog-header">
      <div className="catalog-header__intro">
        <p className="eyebrow">{plural(books.length, BOOKS)} в каталоге</p>
        <h1>Каталог книг</h1>
        <p>Ищите по названию, автору или теме. Фильтры применяются сразу и сохраняются в ссылке.</p>
      </div>
      <div className="catalog-header__brand" aria-hidden="true">
        <img className="catalog-header__brand-logo" src={href("/brand/nen-logo-display.png")} alt="" />
      </div>
      <div className="catalog-header__tools">
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">Поиск книг</span>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Например: перед сном или про дружбу" />
          {input && <button onClick={() => setInput("")} aria-label="Очистить поиск"><Icon name="close" /></button>}
        </label>
        <div className="search-hints">
          <span>Попробуйте:</span>
          {["перед сном", "дружба", "животные"].map((query) => <button key={query} onClick={() => setInput(query)}>{query}</button>)}
        </div>
        {labels.length > 0 && <div className="active-filters" aria-label="Активные фильтры">
          {labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          <button onClick={clear}>Сбросить</button>
        </div>}
      </div>
    </header>

    <div className="catalog-shell">
      <aside className="desktop-filters">
        <BookFilters books={books} filters={filters} update={setFilters} clear={clear} />
      </aside>
      <div className="results">
        <div className="results-bar">
          <p aria-live="polite"><strong>{shown.length}</strong> {pluralForm(shown.length, BOOKS)}</p>
          <button className="filter-trigger" onClick={() => setSheet(true)}><Icon name="filter" />Фильтры{active && <i />}</button>
        </div>
        {!result.exact.length && <div className="nearby-notice" role="status">
          <strong>Ближайшие варианты</strong>
          <p>{result.explanation}</p>
        </div>}
        <div className="book-grid">
          {shown.slice(0, limit).map((ranked) => (
            <BookCard
              key={ranked.book.id}
              book={ranked.book}
              ranked={!result.exact.length ? ranked : undefined}
              favorite={favorites.includes(ranked.book.id)}
              toggleFavorite={() => toggleFavorite(ranked.book.id)}
              navigate={navigate}
            />
          ))}
        </div>
        {shown.length > limit && <button className="load-more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Показать ещё</button>}
      </div>
    </div>

    {sheet && <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(false); }}>
      <div className="filter-sheet" role="dialog" aria-modal="true" aria-label="Фильтры каталога">
        <BookFilters books={books} filters={filters} update={setFilters} clear={clear} close={() => setSheet(false)} />
      </div>
    </div>}
  </section>;
}
