import type { ReactNode } from "react";
import type { CatalogItem, CatalogQuery, ContentItem, EditorialCollection, FormatFilter, ScoredItem, Situation } from "./types";
import { ageBounds, filterOptions } from "./data/catalog";
import { formatLabels, neutralDescription, situationLabels, typeLabels } from "./lib/catalog";
import { confirmedOfficialRating, contentPath } from "./lib/content";

export function Icon({ name }: { name: "heart" | "search" | "arrow" | "close" }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    close: <><path d="m7 7 10 10" /><path d="M17 7 7 17" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{paths[name]}</svg>;
}

export function Header({ favoriteCount, navigate }: { favoriteCount: number; navigate: (path: string) => void }) {
  return <header className="site-header">
    <button className="logo" onClick={() => navigate("/")} aria-label="На главную НЭН"><span>Н</span><span>Э</span><span>Н</span></button>
    <nav className="desktop-nav" aria-label="Основная навигация">
      <button onClick={() => navigate("/")}>Главная</button>
      <button onClick={() => navigate("/books")}>Книги</button>
      <button onClick={() => navigate("/cartoons")}>Мультфильмы</button>
      <button onClick={() => navigate("/movies")}>Фильмы</button>
      <button onClick={() => navigate("/collections")}>Подборки НЭН</button>
      <button onClick={() => navigate("/recommend")}>Умный подбор</button>
      <button onClick={() => navigate("/favorites")} className="nav-favorite"><Icon name="heart" /> Избранное <b>{favoriteCount}</b></button>
    </nav>
    <details className="mobile-nav"><summary aria-label="Открыть меню">Меню</summary><div>{[["Главная", "/"], ["Книги", "/books"], ["Мультфильмы", "/cartoons"], ["Фильмы", "/movies"], ["Подборки НЭН", "/collections"], ["Умный подбор", "/recommend"], [`Избранное · ${favoriteCount}`, "/favorites"]].map(([label, path]) => <button key={path} onClick={() => navigate(path)}>{label}</button>)}</div></details>
  </header>;
}

export function Artwork({ item, large = false }: { item: CatalogItem; large?: boolean }) {
  if (item.imageUrl) return <img className={`artwork ${large ? "artwork--large" : ""}`} src={item.imageUrl} alt={`Обложка «${item.title}»`} />;
  const seed = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return <div className={`artwork artwork--placeholder art-${seed % 6} ${large ? "artwork--large" : ""}`} aria-label={`Типографическая обложка «${item.title}»`}>
    <span className="artwork__type">{typeLabels[item.contentType]}</span>
    <strong>{item.title}</strong>
    <i className="shape shape-a" /><i className="shape shape-b" />
  </div>;
}

export function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return <button className={`favorite-button ${active ? "is-active" : ""}`} onClick={(event) => { event.stopPropagation(); onClick(); }} aria-label={active ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={active}>
    <Icon name="heart" />
  </button>;
}

export function CatalogCard({ result, favorite, toggleFavorite, navigate }: { result: ScoredItem; favorite: boolean; toggleFavorite: () => void; navigate: (path: string) => void }) {
  const { item, reasons } = result;
  return <article className="catalog-card">
    <button className="card-main" onClick={() => navigate(contentPath(item))} aria-label={`Открыть «${item.title}»`}>
      <Artwork item={item} />
      <div className="card-copy">
        <div className="eyebrow">{item.categoryLabel}</div>
        <h3>{item.title}</h3>
        <p className="card-meta">{item.creator || item.studioOrPublisher || "Автор не указан"} · {item.recommendedAgeMin}–{item.recommendedAgeMax} лет</p>
        <p className="card-description">{neutralDescription(item)}</p>
        <div className="tags">{[...item.interests, ...item.genres].slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
        {(reasons.length > 0 || result.missed.length > 0) && <div className="reasons">{reasons.slice(0, 2).map((reason) => <span key={reason}>✓ {reason}</span>)}{result.missed.slice(0, 1).map((reason) => <span className="reason-missed" key={reason}>Ослаблено: {reason}</span>)}</div>}
      </div>
    </button>
    <FavoriteButton active={favorite} onClick={toggleFavorite} />
  </article>;
}

export function ContentCard({ content, favorite, toggleFavorite, navigate }: { content: ContentItem; favorite: boolean; toggleFavorite: () => void; navigate: (path: string) => void }) {
  const item = content.source;
  const details = content.type === "book"
    ? [content.author, content.readingMode === "independent" ? "читает сам" : content.readingMode === "both" ? "сам или вместе" : "читаем вместе", content.genres[0]]
    : content.type === "cartoon"
      ? [content.format === "feature" ? "полнометражный" : "короткий формат или сериал", content.durationMinutes ? `${content.durationMinutes} минут` : null, content.studio]
      : [content.year, content.audienceType === "teen" ? "подростковый" : "семейный", content.durationMinutes ? `${content.durationMinutes} минут` : null];
  const officialRating = confirmedOfficialRating(item);
  return <article className={`catalog-card content-card content-card--${content.type}`}>
    <button className="card-main" onClick={() => navigate(contentPath(content))} aria-label={`Открыть «${content.title}»`}>
      <Artwork item={item} />
      <div className="card-copy">
        <div className="eyebrow">{content.type === "book" ? "Книга" : content.type === "cartoon" ? "Мультфильм" : "Фильм"}</div>
        <h3>{content.title}</h3>
        <p className="card-meta">{details.filter(Boolean).join(" · ")}</p>
        <p className="nen-age">Возрастная рекомендация НЭН: {content.nenAgeRecommendation.label}</p>
        {officialRating && <p className="official-rating">Официальная маркировка: {officialRating}</p>}
        <p className="card-description">{content.description}</p>
        <div className="tags">{content.themes.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <span className="card-link">Подробнее <Icon name="arrow" /></span>
      </div>
    </button>
    <FavoriteButton active={favorite} onClick={toggleFavorite} />
  </article>;
}

export function EditorialCollectionCard({ collection, navigate }: { collection: EditorialCollection; navigate: (path: string) => void }) {
  return <article className="collection-card"><button onClick={() => navigate(`/collections/${collection.slug}`)}><div className="collection-cover"><span>Подборка НЭН</span><strong>{collection.itemIds.length}</strong></div><div className="collection-card__copy"><div className="eyebrow">{collection.ageLabel ?? "Для всей семьи"} · {new Date(collection.publishedAt).toLocaleDateString("ru-RU")}</div><h2>{collection.title}</h2><p>{collection.description}</p><div className="tags">{collection.contentTypes.map((type) => <span key={type}>{type === "book" ? "книги" : type === "cartoon" ? "мультфильмы" : "фильмы"}</span>)}</div><span className="card-link">Открыть подборку <Icon name="arrow" /></span></div></button></article>;
}

function ChoiceGroup<T extends string>({ label, values, value, onChange, labels, getCount }: { label: string; values: T[]; value: T | null; onChange: (value: T) => void; labels: Record<T, string>; getCount?: (value: T) => number }) {
  return <fieldset><legend>{label}</legend><div className="choice-row">{values.map((option) => {
    const count = getCount?.(option);
    const unavailable = count === 0 && value !== option;
    return <button type="button" className={value === option ? "selected" : ""} aria-pressed={value === option} key={option} disabled={unavailable} onClick={() => onChange(option)}>{labels[option]}{getCount && <small>{count}</small>}</button>;
  })}</div></fieldset>;
}

export function QuickPicker({ query, setQuery, onSubmit, compact = false }: { query: CatalogQuery; setQuery: (query: CatalogQuery) => void; onSubmit: () => void; compact?: boolean }) {
  return <form className={`picker ${compact ? "picker--compact" : ""}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <div className="picker-step">
      <span className="step-number">01</span>
      <div><label htmlFor="age">Сколько лет ребёнку?</label><div className="age-control"><input id="age" type="range" min={ageBounds.min} max={ageBounds.max} value={query.age ?? 6} onChange={(event) => setQuery({ ...query, age: Number(event.target.value) })} /><output>{query.age ?? 6}</output></div></div>
    </div>
    <div className="picker-step">
      <span className="step-number">02</span>
      <ChoiceGroup label="Что ищем?" values={["all", "reading", "cartoon", "movie"]} value={query.format} onChange={(format) => setQuery({ ...query, format })} labels={formatLabels} />
    </div>
    {!compact && <div className="picker-step optional">
      <span className="step-number">03</span>
      <fieldset><legend>Что сейчас интересно? <small>можно пропустить</small></legend><div className="choice-row">{filterOptions.interests.slice(0, 8).map((interest) => <button type="button" className={query.interests.includes(interest) ? "selected" : ""} aria-pressed={query.interests.includes(interest)} key={interest} onClick={() => setQuery({ ...query, interests: query.interests.includes(interest) ? query.interests.filter((value) => value !== interest) : [...query.interests, interest] })}>{interest}</button>)}</div></fieldset>
    </div>}
    <button className="primary-button" type="submit">Подобрать <Icon name="arrow" /></button>
  </form>;
}

export function Filters({ query, setQuery, getResultCount }: { query: CatalogQuery; setQuery: (query: CatalogQuery) => void; getResultCount: (query: CatalogQuery) => number }) {
  const toggle = (key: "interests" | "moods", value: string) => setQuery({ ...query, [key]: query[key].includes(value) ? query[key].filter((item) => item !== value) : [...query[key], value] });
  return <aside className="filters">
    <h2>Уточнить выбор</h2>
    <label className="filter-label">Возраст <span>{query.age ?? "любой"}</span><input type="range" min={ageBounds.min} max={ageBounds.max} value={query.age ?? 9} onChange={(event) => setQuery({ ...query, age: Number(event.target.value) })} /></label>
    <ChoiceGroup label="Формат" values={["all", "reading", "cartoon", "movie"]} value={query.format} onChange={(format) => setQuery({ ...query, format })} labels={formatLabels} getCount={(format) => getResultCount({ ...query, format })} />
    <FilterChecks title="Интересы" values={filterOptions.interests} selected={query.interests} onToggle={(value) => toggle("interests", value)} getCount={(value) => getResultCount({ ...query, interests: query.interests.includes(value) ? query.interests.filter((item) => item !== value) : [...query.interests, value] })} />
    <FilterChecks title="Настроение" values={filterOptions.moods} selected={query.moods} onToggle={(value) => toggle("moods", value)} getCount={(value) => getResultCount({ ...query, moods: query.moods.includes(value) ? query.moods.filter((item) => item !== value) : [...query.moods, value] })} />
    <ChoiceGroup label="Ситуация" values={["bedtime", "family", "independent"]} value={query.situation} onChange={(situation) => setQuery({ ...query, situation: query.situation === situation ? null : situation })} labels={situationLabels} getCount={(situation) => getResultCount({ ...query, situation })} />
    <label className="select-label">Длительность<select value={query.duration ?? ""} onChange={(event) => setQuery({ ...query, duration: event.target.value || null })}><option value="">Любая</option>{filterOptions.durations.map((duration) => <option key={duration} disabled={query.duration !== duration && getResultCount({ ...query, duration }) === 0}>{duration}</option>)}</select></label>
  </aside>;
}

function FilterChecks({ title, values, selected, onToggle, getCount }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void; getCount: (value: string) => number }) {
  return <details><summary>{title}{selected.length ? ` · ${selected.length}` : ""}</summary><div className="checks">{values.map((value) => {
    const count = getCount(value);
    const unavailable = count === 0 && !selected.includes(value);
    return <label key={value} className={unavailable ? "is-unavailable" : ""}><input type="checkbox" checked={selected.includes(value)} disabled={unavailable} onChange={() => onToggle(value)} /> <span>{value}</span><small>{count}</small></label>;
  })}</div></details>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">?</div><h2>{title}</h2><p>{children}</p></div>;
}
