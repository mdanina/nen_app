import { useEffect, useMemo, useState } from "react";
import { ContentCard } from "../components";
import { ageBounds, catalog } from "../data/catalog";
import { contentByType } from "../lib/content";
import { recommend } from "../lib/recommendations";
import { normalize } from "../lib/catalog";
import { useSeo } from "../hooks/useSeo";
import type { AppContentType, CatalogQuery, ContentItem } from "../types";

type SortValue = "nen" | "age" | "duration" | "new";

interface SectionState {
  age: number | null;
  search: string;
  theme: string;
  mood: string;
  duration: string;
  primary: string;
  secondary: string;
  tertiary: string;
  sort: SortValue;
}

const emptyState: SectionState = { age: null, search: "", theme: "", mood: "", duration: "", primary: "", secondary: "", tertiary: "", sort: "nen" };

const sectionCopy = {
  book: { path: "books", eyebrow: "Читаем сами и вместе", title: "Книги", intro: "Книги и классические сказки по возрасту, теме и формату чтения.", primary: "Формат чтения", primaryOptions: [["independent", "Ребёнок читает сам"], ["together", "Читаем вместе"], ["both", "Подойдёт в обоих случаях"]], secondary: "Сложность языка", secondaryOptions: [["easy", "Простой"], ["medium", "Средний"], ["advanced", "Продвинутый"]] },
  cartoon: { path: "cartoons", eyebrow: "Смотреть и обсуждать", title: "Мультфильмы", intro: "Полнометражные и короткие мультфильмы для разных возрастов и настроений.", primary: "Формат", primaryOptions: [["feature", "Полнометражный"], ["short-or-series", "Короткий формат или сериал"]], secondary: "Характер", secondaryOptions: [["educational", "Познавательный"], ["entertainment", "Развлекательный"], ["mixed", "Смешанный"]] },
  movie: { path: "movies", eyebrow: "Семейный экран", title: "Фильмы", intro: "Семейные и подростковые фильмы для совместного просмотра и разговора.", primary: "Аудитория", primaryOptions: [["family", "Семейный"], ["teen", "Подростковый"]], secondary: "Для обсуждения", secondaryOptions: [["high", "Хорошо подходит"], ["medium", "Можно обсудить"]] },
} as const;

function readState(): SectionState {
  const params = new URLSearchParams(window.location.search);
  const age = Number(params.get("age"));
  const sort = params.get("sort");
  return { age: Number.isFinite(age) && age >= ageBounds.min && age <= ageBounds.max ? age : null, search: params.get("q") ?? "", theme: params.get("theme") ?? "", mood: params.get("mood") ?? "", duration: params.get("duration") ?? "", primary: params.get("mode") ?? "", secondary: params.get("detail") ?? "", tertiary: params.get("extra") ?? "", sort: sort === "age" || sort === "duration" || sort === "new" ? sort : "nen" };
}

function paramsFor(state: SectionState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.age !== null) params.set("age", String(state.age));
  if (state.search) params.set("q", state.search);
  if (state.theme) params.set("theme", state.theme);
  if (state.mood) params.set("mood", state.mood);
  if (state.duration) params.set("duration", state.duration);
  if (state.primary) params.set("mode", state.primary);
  if (state.secondary) params.set("detail", state.secondary);
  if (state.tertiary) params.set("extra", state.tertiary);
  if (state.sort !== "nen") params.set("sort", state.sort);
  return params;
}

function unique(values: Array<string | undefined>): string[] { return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ru")); }

function matches(item: ContentItem, state: SectionState): boolean {
  if (state.age !== null && (state.age < item.nenAgeRecommendation.min || state.age > item.nenAgeRecommendation.max)) return false;
  if (state.search && !normalize([item.title, item.originalTitle, item.description, item.source.creator, item.source.studioOrPublisher, ...item.themes].filter(Boolean).join(" ")).includes(normalize(state.search))) return false;
  if (state.theme && !item.themes.includes(state.theme)) return false;
  if (state.mood && !item.moods.includes(state.mood)) return false;
  if (state.duration && item.source.durationCategory !== state.duration) return false;
  if (state.primary) {
    if (item.type === "book" && item.readingMode !== state.primary && item.readingMode !== "both") return false;
    if (item.type === "cartoon" && item.format !== state.primary) return false;
    if (item.type === "movie" && item.audienceType !== state.primary) return false;
  }
  if (state.secondary) {
    if (item.type === "book" && item.languageDifficulty !== state.secondary) return false;
    if (item.type === "cartoon" && item.purpose !== state.secondary) return false;
    if (item.type === "movie" && item.discussionPotential !== state.secondary) return false;
  }
  if (state.tertiary) {
    if ((item.type === "book" || item.type === "movie") && !item.source.genres.includes(state.tertiary)) return false;
    if (item.type === "cartoon" && item.studio !== state.tertiary) return false;
  }
  return true;
}

function sortItems(items: ContentItem[], sort: SortValue): ContentItem[] {
  return [...items].sort((a, b) => {
    if (sort === "age") return a.nenAgeRecommendation.min - b.nenAgeRecommendation.min;
    if (sort === "duration") return (a.source.durationMinutes ?? a.source.pageCount ?? 9999) - (b.source.durationMinutes ?? b.source.pageCount ?? 9999);
    if (sort === "new") return (b.year ?? 0) - (a.year ?? 0);
    return a.id.localeCompare(b.id);
  });
}

export function CatalogPage({ type, favorites, toggle, navigate }: { type: AppContentType; favorites: string[]; toggle: (id: string) => void; navigate: (path: string) => void }) {
  const copy = sectionCopy[type];
  const source = contentByType[type];
  const [state, setState] = useState<SectionState>(readState);
  const [searchInput, setSearchInput] = useState(state.search);
  const filterKey = paramsFor(state).toString();
  useSeo(`${copy.title} для детей — каталог НЭН`, copy.intro, `/${copy.path}`, filterKey);
  useEffect(() => { const next = readState(); setState(next); setSearchInput(next.search); }, [type]);
  useEffect(() => { const onPop = () => { const next = readState(); setState(next); setSearchInput(next.search); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { const params = paramsFor(state); window.history.replaceState({}, "", `/${copy.path}${params.size ? `?${params}` : ""}`); }, [state, copy.path]);
  useEffect(() => { if (searchInput === state.search) return; const timer = window.setTimeout(() => setState((current) => ({ ...current, search: searchInput })), 250); return () => window.clearTimeout(timer); }, [searchInput, state.search]);

  const themes = useMemo(() => unique(source.flatMap((item) => item.themes)), [source]);
  const moods = useMemo(() => unique(source.flatMap((item) => item.moods)), [source]);
  const durations = useMemo(() => unique(source.map((item) => item.source.durationCategory ?? undefined)), [source]);
  const tertiaryOptions = useMemo(() => type === "cartoon" ? unique(source.map((item) => item.type === "cartoon" ? item.studio : undefined)) : unique(source.flatMap((item) => item.source.genres)), [source, type]);
  const exact = useMemo(() => sortItems(source.filter((item) => matches(item, state)), state.sort), [source, state]);
  const near = useMemo(() => {
    if (exact.length > 0) return [];
    const query: CatalogQuery = { age: state.age, format: type === "book" ? "reading" : type, interests: state.theme ? [state.theme] : [], moods: state.mood ? [state.mood] : [], situation: state.primary === "independent" ? "independent" : state.primary === "together" ? "family" : null, duration: state.duration || null, search: state.search };
    const result = recommend(catalog, query);
    const ids = [...result.exact, ...result.partial, ...result.alternateType].map(({ item }) => item.id);
    return source.filter((item) => ids.includes(item.id)).slice(0, 6);
  }, [exact.length, source, state, type]);
  const active = [state.age ? `${state.age} лет` : "", state.theme, state.mood, state.duration, state.primary, state.secondary, state.tertiary].filter(Boolean);
  const update = (key: keyof SectionState, value: string | number | null) => setState((current) => ({ ...current, [key]: value }));

  return <section className="catalog-page section-catalog"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><span>/</span><span>{copy.title}</span></div><header className="catalog-intro"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.intro}</p><div className="search"><span aria-hidden="true">⌕</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label={`Поиск: ${copy.title}`} placeholder="Название, автор или тема" /></div>{active.length > 0 && <div className="active-tags">{active.map((value) => <span key={value}>{value}</span>)}<button onClick={() => { setState(emptyState); setSearchInput(""); }}>Сбросить всё</button></div>}</header>
    <div className="catalog-layout"><details className="filters catalog-filters" open><summary>Фильтры</summary><label>Возраст<select value={state.age ?? ""} onChange={(event) => update("age", event.target.value ? Number(event.target.value) : null)}><option value="">Любой</option>{Array.from({ length: ageBounds.max - ageBounds.min + 1 }, (_, index) => ageBounds.min + index).map((age) => <option key={age}>{age}</option>)}</select></label><Select label={copy.primary} value={state.primary} options={copy.primaryOptions} onChange={(value) => update("primary", value)} /><Select label={type === "book" || type === "movie" ? "Жанр" : "Студия"} value={state.tertiary} options={tertiaryOptions.map((value) => [value, value])} onChange={(value) => update("tertiary", value)} /><Select label="Тема" value={state.theme} options={themes.map((value) => [value, value])} onChange={(value) => update("theme", value)} /><Select label="Эмоциональное состояние" value={state.mood} options={moods.map((value) => [value, value])} onChange={(value) => update("mood", value)} /><Select label={type === "book" ? "Объём" : "Длительность"} value={state.duration} options={durations.map((value) => [value, value])} onChange={(value) => update("duration", value)} /><details><summary>Другие фильтры</summary><Select label={copy.secondary} value={state.secondary} options={copy.secondaryOptions} onChange={(value) => update("secondary", value)} /></details></details>
      <div className="results"><div className="results-toolbar"><p>Найдено: <strong>{exact.length}</strong></p><label>Сортировка<select value={state.sort} onChange={(event) => update("sort", event.target.value)}><option value="nen">Рекомендации НЭН</option><option value="age">По возрасту</option>{type !== "book" && <option value="duration">По длительности</option>}<option value="new">Сначала новые</option></select></label></div>{exact.length > 0 ? <div className="catalog-grid">{exact.map((item) => <ContentCard key={item.id} content={item} favorite={favorites.includes(item.id)} toggleFavorite={() => toggle(item.id)} navigate={navigate} />)}</div> : <><div className="near-notice">Точных совпадений нет. Показываем наиболее близкие варианты внутри этого каталога.</div><div className="catalog-grid">{near.map((item) => <ContentCard key={item.id} content={item} favorite={favorites.includes(item.id)} toggleFavorite={() => toggle(item.id)} navigate={navigate} />)}</div></>}</div></div>
  </section>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Любой</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
}
