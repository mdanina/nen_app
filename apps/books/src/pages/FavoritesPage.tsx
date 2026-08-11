import { EmptyState } from "@nen/ui";
import { BookCard } from "../components/BookCard";
import type { Book } from "../domain/books/types";
import { useSeo } from "../hooks/useSeo";
import { ROUTES } from "../app/routes";
export function FavoritesPage({books,favorites,toggleFavorite,navigate}:{books:Book[];favorites:string[];toggleFavorite:(id:string)=>void;navigate:(path:string)=>void}){useSeo("Избранное — НЭН","Сохранённые книги и рекомендации НЭН.",ROUTES.favorites,true);const selected=books.filter((book)=>favorites.includes(book.id));return <section className="page"><header className="page-header"><p className="eyebrow">Избранное хранится только на этом устройстве</p><h1>Избранное</h1><p>Книги, к которым вы хотите вернуться позже.</p></header>{selected.length?<div className="book-grid">{selected.map((book)=><BookCard key={book.id} book={book} favorite toggleFavorite={()=>toggleFavorite(book.id)} navigate={navigate}/>)}</div>:<EmptyState title="Здесь пока пусто" action={<button className="primary-button" onClick={()=>navigate(ROUTES.catalog)}>Перейти в каталог</button>}><p>Нажмите на сердечко у книги — она появится здесь.</p></EmptyState>}</section>}
