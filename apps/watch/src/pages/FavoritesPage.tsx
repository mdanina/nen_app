import type { Navigate } from "../components/Link";
import { Link } from "../components/Link";
import { MediaCard } from "../components/MediaCard";
import type { WatchTitle } from "../domain/catalog/types";

export function FavoritesPage({ titles, favorites, toggleFavorite, navigate }: { titles: WatchTitle[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: Navigate }) {
  const items = favorites.map((id) => titles.find((title) => title.id === id)).filter((title): title is WatchTitle => Boolean(title));
  return <div className="page"><header className="page-intro"><p className="eyebrow">Сохранённое</p><h1>Избранное</h1><p>Здесь хранятся только выбранные вами фильмы и мультфильмы.</p></header>{items.length ? <div className="media-grid">{items.map((title) => <MediaCard key={title.id} title={title} favorite toggleFavorite={toggleFavorite} navigate={navigate} />)}</div> : <div className="notice empty"><strong>В избранном пока пусто</strong><p>Добавьте произведение из каталога — оно сохранится на этом устройстве.</p><Link href="/cartoons" navigate={navigate} className="primary-link">Открыть мультфильмы</Link></div>}</div>;
}
