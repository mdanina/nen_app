import { EmptyState } from "@nen/ui";
import { BookCard } from "../components/BookCard";
import { AppLink } from "../components/Link";
import { collections } from "../data/collections";
import type { Book } from "../domain/books/types";
import { useSeo } from "../hooks/useSeo";

function bookCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? "книг"
    : lastDigit === 1
      ? "книга"
      : lastDigit >= 2 && lastDigit <= 4
        ? "книги"
        : "книг";

  return `${count} ${noun}`;
}

export function CollectionsPage({navigate}:{navigate:(path:string)=>void}){useSeo("Подборки НЭН","Редакционные подборки детских книг для разных возрастов и семейных запросов.","/collections");return <section className="page"><header className="page-header"><p className="eyebrow">Редакционный выбор</p><h1>Подборки НЭН</h1><p>Не просто списки книг, а рекомендации с объяснением для разных семейных запросов.</p></header><div className="collections-list">{collections.map((collection,index)=><AppLink key={collection.slug} href={`/collections/${collection.slug}`} navigate={navigate} className={`collection-row collection-tile tile-tone-${index % 4}`}><small>{collection.ageLabel} · обновлено {new Date(collection.updatedAt).toLocaleDateString("ru")}</small><h2>{collection.title}</h2><p>{collection.description}</p><span>{bookCountLabel(collection.bookIds.length)}</span><img className="collection-tile__logo" src="/brand/nen-logo.png" alt="" aria-hidden="true"/></AppLink>)}</div></section>}
export function CollectionDetailPage({slug,books,favorites,toggleFavorite,navigate}:{slug:string;books:Book[];favorites:string[];toggleFavorite:(id:string)=>void;navigate:(path:string)=>void}){const collection=collections.find((item)=>item.slug===slug);useSeo(collection?`${collection.title} — подборка НЭН`:"Подборка не найдена",collection?.description??"Подборка не найдена",collection?`/collections/${collection.slug}`:"/collections",!collection);if(!collection)return <section className="page"><EmptyState title="Подборка не найдена"><AppLink href="/collections" navigate={navigate}>Все подборки НЭН</AppLink></EmptyState></section>;const selected=collection.bookIds.map((id)=>books.find((book)=>book.id===id)).filter((book):book is Book=>Boolean(book));return <section className="page collection-detail"><nav className="breadcrumbs"><AppLink href="/collections" navigate={navigate}>Подборки НЭН</AppLink><span>/</span><span>{collection.title}</span></nav><header><p className="eyebrow">{collection.ageLabel} · {selected.length} рекомендаций</p><h1>{collection.title}</h1><p className="lead">{collection.description}</p><div className="collection-intro">{collection.introduction}</div>{collection.sourceUrl&&<p><a href={collection.sourceUrl} target="_blank" rel="noreferrer">Исходная подборка на сайте НЭН</a></p>}</header><div className="book-grid">{selected.map((book)=><BookCard key={book.id} book={book} favorite={favorites.includes(book.id)} toggleFavorite={()=>toggleFavorite(book.id)} navigate={navigate}/>)}</div><p className="updated">Обновлено {new Date(collection.updatedAt).toLocaleDateString("ru")}</p></section>}
