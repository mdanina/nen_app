import type { Book } from "../domain/books/types";
import { useSeo } from "../hooks/useSeo";
import { BookCard } from "../components/BookCard";
import { AppLink } from "../components/Link";
import { collections } from "../data/collections";

export function HomePage({ books, favorites, toggleFavorite, navigate }: { books: Book[]; favorites: string[]; toggleFavorite: (id:string)=>void; navigate:(path:string)=>void }) {
  useSeo("Что почитать с детьми — рекомендации НЭН", "Книги для совместного и самостоятельного чтения по возрасту, интересам и состоянию ребёнка.", "/");
  const featured = books.filter((book) => book.featured).slice(0,4); const visible = featured.length ? featured : books.slice(0,4);
  return <><section className="home-hero"><div><p className="eyebrow">Книжный сервис НЭН</p><h1>Что почитать <em>с детьми</em></h1><p className="lead">Выбирайте книги по возрасту, интересам и ситуации — без бесконечного листания и случайных советов.</p><div className="hero-actions"><AppLink href="/recommend" navigate={navigate} className="primary-link">Подобрать книгу</AppLink><AppLink href="/books" navigate={navigate} className="secondary-link">Открыть каталог</AppLink></div></div><div className="hero-note"><span>✦</span><strong>Рекомендации с объяснением</strong><p>Рассказываем, кому подходит книга, почему мы её выбрали и о чём можно поговорить после чтения.</p></div></section>
    <section className="section"><header className="section-heading"><div><p className="eyebrow">Начать с готовой темы</p><h2>Редакционные подборки</h2></div><AppLink href="/collections" navigate={navigate}>Все подборки →</AppLink></header><div className="collection-grid">{collections.map((collection,index) => <AppLink key={collection.slug} href={`/collections/${collection.slug}`} navigate={navigate} className={`collection-tile tile-${index}`}><small>{collection.ageLabel}</small><h3>{collection.title}</h3><p>{collection.description}</p><span>{collection.bookIds.length} рекомендаций</span></AppLink>)}</div></section>
    <section className="section section--white"><header className="section-heading"><div><p className="eyebrow">Выбор редакции</p><h2>Книги, с которых можно начать</h2></div><AppLink href="/books" navigate={navigate}>Весь каталог →</AppLink></header><div className="book-grid">{visible.map((book) => <BookCard key={book.id} book={book} favorite={favorites.includes(book.id)} toggleFavorite={() => toggleFavorite(book.id)} navigate={navigate} compact />)}</div></section></>;
}
