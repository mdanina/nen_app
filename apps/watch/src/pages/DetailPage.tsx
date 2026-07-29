import type { Navigate } from "../components/Link";
import { Link } from "../components/Link";
import { compactRecommendation, detailHref, durationLabel, Frame, MediaCard, typeLabel } from "../components/MediaCard";
import type { ContentType, WatchTitle } from "../domain/catalog/types";
import { findDetailTitle } from "../state/catalogViewModel";

export function DetailPage({ slug, expectedType, titles, favorites, toggleFavorite, navigate }: { slug: string; expectedType: ContentType; titles: WatchTitle[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: Navigate }) {
  const title = findDetailTitle(titles, slug, expectedType);
  const catalogHref = expectedType === "cartoon" ? "/cartoons" : "/movies";
  if (!title) return <div className="page narrow"><p className="eyebrow">Не найдено</p><h1>Произведение не найдено</h1><p>Возможно, ссылка устарела или запись относится к другому каталогу.</p><Link href={catalogHref} navigate={navigate} className="primary-link">Вернуться в каталог</Link></div>;
  const similar = titles.filter((item) => item.contentType === title.contentType && item.id !== title.id).slice(0, 3);
  return <div className="page detail-page">
    <Link href={catalogHref} navigate={navigate} className="back-link">← Вернуться в каталог</Link>
    <article className="detail-hero">
      <Frame title={title} large />
      <div><p className="eyebrow">{typeLabel(title)} · выбор НЭН</p><h1>{title.title}</h1>{title.originalTitle && <p className="original-title">{title.originalTitle}</p>}<p className="lead">{title.shortDescription}</p><button className="primary-button" type="button" aria-pressed={favorites.includes(title.id)} onClick={() => toggleFavorite(title.id)}>{favorites.includes(title.id) ? "♥ Убрать из избранного" : "♡ Добавить в избранное"}</button></div>
    </article>
    <div className="detail-grid">
      <section className="detail-section"><h2>О произведении</h2><dl><div><dt>Год</dt><dd>{title.year}</dd></div><div><dt>Страна</dt><dd>{title.country.join(", ")}</dd></div><div><dt>Формат</dt><dd>{typeLabel(title)}</dd></div><div><dt>Длительность</dt><dd>{durationLabel(title)}</dd></div></dl></section>
      <section className="detail-section nen-rating"><p className="eyebrow">Рекомендация НЭН</p><h2>Возраст</h2><strong className="age-badge">{title.nenAgeRecommendation.minAge}{title.nenAgeRecommendation.maxAge ? `–${title.nenAgeRecommendation.maxAge}` : "+"} лет</strong><h3>Темы</h3><div className="tag-list">{title.themes.slice(0, 6).map((value) => <span key={value}>{value}</span>)}</div>{title.awards?.length ? <><h3>Награды</h3><p>{title.awards.map((award) => `🏆 ${award}`).join(" · ")}</p></> : <><h3>Почему рекомендуем</h3><p className="recommendation-line">{compactRecommendation(title)}</p></>}</section>
      {title.officialRating && <section className="detail-section official-rating"><p className="eyebrow">Подтверждённые данные</p><h2>Официальный возрастной рейтинг</h2><strong>{title.officialRating.system}: {title.officialRating.value}</strong><p><a href={title.officialRating.sourceUrl} target="_blank" rel="noreferrer">Источник рейтинга ↗</a></p></section>}
      <section className="detail-section"><h2>Для разговора после просмотра</h2><ul>{title.discussionTopics.map((value) => <li key={value}>{value}</li>)}</ul><h3>Настроение</h3><div className="tag-list">{title.mood.map((value) => <span key={value}>{value}</span>)}</div></section>
      <section className="detail-section"><h2>Чувствительные темы</h2>{title.sensitiveTopics.length ? <ul>{title.sensitiveTopics.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Чувствительные темы не отмечены.</p>}</section>
    </div>
    {similar.length > 0 && <section><div className="section-heading"><h2>Похожие в том же каталоге</h2></div><div className="media-grid">{similar.map((item) => <MediaCard key={item.id} title={item} favorite={favorites.includes(item.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div></section>}
  </div>;
}
