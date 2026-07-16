import { matchesText } from "@nen/search";
import type { Book, BookFilters, BookSearchResult, LengthCategory, RankedBook } from "./types";

export const emptyFilters: BookFilters = { age: null, reading: null, lengths: [], genres: [], themes: [], moods: [], difficulty: null, search: "" };
const lengthOrder: LengthCategory[] = ["very-short", "short", "medium", "long"];

function includesAll(source: string[], selected: string[]) { return selected.every((value) => source.includes(value)); }
function readingMatches(book: Book, reading: BookFilters["reading"]) { return !reading || book.readingMode === reading || book.readingMode === "both"; }
function ageMatches(book: Book, age: number | null) { return age === null || (age >= book.ageMin && age <= book.ageMax); }
function text(book: Book) { return [book.title, book.originalTitle, book.author, book.seriesName, book.shortDescription, book.fullDescription, ...book.genres, ...book.themes].filter(Boolean).join(" "); }
function semanticSearchMatch(book: Book, query: string): boolean | null {
  const normalized = query.toLocaleLowerCase("ru").replaceAll("ё", "е");
  if (/перед сном|на ночь|засып/.test(normalized)) return Boolean(book.suitableForBedtime) || book.moods.some((value) => value === "спокойное" || value === "уютное");
  if (/тревож|волнует|успоко/.test(normalized)) return book.moods.some((value) => value === "спокойное" || value === "уютное" || value === "поддерживающее");
  if (/посме|смешн|весел/.test(normalized)) return book.moods.includes("смешное");
  if (/узнать новое|познав|научн/.test(normalized)) return book.themes.some((value) => value === "наука" || value === "природа" || value === "история" || value === "космос");
  return null;
}
function searchMatches(book: Book, query: string) { const semantic = semanticSearchMatch(book, query); return semantic ?? matchesText(text(book), query); }

export function exactMatch(book: Book, filters: BookFilters): boolean {
  return book.status === "published" && ageMatches(book, filters.age) && readingMatches(book, filters.reading)
    && (!filters.search || searchMatches(book, filters.search))
    && includesAll(book.themes, filters.themes) && includesAll(book.genres, filters.genres) && includesAll(book.moods, filters.moods)
    && (!filters.lengths.length || Boolean(book.lengthCategory && filters.lengths.includes(book.lengthCategory)))
    && (!filters.difficulty || book.languageDifficulty === filters.difficulty);
}

function nearestLength(selected: LengthCategory[], candidate?: LengthCategory) {
  if (!selected.length || !candidate) return false;
  return selected.some((value) => Math.abs(lengthOrder.indexOf(value) - lengthOrder.indexOf(candidate)) === 1);
}

function rank(book: Book, filters: BookFilters, relaxReading = false): RankedBook {
  const matched: string[] = [];
  const relaxed: string[] = [];
  let score = 100;
  if (filters.age !== null) matched.push(`возрасту ${filters.age} лет`);
  if (filters.reading) {
    if (readingMatches(book, filters.reading)) { score += 35; matched.push("формату чтения"); }
    else if (relaxReading) relaxed.push("формат чтения");
  }
  if (filters.search) {
    if (searchMatches(book, filters.search)) { score += 24; matched.push("ситуации из поискового запроса"); }
    else relaxed.push("текст поискового запроса");
  }
  const themeMatches = filters.themes.filter((v) => book.themes.includes(v));
  score += themeMatches.length * 16;
  if (themeMatches.length) matched.push(`темам: ${themeMatches.join(", ")}`);
  if (themeMatches.length < filters.themes.length) relaxed.push(themeMatches.length ? `часть тем (${themeMatches.length} из ${filters.themes.length})` : "темы");
  const moodMatches = filters.moods.filter((v) => book.moods.includes(v));
  score += moodMatches.length * 8;
  if (moodMatches.length) matched.push(`настроению: ${moodMatches.join(", ")}`);
  if (moodMatches.length < filters.moods.length) relaxed.push("настроение");
  const genreMatches = filters.genres.filter((v) => book.genres.includes(v));
  score += genreMatches.length * 7;
  if (genreMatches.length) matched.push(`жанру: ${genreMatches.join(", ")}`);
  if (genreMatches.length < filters.genres.length) relaxed.push("точный жанр");
  if (filters.lengths.length) {
    if (book.lengthCategory && filters.lengths.includes(book.lengthCategory)) { score += 12; matched.push("объёму"); }
    else if (nearestLength(filters.lengths, book.lengthCategory)) { score += 5; relaxed.push("объём до соседней категории"); }
    else relaxed.push("объём");
  }
  if (filters.difficulty) {
    if (book.languageDifficulty === filters.difficulty) { score += 6; matched.push("сложности языка"); }
    else relaxed.push("сложность языка");
  }
  return { book, score, matched, relaxed: [...new Set(relaxed)] };
}

export function searchBooks(books: Book[], filters: BookFilters): BookSearchResult {
  const published = books.filter((book) => book.status === "published");
  const exact = published.filter((book) => exactMatch(book, filters)).map((book) => rank(book, filters)).sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title, "ru"));
  if (exact.length) return { exact, nearby: [], explanation: "Все показанные книги соответствуют выбранным условиям." };
  let candidates = published.filter((book) => ageMatches(book, filters.age) && readingMatches(book, filters.reading));
  let relaxedReading = false;
  if (!candidates.length) { candidates = published.filter((book) => ageMatches(book, filters.age)); relaxedReading = Boolean(filters.reading); }
  const nearby = candidates.map((book) => rank(book, filters, relaxedReading)).sort((a, b) => b.score - a.score || a.relaxed.length - b.relaxed.length || a.book.title.localeCompare(b.book.title, "ru")).slice(0, 6);
  return { exact: [], nearby, explanation: relaxedReading ? "Точных совпадений нет. Возраст сохранён, но формат чтения пришлось явно ослабить." : "Точных совпадений нет. Возраст и формат чтения сохранены; показываем книги с максимальным числом остальных совпадений." };
}
