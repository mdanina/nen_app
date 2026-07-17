import type { WatchTitle } from "../domain/catalog/types";
import type { ConditionExplanation } from "../domain/catalog/ranking";
import { Link, type Navigate } from "./Link";

export const durationLabel = (title: WatchTitle) => title.duration.kind === "standalone"
  ? `${title.duration.minutes} мин`
  : `${title.duration.episodeMinutes} мин/серия${title.duration.episodeCount ? ` · ${title.duration.episodeCount} серий` : ""}`;

export const typeLabel = (title: WatchTitle) => title.contentType === "cartoon" ? "Мультфильм" : "Фильм";
export const detailHref = (title: WatchTitle) => `/${title.contentType === "cartoon" ? "cartoons" : "movies"}/${encodeURIComponent(title.slug)}`;

export function MediaCard({ title, favorite, toggleFavorite, navigate, matched = [], relaxed = [] }: {
  title: WatchTitle;
  favorite: boolean;
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
  matched?: ConditionExplanation[];
  relaxed?: ConditionExplanation[];
}) {
  return <article className="media-card">
    <div className={`poster-placeholder ${title.contentType}`} aria-hidden="true"><span>{title.contentType === "cartoon" ? "✦" : "▶"}</span></div>
    <div className="card-body">
      <div className="card-kicker"><span>{typeLabel(title)}</span><span>{title.nenAgeRecommendation.minAge}+</span><span>{durationLabel(title)}</span></div>
      <h2><Link href={detailHref(title)} navigate={navigate}>{title.title}</Link></h2>
      <p>{title.shortDescription}</p>
      <div className="tag-list">{title.themes.slice(0, 2).map((theme) => <span key={theme}>{theme}</span>)}</div>
      {matched.length > 0 && <div className="match-note"><strong>Совпало</strong><span>{matched.map((item) => item.label).join(" · ")}</span></div>}
      {relaxed.length > 0 && <div className="relaxed-note"><strong>Ослабили</strong><span>{relaxed.map((item) => item.label).join(" · ")}</span></div>}
      <div className="card-actions">
        <Link href={detailHref(title)} navigate={navigate} className="text-link">Подробнее →</Link>
        <button type="button" className="favorite-button" aria-pressed={favorite} onClick={() => toggleFavorite(title.id)}>{favorite ? "♥ В избранном" : "♡ В избранное"}</button>
      </div>
    </div>
  </article>;
}
