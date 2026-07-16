import { useEffect, useState } from "react";
import { SkeletonGrid } from "@nen/ui";
import { Header } from "../components/Header";
import { booksRepository } from "../data/booksRepository";
import type { Book } from "../domain/books/types";
import { useFavorites } from "../hooks/useFavorites";
import { BookDetailPage } from "../pages/BookDetailPage";
import { BooksPage } from "../pages/BooksPage";
import { CollectionDetailPage, CollectionsPage } from "../pages/CollectionsPage";
import { FavoritesPage } from "../pages/FavoritesPage";
import { HomePage } from "../pages/HomePage";
import { RecommendPage } from "../pages/RecommendPage";

const currentRoute = () => window.location.pathname.replace(/\/$/, "") || "/";
export function App() {
  const [route, setRoute] = useState(currentRoute); const [books, setBooks] = useState<Book[] | null>(null); const { favorites, toggle } = useFavorites();
  useEffect(() => { booksRepository.getAll().then(setBooks); }, []);
  useEffect(() => { const pop = () => setRoute(currentRoute()); window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop); }, []);
  const navigate = (path: string) => { window.history.pushState({}, "", path); setRoute(currentRoute()); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  if (!books) return <><Header navigate={navigate} favoriteCount={favorites.length} route={route}/><main className="page"><SkeletonGrid /></main></>;
  const common = { books, favorites, toggleFavorite: toggle, navigate };
  let page;
  if (route === "/") page = <HomePage {...common}/>;
  else if (route === "/books" || route === "/catalog") page = <BooksPage {...common}/>;
  else if (route.startsWith("/books/")) page = <BookDetailPage slug={decodeURIComponent(route.slice(7))} {...common}/>;
  else if (route.startsWith("/catalog/")) page = <BookDetailPage slug={decodeURIComponent(route.slice(9))} {...common}/>;
  else if (route === "/collections") page = <CollectionsPage navigate={navigate}/>;
  else if (route.startsWith("/collections/")) page = <CollectionDetailPage slug={decodeURIComponent(route.slice(13))} {...common}/>;
  else if (route === "/recommend") page = <RecommendPage {...common}/>;
  else if (route === "/favorites") page = <FavoritesPage {...common}/>;
  else page = <section className="page narrow"><p className="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><button className="primary-button" onClick={() => navigate("/")}>На главную</button></section>;
  return <><Header navigate={navigate} favoriteCount={favorites.length} route={route}/><main>{page}</main><footer><strong>НЭН</strong><span>Что почитать с детьми</span><span>Честное медиа для родителей</span></footer></>;
}
