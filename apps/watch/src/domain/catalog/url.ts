import type { ContentType, DiscussionPotential, Mood } from "./types";
import {
  emptyCartoonFilters,
  emptyMovieFilters,
  type CatalogFilters,
  type NumberRange,
} from "./filters";

const validMoods = new Set<Mood>(["calm", "cheerful", "adventurous", "thoughtful", "emotional"]);
const validDiscussion = new Set<DiscussionPotential>(["low", "medium", "high"]);
const cartoonFormats = new Set(["animated-feature", "animated-series"] as const);
const movieFormats = new Set(["fiction", "documentary"] as const);
const releaseForms = new Set(["standalone", "series"] as const);

const split = (value: string | null) => value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
const integer = (value: string | null, min: number, max: number) => {
  if (value === null || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
};
const boolean = (value: string | null) => value === "1" ? true : value === "0" ? false : null;

function range(params: URLSearchParams, minKey: string, maxKey: string, min: number, max: number): NumberRange | null {
  const lower = integer(params.get(minKey), min, max);
  const upper = integer(params.get(maxKey), min, max);
  if (lower === undefined && upper === undefined) return null;
  if (lower !== undefined && upper !== undefined && lower > upper) return null;
  return { ...(lower === undefined ? {} : { min: lower }), ...(upper === undefined ? {} : { max: upper }) };
}

const strings = (params: URLSearchParams, key: string) => uniqueSorted(split(params.get(key)));
const enums = <T extends string>(params: URLSearchParams, key: string, allowed: ReadonlySet<T>) =>
  strings(params, key).filter((value): value is T => allowed.has(value as T));

export function parseFiltersFromUrl(contentType: ContentType, search: string): CatalogFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const common = {
    age: integer(params.get("age"), 0, 18) ?? null,
    durationMinutes: range(params, "durationMin", "durationMax", 1, 360),
    moods: enums(params, "mood", validMoods),
    themes: strings(params, "theme"),
    excludedSensitiveTopics: strings(params, "excludeSensitive"),
    countries: strings(params, "country"),
    year: range(params, "yearFrom", "yearTo", 1888, new Date().getFullYear() + 1),
    discussionPotentials: enums(params, "discussion", validDiscussion),
  };
  if (contentType === "cartoon") {
    return {
      ...emptyCartoonFilters(),
      ...common,
      contentFormats: enums(params, "format", cartoonFormats),
      releaseForms: enums(params, "release", releaseForms),
      episodeDurationMinutes: range(params, "episodeMin", "episodeMax", 1, 180),
      episodeCountKnown: boolean(params.get("episodeCountKnown")),
    };
  }
  return {
    ...emptyMovieFilters(),
    ...common,
    contentFormats: enums(params, "format", movieFormats),
    hasOfficialRating: boolean(params.get("officialRating")),
  };
}

const setList = (params: URLSearchParams, key: string, values: readonly string[]) => {
  const normalized = uniqueSorted([...values]);
  if (normalized.length) params.set(key, normalized.join(","));
};
const setRange = (params: URLSearchParams, rangeValue: NumberRange | null, minKey: string, maxKey: string) => {
  if (rangeValue?.min !== undefined) params.set(minKey, String(rangeValue.min));
  if (rangeValue?.max !== undefined) params.set(maxKey, String(rangeValue.max));
};

export function serializeFiltersToUrl(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.age !== null) params.set("age", String(filters.age));
  setRange(params, filters.durationMinutes, "durationMin", "durationMax");
  setList(params, "mood", filters.moods);
  setList(params, "theme", filters.themes);
  setList(params, "excludeSensitive", filters.excludedSensitiveTopics);
  setList(params, "country", filters.countries);
  setRange(params, filters.year, "yearFrom", "yearTo");
  setList(params, "format", filters.contentFormats);
  setList(params, "discussion", filters.discussionPotentials);
  if (filters.contentType === "cartoon") {
    setList(params, "release", filters.releaseForms);
    setRange(params, filters.episodeDurationMinutes, "episodeMin", "episodeMax");
    if (filters.episodeCountKnown !== null) params.set("episodeCountKnown", filters.episodeCountKnown ? "1" : "0");
  } else if (filters.hasOfficialRating !== null) {
    params.set("officialRating", filters.hasOfficialRating ? "1" : "0");
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}
