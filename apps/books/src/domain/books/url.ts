import type { BookFilters, Difficulty, LengthCategory, ReadingMode } from "./types";
import { emptyFilters } from "./filters";

const split = (value: string | null) => value?.split(",").filter(Boolean) ?? [];
export function filtersFromUrl(search: string): BookFilters {
  const p = new URLSearchParams(search); const age = Number(p.get("age")); const reading = p.get("reading"); const difficulty = p.get("difficulty");
  return { ...emptyFilters, age: Number.isFinite(age) && age >= 1 && age <= 18 ? age : null, reading: reading === "independent" || reading === "together" || reading === "both" ? reading as ReadingMode : null, lengths: split(p.get("length")).filter((v): v is LengthCategory => ["very-short","short","medium","long"].includes(v)), genres: split(p.get("genres")), themes: split(p.get("themes")), moods: split(p.get("moods")), difficulty: ["easy","medium","advanced"].includes(difficulty ?? "") ? difficulty as Difficulty : null, search: p.get("q") ?? "" };
}
export function filtersToUrl(filters: BookFilters): string {
  const p = new URLSearchParams(); if (filters.age !== null) p.set("age", String(filters.age)); if (filters.reading) p.set("reading", filters.reading); if (filters.lengths.length) p.set("length", filters.lengths.join(",")); if (filters.genres.length) p.set("genres", filters.genres.join(",")); if (filters.themes.length) p.set("themes", filters.themes.join(",")); if (filters.moods.length) p.set("moods", filters.moods.join(",")); if (filters.difficulty) p.set("difficulty", filters.difficulty); if (filters.search) p.set("q", filters.search); return p.toString();
}
