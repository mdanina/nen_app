import { useEffect, useState } from "react";
import { EmptyState } from "@nen/ui";
import { bookPath, collectionPath, ROUTES } from "../app/routes";
import { BookCard } from "../components/BookCard";
import { BookCover } from "../components/BookCover";
import { BookShareButton } from "../components/BookShareButton";
import { AppLink } from "../components/Link";
import { booksRepository } from "../data/booksRepository";
import { collections } from "../data/collections";
import { getPublicOfficialAgeRating } from "../domain/books/ageRating";
import { PAGES, plural } from "../domain/books/plural";
import { bookDescriptionTag, bookTitleTag } from "../domain/books/seo";
import { getSimilarBooks } from "../domain/books/similarity";
import type { Book } from "../domain/books/types";
import { useSeo } from "../hooks/useSeo";

const readingLabels = {
  independent: "Для самостоятельного чтения",
  together: "Для чтения со взрослым",
  both: "Можно читать самостоятельно или вместе",
};

const difficultyLabels = { easy: "простой", medium: "средний", advanced: "сложный" };

export function BookDetailPage({ slug, books, favorites, toggleFavorite, navigate }: { slug: string; books: Book[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: (path: string) => void }) {
  const indexed = books.find((item) => item.slug === slug);
  // Индекс списка несёт выдержку описания; полный текст и выходные данные догружаем.
  const [detailed, setDetailed] = useState<Book | null>(null);
  useEffect(() => {
    let current = true;
    setDetailed(null);
    booksRepository.getBySlug(slug).then((value) => { if (current) setDetailed(value); });
    return () => { current = false; };
  }, [slug]);

  const book = detailed ?? indexed;
  useSeo(
    book ? bookTitleTag(book) : "Книга не найдена — НЭН",
    book ? bookDescriptionTag(book) : "Книга не найдена.",
    book ? bookPath(book.slug) : ROUTES.catalog,
    !book,
    book ? "book" : "website",
  );

  if (!book) {
    return <section className="page">
      <EmptyState title="Книга не найдена" action={<button className="primary-button" onClick={() => navigate(ROUTES.catalog)}>Перейти в каталог</button>}>
        <p>Возможно, ссылка устарела или книга пока недоступна в каталоге.</p>
      </EmptyState>
    </section>;
  }

  const similar = getSimilarBooks(book, books, 4);
  const included = collections.filter((collection) => collection.bookIds.includes(book.id));
  const officialAgeRating = getPublicOfficialAgeRating(book);
  const description = book.fullDescription || book.shortDescription;
  const isFavorite = favorites.includes(book.id);
  const volume = book.lengthLabel ?? (book.pages ? plural(book.pages, PAGES) : "");

  return <>
    <section className="detail-page">
      <nav className="breadcrumbs" aria-label="Хлебные крошки">
        <AppLink href={ROUTES.catalog} navigate={navigate}>Каталог</AppLink>
        <span>/</span>
        <span>{book.title}</span>
      </nav>
      <div className="detail-hero">
        <div className="detail-cover">
          <BookCover book={book} large />
          {book.cover?.attribution && <p className="cover-attribution">{book.cover.attribution}</p>}
          <button className={`save-large${isFavorite ? " active" : ""}`} onClick={() => toggleFavorite(book.id)} aria-pressed={isFavorite}>
            {isFavorite ? "В избранном" : "Сохранить в избранное"}
          </button>
          <BookShareButton slug={book.slug} title={book.title} />
        </div>
        <div>
          <p className="eyebrow">Возрастная рекомендация НЭН · {book.ageLabel}</p>
          <h1>{book.title}</h1>
          {book.originalTitle && <p className="original-title">{book.originalTitle}</p>}
          <p className="detail-author">{book.author}</p>
          {book.shortDescription && <p className="detail-lead">{book.shortDescription}</p>}
          <div className="detail-why">
            <small>Почему рекомендуем</small>
            <p>{book.whyRecommended}</p>
          </div>
          <dl className="quick-facts">
            <div><dt>Формат чтения</dt><dd>{readingLabels[book.readingMode]}</dd></div>
            {volume && <div>
              <dt>Объём чтения</dt>
              <dd>{volume}{book.pages && book.lengthLabel ? ` · ${book.pages} стр.` : ""}</dd>
            </div>}
            {book.languageDifficulty && <div><dt>Сложность языка</dt><dd>{difficultyLabels[book.languageDifficulty]}</dd></div>}
          </dl>
        </div>
      </div>
    </section>

    <section className="detail-info">
      {description && <div><h2>О книге</h2><p>{description}</p></div>}
      <div className="detail-sidebar">
        {book.themes.length > 0 && <Fact title="Темы" values={book.themes} />}
        {book.genres.length > 0 && <Fact title="Жанры" values={book.genres} />}
        {book.moods.length > 0 && <Fact title="Настроение" values={book.moods} />}
        {(book.publisher || book.publicationYear || book.seriesName || book.translator) && <div>
          <h3>Издание</h3>
          {book.publisher && <p>{book.publisher}</p>}
          {book.publicationYear && <p>{book.publicationYear} год</p>}
          {book.seriesName && <p>Серия «{book.seriesName}»</p>}
          {book.translator && <p>Перевод: {book.translator}</p>}
        </div>}
        {book.sensitiveTopics.length > 0 && <Fact title="Чувствительные темы" values={book.sensitiveTopics} />}
        {officialAgeRating && book.officialAgeRatingSource && <div>
          <h3>Официальная возрастная маркировка</h3>
          <p>{officialAgeRating}</p>
          <a href={book.officialAgeRatingSource} target="_blank" rel="noreferrer">Источник</a>
        </div>}
      </div>
    </section>

    {included.length > 0 && <section className="section">
      <header className="section-heading"><h2>В подборках НЭН</h2></header>
      <div className="inline-collections">
        {included.map((collection) => (
          <AppLink key={collection.slug} href={collectionPath(collection.slug)} navigate={navigate}>
            {collection.title}<span>{collection.description}</span>
          </AppLink>
        ))}
      </div>
    </section>}

    {similar.length > 0 && <section className="section section--white">
      <header className="section-heading">
        <div><p className="eyebrow">Похожий возраст и темы</p><h2>Похожие книги</h2></div>
      </header>
      <div className="book-grid">
        {similar.map(({ book: other, reasons }) => (
          <div key={other.id}>
            <BookCard book={other} favorite={favorites.includes(other.id)} toggleFavorite={() => toggleFavorite(other.id)} navigate={navigate} compact />
            <p className="similar-reason">Почему похожа: {reasons.slice(0, 2).join(", ")}.</p>
          </div>
        ))}
      </div>
    </section>}
  </>;
}

function Fact({ title, values }: { title: string; values: string[] }) {
  return <div>
    <h3>{title}</h3>
    <div className="tag-row">{values.map((value) => <span key={value}>{value}</span>)}</div>
  </div>;
}
