import { useMemo } from "react";
import { FilterPanel } from "../components/FilterPanel";
import { MediaCard } from "../components/MediaCard";
import type { Navigate } from "../components/Link";
import { emptyFilters, type CatalogFilters } from "../domain/catalog/filters";
import type { ContentType, FilterDictionary, WatchTitle } from "../domain/catalog/types";
import { parseFiltersFromUrl, serializeFiltersToUrl } from "../domain/catalog/url";
import { buildCatalogResult } from "../state/catalogViewModel";

export function CatalogPage({ contentType, titles, dictionary, search, favorites, toggleFavorite, navigate }: {
  contentType: ContentType;
  titles: WatchTitle[];
  dictionary: FilterDictionary;
  search: string;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
}) {
  const filters = useMemo(() => parseFiltersFromUrl(contentType, search), [contentType, search]);
  const state = useMemo(() => buildCatalogResult(titles, filters), [titles, filters]);
  const pathname = contentType === "cartoon" ? "/cartoons" : "/movies";
  const update = (next: CatalogFilters) => navigate(`${pathname}${serializeFiltersToUrl(next)}`);
  const title = contentType === "cartoon" ? "Мультфильмы" : "Фильмы";
  return <div className="page catalog-page">
    <header className="page-intro"><p className="eyebrow">Отдельный каталог</p><h1>{title}</h1><p>{contentType === "cartoon" ? "Полнометражные истории и мультсериалы для разных возрастов." : "Игровые и документальные истории для совместного просмотра."}</p></header>
    <FilterPanel filters={filters} dictionary={dictionary} onChange={update} onReset={() => update(emptyFilters(contentType))} />
    <section className="results" aria-live="polite">
      <div className="section-heading"><div><p className="eyebrow">Результаты</p><h2>{state.kind === "exact" ? `Найдено: ${state.results.length}` : state.kind === "nearby" ? "Близкие варианты" : "Ничего безопасно не найдено"}</h2></div></div>
      {state.kind === "nearby" && <div className="notice nearby"><strong>Точных совпадений нет, но мы нашли близкие варианты</strong><p>Возраст и исключённые чувствительные темы сохранены. Ниже явно отмечены только ослабленные мягкие условия.</p></div>}
      {state.kind === "empty" && <div className="notice empty"><strong>После обязательных условий вариантов не осталось</strong><p>Попробуйте вручную изменить возраст или убрать часть исключённых тем. Мы не ослабляем эти условия автоматически.</p></div>}
      {state.kind !== "empty" && <div className="media-grid">{state.results.map((result) => <MediaCard key={result.title.id} title={result.title} favorite={favorites.includes(result.title.id)} toggleFavorite={toggleFavorite} navigate={navigate} matched={state.kind === "nearby" ? result.matchedConditions : []} relaxed={result.relaxedConditions} />)}</div>}
    </section>
  </div>;
}
