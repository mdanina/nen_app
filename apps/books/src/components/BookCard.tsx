import { Icon } from "@nen/ui";
import type { Book, RankedBook } from "../domain/books/types";
import { AppLink } from "./Link";
import { BookCover } from "./BookCover";

const readingLabels = { independent: "читает сам", together: "читаем вместе", both: "сам или вместе" };
function readingTime(book: Book) { if (book.estimatedReadingMinutes) return `примерно ${book.estimatedReadingMinutes} мин`; return book.lengthLabel ?? ({ "very-short": "короткая история", short: "на один вечер", medium: "на несколько вечеров", long: "длинное чтение" } as const)[book.lengthCategory ?? "short"]; }

export function BookCard({ book, ranked, favorite, toggleFavorite, navigate, compact = false }: { book: Book; ranked?: RankedBook; favorite: boolean; toggleFavorite: () => void; navigate: (path: string) => void; compact?: boolean }) {
  return <article className={`book-card${compact ? " book-card--compact" : ""}`}>
    <div className="book-card__visual"><AppLink href={`/books/${book.slug}`} navigate={navigate}><BookCover book={book} /></AppLink><button className={`favorite-button${favorite ? " is-active" : ""}`} onClick={toggleFavorite} aria-label={favorite ? `Удалить «${book.title}» из избранного` : `Добавить «${book.title}» в избранное`} aria-pressed={favorite}><Icon name="heart" /></button></div>
    <div className="book-card__body"><div className="book-card__meta"><span>{book.ageLabel}</span><span>{readingLabels[book.readingMode]}</span>{readingTime(book) && <span>{readingTime(book)}</span>}</div><h2><AppLink href={`/books/${book.slug}`} navigate={navigate}>{book.title}</AppLink></h2><p className="book-card__author">{book.author}</p>{!compact && <><p className="book-card__description">{book.shortDescription}</p><div className="why"><strong>Почему рекомендуем</strong><p>{book.whyRecommended}</p></div>{book.themes.length > 0 && <div className="tag-row" aria-label="Темы книги">{book.themes.slice(0, 3).map((theme) => <span key={theme}>{theme}</span>)}</div>}{ranked && ranked.relaxed.length > 0 && <div className="match-note"><strong>Что совпало:</strong> {ranked.matched.length ? ranked.matched.join(", ") : "возраст"}. <strong>Чем отличается от запроса:</strong> {ranked.relaxed.join(", ")}.</div>}</>}
      <AppLink className="text-link" href={`/books/${book.slug}`} navigate={navigate}>О книге <Icon name="arrow" /></AppLink>
    </div>
  </article>;
}
