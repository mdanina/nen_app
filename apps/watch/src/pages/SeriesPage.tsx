import { useMemo } from "react";
import type { Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";
import { filterSeriesTitles, type SeriesCatalogFilters, type SeriesCategory } from "../domain/catalog/series";
import type { WatchTitle } from "../domain/catalog/types";

const categories: Array<[SeriesCategory, string]> = [
  ["all", "Все сериалы"],
  ["live-action", "Игровые"],
  ["animated", "Мультсериалы"],
  ["documentary", "Документальные"],
  ["educational", "Образовательные"],
];

const readFilters = (search: string): SeriesCatalogFilters => {
  const params = new URLSearchParams(search);
  const categoryValue = params.get("type");
  const category = categories.some(([value]) => value === categoryValue) ? categoryValue as SeriesCategory : "all";
  const rawAge = params.get("age");
  const ageValue = rawAge === null ? Number.NaN : Number(rawAge);
  return {
    query: params.get("q")?.slice(0, 120) ?? "",
    category,
    age: Number.isInteger(ageValue) && ageValue >= 0 && ageValue <= 18 ? ageValue : null,
    country: params.get("country")?.slice(0, 80) ?? "",
  };
};

const serializeFilters = (filters: SeriesCatalogFilters) => {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.category !== "all") params.set("type", filters.category);
  if (filters.age !== null) params.set("age", String(filters.age));
  if (filters.country) params.set("country", filters.country);
  const value = params.toString();
  return value ? `?${value}` : "";
};

export function SeriesPage({ titles, search, favorites, toggleFavorite, navigate }: {
  titles: WatchTitle[];
  search: string;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
}) {
  const filters = useMemo(() => readFilters(search), [search]);
  const series = useMemo(() => filterSeriesTitles(titles, filters), [titles, filters]);
  const countries = useMemo(
    () => [...new Set(titles.filter((title) => title.releaseForm === "series").flatMap((title) => title.country))]
      .sort((a, b) => a.localeCompare(b, "ru")),
    [titles],
  );
  const update = (next: SeriesCatalogFilters) => navigate(`/series${serializeFilters(next)}`);

  return <div className="page catalog-page">
    <header className="page-intro">
      <p className="eyebrow">Истории, к которым можно возвращаться</p>
      <h1>Сериалы</h1>
      <p>Игровые, анимационные, документальные и образовательные сериалы для разных возрастов.</p>
    </header>
    <section className="filters series-filters" aria-labelledby="series-filters-title">
      <div className="section-heading">
        <div><p className="eyebrow">Поиск и фильтры</p><h2 id="series-filters-title">Найти сериал</h2></div>
        <button type="button" className="quiet-button" onClick={() => update({ query: "", category: "all", age: null, country: "" })}>Сбросить</button>
      </div>
      <label className="search-field">
        <span>Поиск по названию, описанию или теме</span>
        <input type="search" value={filters.query} onChange={(event) => update({ ...filters, query: event.target.value })} placeholder="Например, природа или дружба" />
      </label>
      <fieldset>
        <legend>Тип сериала</legend>
        <div className="segmented">{categories.map(([value, label]) => <button key={value} type="button" className={filters.category === value ? "selected" : ""} aria-pressed={filters.category === value} onClick={() => update({ ...filters, category: value })}>{label}</button>)}</div>
      </fieldset>
      <div className="series-selects">
        <label><span>Возраст ребёнка</span><select value={filters.age ?? ""} onChange={(event) => update({ ...filters, age: event.target.value ? Number(event.target.value) : null })}><option value="">Любой возраст</option>{[2, 4, 6, 8, 10, 12, 14, 16].map((age) => <option key={age} value={age}>{age} лет</option>)}</select></label>
        <label><span>Страна</span><select value={filters.country} onChange={(event) => update({ ...filters, country: event.target.value })}><option value="">Все страны</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
      </div>
    </section>
    <section className="results" aria-live="polite">
      <div className="section-heading"><div><p className="eyebrow">Результаты</p><h2>Найдено: {series.length}</h2></div></div>
      {series.length
        ? <div className="media-grid">{series.map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div>
        : <div className="notice empty"><strong>Подходящих сериалов не найдено</strong><p>Попробуйте изменить запрос, возраст или выбранный тип.</p></div>}
    </section>
  </div>;
}
