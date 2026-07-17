import type { ContentType, Mood } from "./types";
import {
  emptyCartoonFilters,
  emptyMovieFilters,
  type CatalogFilters,
} from "./filters";

const validMoods = new Set<Mood>(["calm", "cheerful", "adventurous", "thoughtful", "emotional"]);
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

const strings = (params: URLSearchParams, key: string) => uniqueSorted(split(params.get(key)));
const enums = <T extends string>(params: URLSearchParams, key: string, allowed: ReadonlySet<T>) =>
  strings(params, key).filter((value): value is T => allowed.has(value as T));

export function parseFiltersFromUrl(contentType: ContentType, search: string): CatalogFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const common = {
    age: integer(params.get("age"), 0, 18) ?? null,
    moods: enums(params, "mood", validMoods),
    themes: strings(params, "theme"),
    excludedSensitiveTopics: strings(params, "excludeSensitive"),
    countries: strings(params, "country"),
  };
  if (contentType === "cartoon") {
    return {
      ...emptyCartoonFilters(),
      ...common,
      contentFormats: enums(params, "format", cartoonFormats),
      releaseForms: enums(params, "release", releaseForms),
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
export function serializeFiltersToUrl(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.age !== null) params.set("age", String(filters.age));
  setList(params, "mood", filters.moods);
  setList(params, "theme", filters.themes);
  setList(params, "excludeSensitive", filters.excludedSensitiveTopics);
  setList(params, "country", filters.countries);
  setList(params, "format", filters.contentFormats);
  if (filters.contentType === "cartoon") {
    setList(params, "release", filters.releaseForms);
    if (filters.episodeCountKnown !== null) params.set("episodeCountKnown", filters.episodeCountKnown ? "1" : "0");
  } else if (filters.hasOfficialRating !== null) {
    params.set("officialRating", filters.hasOfficialRating ? "1" : "0");
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}
