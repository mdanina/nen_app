import { useEffect, useState } from "react";
import { ContentCard, Header } from "./components";
import { useFavorites } from "./hooks/useFavorites";
import { contentItems } from "./lib/content";
import { CatalogPage } from "./pages/CatalogPage";
import { CollectionDetailPage, CollectionsPage } from "./pages/CollectionsPage";
import { DetailPage } from "./pages/DetailPage";
import { HomePage } from "./pages/HomePage";
import { RecommendPage } from "./pages/RecommendPage";

function getRoute() { return window.location.pathname.replace(/\/$/, "") || "/"; }

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const { favorites, toggle } = useFavorites();
  const navigate = (path: string) => { window.history.pushState({}, "", path); setRoute(getRoute()); window.scrollTo({ top: 0, behavior: "smooth" }); };
  useEffect(() => { const onPop = () => setRoute(getRoute()); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);

  const common = { favorites, toggle, navigate };
  let page;
  if (route === "/") page = <HomePage {...common} />;
  else if (route === "/books" || route === "/catalog") page = <CatalogPage type="book" {...common} />;
  else if (route === "/cartoons") page = <CatalogPage type="cartoon" {...common} />;
  else if (route === "/movies") page = <CatalogPage type="movie" {...common} />;
  else if (route.startsWith("/books/")) page = <DetailPage type="book" slug={decodeURIComponent(route.slice(7))} {...common} />;
  else if (route.startsWith("/cartoons/")) page = <DetailPage type="cartoon" slug={decodeURIComponent(route.slice(10))} {...common} />;
  else if (route.startsWith("/movies/")) page = <DetailPage type="movie" slug={decodeURIComponent(route.slice(8))} {...common} />;
  else if (route.startsWith("/catalog/")) page = <DetailPage slug={decodeURIComponent(route.slice(9))} {...common} />;
  else if (route === "/collections") page = <CollectionsPage navigate={navigate} />;
  else if (route.startsWith("/collections/")) page = <CollectionDetailPage slug={decodeURIComponent(route.slice(13))} {...common} />;
  else if (route === "/recommend") page = <RecommendPage {...common} />;
  else if (route === "/favorites") page = <FavoritesPage {...common} />;
  else page = <NotFound navigate={navigate} />;

  return <><Header favoriteCount={favorites.length} navigate={navigate} /><main>{page}</main><Footer /></>;
}

function FavoritesPage({ favorites, toggle, navigate }: { favorites: string[]; toggle: (id: string) => void; navigate: (path: string) => void }) {
  const items = contentItems.filter((item) => favorites.includes(item.id));
  return <section className="catalog-page"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><span>/</span><span>Избранное</span></div><header className="catalog-intro"><div className="eyebrow">Сохранено на этом устройстве</div><h1>Избранное</h1><p>Книги, мультфильмы и фильмы, к которым вы хотите вернуться.</p></header>{items.length ? <div className="catalog-grid">{items.map((item) => <ContentCard key={item.id} content={item} favorite toggleFavorite={() => toggle(item.id)} navigate={navigate} />)}</div> : <div className="empty-state"><h2>Здесь пока пусто</h2><p>Нажмите на сердечко у произведения — оно появится здесь.</p></div>}</section>;
}

function NotFound({ navigate }: { navigate: (path: string) => void }) { return <section className="section"><div className="empty-state"><h1>Страница не найдена</h1><button onClick={() => navigate("/")}>На главную</button></div></section>; }
function Footer() { return <footer><div className="logo logo--footer" aria-label="НЭН"><span>Н</span><span>Э</span><span>Н</span></div><p>Честное медиа для родителей</p><p>Книги · Мультфильмы · Фильмы · Подборки</p></footer>; }
