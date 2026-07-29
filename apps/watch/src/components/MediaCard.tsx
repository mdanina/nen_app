import type { WatchTitle } from "../domain/catalog/types";
import type { ConditionExplanation } from "../domain/catalog/ranking";
import { Link, type Navigate } from "./Link";

export const durationLabel = (title: WatchTitle) => title.duration.kind === "standalone"
  ? `${title.duration.minutes} мин`
  : `${title.duration.episodeMinutes}${title.duration.episodeMinutesMax ? `–${title.duration.episodeMinutesMax}` : ""} мин/серия${title.duration.seasonCount ? ` · ${title.duration.seasonCount} сез.` : ""}${title.duration.episodeCount ? ` · ${title.duration.episodeCount} серий` : ""}`;

const typeLabels: Record<WatchTitle["productionKind"], string> = {
  movie: "Фильм",
  "animated-feature": "Мультфильм",
  "animated-short": "Короткометражный мультфильм",
  "animated-series": "Мультсериал",
  series: "Сериал",
  documentary: "Документальный фильм",
};

export const typeLabel = (title: WatchTitle) => typeLabels[title.productionKind];
export const detailHref = (title: WatchTitle) => `/${title.contentType === "cartoon" ? "cartoons" : "movies"}/${encodeURIComponent(title.slug)}`;

export const frameCaption = (title: WatchTitle) => {
  const studios = title.frame?.studios ?? [];
  const studioLabel = studios.length === 1 ? "Студия производства" : "Студии производства";
  return `Кадр из ${typeLabel(title).toLocaleLowerCase("ru")} «${title.title}» (${title.year}) | ${studioLabel}: ${studios.join(", ")}`;
};

export const compactRecommendation = (title: WatchTitle) => {
  const firstSentence = title.whyRecommended.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? title.whyRecommended.trim();
  if (firstSentence.length <= 80) return firstSentence;
  const shortened = firstSentence.slice(0, 77).replace(/\s+\S*$/u, "").trim();
  return `${shortened}…`;
};

export function Frame({ title, large = false }: { title: WatchTitle; large?: boolean }) {
  if (!title.frame) {
    return <div className={`poster-placeholder ${large ? "large " : ""}${title.contentType}`} aria-label={`Изображение для «${title.title}» пока не добавлено`}><span>{title.contentType === "cartoon" ? "✦" : "▶"}</span></div>;
  }
  return <figure className={`media-frame${large ? " large" : ""}`}>
    <img src={title.frame.url} alt={`Кадр из ${typeLabel(title).toLocaleLowerCase("ru")} «${title.title}»`} loading={large ? "eager" : "lazy"} />
    <figcaption>{frameCaption(title)}</figcaption>
  </figure>;
}

export function MediaCard({ title, favorite, toggleFavorite, navigate, matched = [], relaxed = [] }: {
  title: WatchTitle;
  favorite: boolean;
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
  matched?: ConditionExplanation[];
  relaxed?: ConditionExplanation[];
}) {
  return <article className="media-card">
    <Frame title={title} />
    <div className="card-body">
      <div className="card-kicker"><span>{typeLabel(title)}</span><span>{title.nenAgeRecommendation.minAge}+</span><span>{durationLabel(title)}</span></div>
      <h2><Link href={detailHref(title)} navigate={navigate}>{title.title}</Link></h2>
      <p>{title.shortDescription}</p>
      <div className="compact-recommendation">
        <strong>{title.awards?.length ? "Награды" : "Почему рекомендуем"}</strong>
        {title.awards?.length
          ? <span>🏆 {title.awards[0]}</span>
          : <span>{compactRecommendation(title)}</span>}
      </div>
      <div className="tag-list">{title.themes.slice(0, 6).map((theme) => <span key={theme}>{theme}</span>)}</div>
      {matched.length > 0 && <div className="match-note"><strong>Совпало</strong><span>{matched.map((item) => item.label).join(" · ")}</span></div>}
      {relaxed.length > 0 && <div className="relaxed-note"><strong>Ослабили</strong><span>{relaxed.map((item) => item.label).join(" · ")}</span></div>}
      <div className="card-actions">
        <Link href={detailHref(title)} navigate={navigate} className="text-link">Подробнее →</Link>
        <button type="button" className="favorite-button" aria-pressed={favorite} onClick={() => toggleFavorite(title.id)}>{favorite ? "♥ В избранном" : "♡ В избранное"}</button>
      </div>
    </div>
  </article>;
}
