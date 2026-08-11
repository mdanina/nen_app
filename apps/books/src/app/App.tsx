import { useEffect, useLayoutEffect, useState } from "react";
import { SkeletonGrid } from "@nen/ui";
import { Header } from "../components/Header";
import { booksRepository } from "../data/booksRepository";
import type { Book } from "../domain/books/types";
import { useFavorites } from "../hooks/useFavorites";
import { useSeo } from "../hooks/useSeo";
import { BookDetailPage } from "../pages/BookDetailPage";
import { BooksPage } from "../pages/BooksPage";
import { CollectionDetailPage, CollectionsPage } from "../pages/CollectionsPage";
import { FavoritesPage } from "../pages/FavoritesPage";
import { HomePage } from "../pages/HomePage";
import { RecommendPage } from "../pages/RecommendPage";
import { href, ROUTES, toRoute } from "./routes";
import { resetScrollPosition } from "./scroll";

const currentRoute = () => toRoute(window.location.pathname);

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [books, setBooks] = useState<Book[] | null>(null);
  const { favorites, toggle } = useFavorites();

  useEffect(() => { booksRepository.getAll().then(setBooks).catch(() => setBooks([])); }, []);
  useEffect(() => {
    const pop = () => setRoute(currentRoute());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useLayoutEffect(() => { resetScrollPosition(); }, [route]);

  const navigate = (path: string) => {
    window.history.pushState({}, "", href(path));
    setRoute(toRoute(href(path)));
  };

  if (!books) {
    return <>
      <Header navigate={navigate} favoriteCount={favorites.length} route={route} />
      <main className="page"><SkeletonGrid /></main>
    </>;
  }

  const common = { books, favorites, toggleFavorite: toggle, navigate };
  const bookSlug = route.startsWith(`${ROUTES.book}/`) ? decodeURIComponent(route.slice(ROUTES.book.length + 1)) : null;
  const collectionSlug = route.startsWith(`${ROUTES.collections}/`) ? decodeURIComponent(route.slice(ROUTES.collections.length + 1)) : null;

  let page;
  if (route === ROUTES.home) page = <HomePage {...common} />;
  else if (route === ROUTES.catalog) page = <BooksPage {...common} />;
  else if (bookSlug) page = <BookDetailPage slug={bookSlug} {...common} />;
  else if (route === ROUTES.collections) page = <CollectionsPage navigate={navigate} />;
  else if (collectionSlug) page = <CollectionDetailPage slug={collectionSlug} {...common} />;
  else if (route === ROUTES.recommend) page = <RecommendPage {...common} />;
  else if (route === ROUTES.favorites) page = <FavoritesPage {...common} />;
  else page = <NotFoundPage navigate={navigate} />;

  return <>
    <Header navigate={navigate} favoriteCount={favorites.length} route={route} />
    <main>{page}</main>
    <footer>
      <strong>НЭН</strong>
      <span>Что почитать с детьми</span>
      <span>Честное медиа для родителей</span>
    </footer>
  </>;
}

function NotFoundPage({ navigate }: { navigate: (path: string) => void }) {
  useSeo("Страница не найдена — НЭН", "Такой страницы нет. Вернитесь на главную книжного сервиса НЭН.", toRoute(window.location.pathname), true);
  return <section className="page narrow">
    <p className="eyebrow">Такой страницы нет</p>
    <h1>Страница не найдена</h1>
    <button className="primary-button" onClick={() => navigate(ROUTES.home)}>Вернуться на главную</button>
  </section>;
}
