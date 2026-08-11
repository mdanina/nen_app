import { Icon } from "@nen/ui";
import type { Book, BookFilters as Filters, Difficulty, LengthCategory, ReadingMode } from "../domain/books/types";

const reading: Array<[ReadingMode, string]> = [["independent","Самостоятельно"],["together","Читаем вместе"],["both","Подойдёт и для самостоятельного, и для совместного чтения"]];
const lengths: Array<[LengthCategory, string]> = [["very-short","Короткая история"],["short","На один вечер"],["medium","На несколько вечеров"],["long","Длинное чтение"]];
const difficulties: Array<[Difficulty, string]> = [["easy","Простой язык"],["medium","Средний"],["advanced","Сложный"]];
const uniq = (values: string[]) => [...new Set(values)].sort((a,b) => a.localeCompare(b,"ru"));

export function BookFilters({ books, filters, update, clear, close }: { books: Book[]; filters: Filters; update: (next: Filters) => void; clear: () => void; close?: () => void }) {
  const toggle = <T extends string>(key: "themes"|"genres"|"publishers"|"moods"|"lengths", value: T) => { const current = filters[key] as string[]; update({ ...filters, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] }); };
  const themes = uniq(books.flatMap((book) => book.themes)); const genres = uniq(books.flatMap((book) => book.genres)); const publisherCounts = new Map<string,number>(); books.forEach((book) => { if (book.publisher) publisherCounts.set(book.publisher,(publisherCounts.get(book.publisher)??0)+1); }); const publishers = uniq([...publisherCounts].filter(([,count]) => count>=3).map(([publisher]) => publisher)); const moodCounts = new Map<string, number>(); books.forEach((book) => book.moods.forEach((mood) => moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1)));
  const moods = uniq([...moodCounts].filter(([, count]) => count >= 3).map(([mood]) => mood));
  const booksWithMood = books.filter((book) => book.moods.length).length;
  return <div className="filter-panel"><div className="filter-panel__head"><div><small>Фильтры применяются сразу</small><h2>Фильтры</h2></div>{close && <button className="icon-button" onClick={close} aria-label="Закрыть фильтры"><Icon name="close" /></button>}</div>
    <fieldset><legend>Возраст ребёнка</legend><div className="chip-scroll"><button className={filters.age === null ? "selected" : ""} aria-pressed={filters.age === null} onClick={() => update({ ...filters, age: null })}>Любой</button>{Array.from({ length: 13 },(_,i) => i+2).map((age) => <button key={age} className={filters.age === age ? "selected" : ""} aria-pressed={filters.age === age} onClick={() => update({ ...filters, age })}>{age}</button>)}</div></fieldset>
    <fieldset><legend>Формат чтения</legend><div className="segment">{reading.map(([value,label]) => <button key={value} className={filters.reading === value ? "selected" : ""} aria-pressed={filters.reading === value} onClick={() => update({ ...filters, reading: filters.reading === value ? null : value })}>{label}</button>)}</div></fieldset>
    <ChipGroup title="Объём чтения" options={lengths} selected={filters.lengths} toggle={(value) => toggle("lengths",value)} />
    <ChipGroup title="Тема" options={themes.map((v) => [v,v])} selected={filters.themes} toggle={(value) => toggle("themes",value)} limit={12} />
    <ChipGroup title="Жанр" options={genres.map((v) => [v,v])} selected={filters.genres} toggle={(value) => toggle("genres",value)} limit={10} />
    <details className="more-filters"><summary>Другие фильтры</summary><ChipGroup title="Издательство" options={publishers.map((v) => [v,v])} selected={filters.publishers} toggle={(value) => toggle("publishers",value)} /><ChipGroup title="Настроение" options={moods.map((v) => [v,v])} selected={filters.moods} toggle={(value) => toggle("moods",value)} help={`Настроение проставлено у ${booksWithMood} книг из ${books.length} — фильтр покажет только их.`} /><fieldset><legend>Сложность языка</legend><div className="chips">{difficulties.map(([value,label]) => <button key={value} className={filters.difficulty === value ? "selected" : ""} aria-pressed={filters.difficulty === value} onClick={() => update({ ...filters, difficulty: filters.difficulty === value ? null : value })}>{label}</button>)}</div><small className="field-help">У некоторых книг сложность языка пока не указана.</small></fieldset></details>
    <div className="filter-actions"><button className="secondary-button" onClick={clear}>Сбросить всё</button>{close && <button className="primary-button" onClick={close}>Готово</button>}</div>
  </div>;
}

function ChipGroup<T extends string>({ title, options, selected, toggle, limit, help }: { title: string; options: Array<readonly [T,string]>; selected: T[]; toggle: (value:T) => void; limit?: number; help?: string }) {
  const visible = limit ? options.slice(0,limit) : options;
  return <fieldset><legend>{title}</legend><div className="chips">{visible.map(([value,label]) => <button key={value} className={selected.includes(value) ? "selected" : ""} aria-pressed={selected.includes(value)} onClick={() => toggle(value)}>{label}</button>)}</div>{limit && options.length > limit && <small className="field-help">Другие варианты можно найти через поиск.</small>}{help && <small className="field-help">{help}</small>}</fieldset>;
}
