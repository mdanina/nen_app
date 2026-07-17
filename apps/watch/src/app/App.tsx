import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { createWatchRepository } from "../data/watchRepository";
import type { FilterDictionary, WatchTitle } from "../domain/catalog/types";
import { useFavorites } from "../hooks/useFavorites";
import { CatalogPage } from "../pages/CatalogPage";
import { DetailPage } from "../pages/DetailPage";
import { FavoritesPage } from "../pages/FavoritesPage";
import { HomePage } from "../pages/HomePage";
import { CollectionsPage, NotFoundPage, RecommendPage } from "../pages/PlaceholderPages";
import { resolveRoute } from "./routes";
import { shouldResetScroll } from "./navigation";

interface AppData {
  titles: WatchTitle[];
  cartoonDictionary: FilterDictionary;
  movieDictionary: FilterDictionary;
}

const currentLocation = () => `${window.location.pathname}${window.location.search}`;

export function App() {
  const [location, setLocation] = useState(currentLocation);
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { favorites, toggleFavorite } = useFavorites();

  const load = useCallback(() => {
    setError(null);
    setData(null);
    createWatchRepository().then(async (repository) => {
      const [cartoons, movies, cartoonDictionary, movieDictionary] = await Promise.all([
        repository.getAllCartoons(),
        repository.getAllMovies(),
        repository.getFilterDictionary("cartoon"),
        repository.getFilterDictionary("movie"),
      ]);
      setData({ titles: [...cartoons, ...movies], cartoonDictionary, movieDictionary });
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог"));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (href: string) => {
    const previousPathname = window.location.pathname;
    const next = new URL(href, window.location.origin);
    window.history.pushState({}, "", `${next.pathname}${next.search}`);
    setLocation(currentLocation());
    if (shouldResetScroll(previousPathname, next.pathname)) {
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  };

  const url = new URL(location, window.location.origin);
  const route = resolveRoute(url.pathname);
  let page;
  if (error) page = <div className="page narrow"><p className="eyebrow">Ошибка каталога</p><h1>Не удалось загрузить данные</h1><p>{error}</p><button type="button" className="primary-button" onClick={load}>Попробовать снова</button></div>;
  else if (!data) page = <div className="page" role="status" aria-live="polite"><p className="eyebrow">Загрузка</p><h1>Готовим каталог…</h1><div className="skeleton-grid">{[1, 2, 3].map((value) => <div key={value} className="skeleton" />)}</div></div>;
  else {
    const common = { favorites, toggleFavorite, navigate };
    switch (route.kind) {
      case "home": page = <HomePage titles={data.titles} {...common} />; break;
      case "cartoons": page = <CatalogPage contentType="cartoon" titles={data.titles} dictionary={data.cartoonDictionary} search={url.search} {...common} />; break;
      case "movies": page = <CatalogPage contentType="movie" titles={data.titles} dictionary={data.movieDictionary} search={url.search} {...common} />; break;
      case "cartoon-detail": page = <DetailPage slug={route.slug} expectedType="cartoon" titles={data.titles} {...common} />; break;
      case "movie-detail": page = <DetailPage slug={route.slug} expectedType="movie" titles={data.titles} {...common} />; break;
      case "favorites": page = <FavoritesPage titles={data.titles} {...common} />; break;
      case "collections": page = <CollectionsPage navigate={navigate} />; break;
      case "collection-detail": page = <CollectionsPage slug={route.slug} navigate={navigate} />; break;
      case "recommend": page = <RecommendPage navigate={navigate} />; break;
      default: page = <NotFoundPage navigate={navigate} />;
    }
  }

  return <>
    <AppHeader pathname={url.pathname} navigate={navigate} favoriteCount={favorites.length} />
    <main id="main-content">{page}</main>
    <footer className="app-footer"><strong>НЭН смотрим</strong><span>Фильмы и мультфильмы для семейного просмотра</span></footer>
  </>;
}
