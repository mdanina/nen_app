import type { Book } from "../domain/books/types";
import { useSeo } from "../hooks/useSeo";
import { BookCard } from "../components/BookCard";
import { AppLink } from "../components/Link";
import { collections } from "../data/collections";
import { collectionPath, href, ROUTES } from "../app/routes";
import { plural, RECOMMENDATIONS } from "../domain/books/plural";

export function HomePage({ books, favorites, toggleFavorite, navigate }: { books: Book[]; favorites: string[]; toggleFavorite: (id:string)=>void; navigate:(path:string)=>void }) {
  useSeo("Что почитать с детьми — рекомендации НЭН", "Книги для детей по возрасту, интересам и настроению ребёнка.", ROUTES.home);
  const featured = books.filter((book) => book.featured).slice(0,4); const visible = featured.length ? featured : books.slice(0,4);
  return <><section className="home-hero"><div><h1>Что почитать <em>с детьми</em></h1><p className="lead">Подберём книги по возрасту, интересам и настроению ребёнка.</p><div className="hero-actions"><AppLink href={ROUTES.recommend} navigate={navigate} className="primary-link">Подобрать книгу</AppLink><AppLink href={ROUTES.catalog} navigate={navigate} className="secondary-link">Перейти в каталог</AppLink></div></div><div className="hero-note"><span>✦</span><strong>Почему рекомендуем</strong><p>Для каждой книги рассказываем, кому она может подойти и о чём можно поговорить после чтения.</p></div></section>
    <section className="section"><header className="section-heading"><h2>Подборки НЭН</h2><AppLink href={ROUTES.collections} navigate={navigate}>Все подборки →</AppLink></header><div className="collection-grid">{collections.map((collection,index) => <AppLink key={collection.slug} href={collectionPath(collection.slug)} navigate={navigate} className={`collection-tile tile-tone-${index % 4}`}><small>{collection.ageLabel}</small><h3>{collection.title}</h3><p>{collection.description}</p><span>{plural(collection.bookIds.length, RECOMMENDATIONS)}</span><img className="collection-tile__logo" src={href("/brand/nen-logo.png")} alt="" aria-hidden="true"/></AppLink>)}</div></section>
    <section className="section section--white"><header className="section-heading"><h2>Книги, с которых можно начать</h2><AppLink href={ROUTES.catalog} navigate={navigate}>Весь каталог →</AppLink></header><div className="book-grid">{visible.map((book) => <BookCard key={book.id} book={book} favorite={favorites.includes(book.id)} toggleFavorite={() => toggleFavorite(book.id)} navigate={navigate} compact />)}</div></section></>;
}
