import type { CatalogFilters } from "../domain/catalog/filters";
import type { FilterDictionary } from "../domain/catalog/types";
import { toggleFilterValue } from "../state/catalogViewModel";

const moodLabels: Record<string, string> = { calm: "Спокойное", cheerful: "Весёлое", adventurous: "Приключенческое", thoughtful: "Вдумчивое", emotional: "Эмоциональное" };
const formatLabels: Record<string, string> = { "animated-feature": "Полный метр", "animated-series": "Мультсериал", fiction: "Игровой", documentary: "Документальный" };

export function FilterPanel({ filters, dictionary, onChange, onReset }: {
  filters: CatalogFilters;
  dictionary: FilterDictionary;
  onChange: (filters: CatalogFilters) => void;
  onReset: () => void;
}) {
  const updateList = (field: "moods" | "themes" | "excludedSensitiveTopics" | "countries" | "contentFormats", value: string) => {
    const current = filters[field] as string[];
    onChange({ ...filters, [field]: toggleFilterValue(current, value) } as CatalogFilters);
  };
  return <section className="filters" aria-labelledby="filters-title">
    <div className="section-heading"><div><p className="eyebrow">Быстрый выбор</p><h2 id="filters-title">Фильтры</h2></div><button type="button" className="quiet-button" onClick={onReset}>Сбросить</button></div>

    <fieldset><legend>Возраст ребёнка</legend><div className="chips">
      {[4, 6, 8, 10, 12, 14].map((age) => <button key={age} type="button" className={filters.age === age ? "chip selected" : "chip"} aria-pressed={filters.age === age} onClick={() => onChange({ ...filters, age: filters.age === age ? null : age })}>{age} лет</button>)}
    </div></fieldset>

    <fieldset><legend>Формат</legend><div className="segmented">
      {dictionary.contentFormats.map((format) => <button key={format} type="button" aria-pressed={filters.contentFormats.includes(format as never)} className={filters.contentFormats.includes(format as never) ? "selected" : ""} onClick={() => updateList("contentFormats", format)}>{formatLabels[format] ?? format}</button>)}
    </div></fieldset>

    <fieldset><legend>Настроение</legend><div className="chips">{dictionary.moods.map((mood) => <button key={mood} type="button" className={filters.moods.includes(mood) ? "chip selected" : "chip"} aria-pressed={filters.moods.includes(mood)} onClick={() => updateList("moods", mood)}>{moodLabels[mood] ?? mood}</button>)}</div></fieldset>
    <fieldset><legend>Темы</legend><div className="chips">{dictionary.themes.map((theme) => <button key={theme} type="button" className={filters.themes.includes(theme) ? "chip selected" : "chip"} aria-pressed={filters.themes.includes(theme)} onClick={() => updateList("themes", theme)}>{theme}</button>)}</div></fieldset>

    <details><summary>Ещё фильтры</summary><div className="advanced-filters">
      <fieldset><legend>Страна</legend>{dictionary.countries.map((country) => <label className="check" key={country}><input type="checkbox" checked={filters.countries.includes(country)} onChange={() => updateList("countries", country)} />{country}</label>)}</fieldset>
      {dictionary.sensitiveTopics.length > 0 && <fieldset><legend>Не показывать произведения с темами…</legend>{dictionary.sensitiveTopics.map((topic) => <label className="check" key={topic}><input type="checkbox" checked={filters.excludedSensitiveTopics.includes(topic)} onChange={() => updateList("excludedSensitiveTopics", topic)} />{topic}</label>)}</fieldset>}
      {filters.contentType === "cartoon" && <>
        <fieldset><legend>Форма выпуска</legend>{dictionary.releaseForms.map((form) => <label className="check" key={form}><input type="checkbox" checked={filters.releaseForms.includes(form)} onChange={() => onChange({ ...filters, releaseForms: toggleFilterValue(filters.releaseForms, form) })} />{form}</label>)}</fieldset>
        <fieldset><legend>Количество серий</legend><label className="check"><input type="checkbox" checked={filters.episodeCountKnown === true} onChange={(event) => onChange({ ...filters, episodeCountKnown: event.target.checked ? true : null })} />Показывать только с известным количеством серий</label></fieldset>
      </>}
      {filters.contentType === "movie" && <fieldset><legend>Официальный рейтинг</legend><label className="check"><input type="checkbox" checked={filters.hasOfficialRating === true} onChange={(event) => onChange({ ...filters, hasOfficialRating: event.target.checked ? true : null })} />Только с подтверждённым официальным рейтингом</label></fieldset>}
    </div></details>
  </section>;
}
