import type {
  Cartoon,
  CartoonFormat,
  ContentType,
  Mood,
  Movie,
  MovieFormat,
  ReleaseForm,
  WatchTitle,
} from "./types";

interface BaseFilters {
  age: number | null;
  moods: Mood[];
  themes: string[];
  excludedSensitiveTopics: string[];
  countries: string[];
}

export interface CartoonFilters extends BaseFilters {
  contentType: "cartoon";
  contentFormats: CartoonFormat[];
  releaseForms: ReleaseForm[];
  episodeCountKnown: boolean | null;
}

export interface MovieFilters extends BaseFilters {
  contentType: "movie";
  contentFormats: MovieFormat[];
  hasOfficialRating: boolean | null;
}

export type CatalogFilters = CartoonFilters | MovieFilters;

const baseFilters = (): BaseFilters => ({
  age: null,
  moods: [],
  themes: [],
  excludedSensitiveTopics: [],
  countries: [],
});

export const emptyCartoonFilters = (): CartoonFilters => ({
  ...baseFilters(),
  contentType: "cartoon",
  contentFormats: [],
  releaseForms: [],
  episodeCountKnown: null,
});

export const emptyMovieFilters = (): MovieFilters => ({
  ...baseFilters(),
  contentType: "movie",
  contentFormats: [],
  hasOfficialRating: null,
});

export const emptyFilters = (contentType: ContentType): CatalogFilters =>
  contentType === "cartoon" ? emptyCartoonFilters() : emptyMovieFilters();

export const matchesHardConstraints = (title: WatchTitle, filters: CatalogFilters) =>
  title.contentType === filters.contentType
  && (filters.age === null || (
    filters.age >= title.nenAgeRecommendation.minAge
    && (title.nenAgeRecommendation.maxAge === undefined || filters.age <= title.nenAgeRecommendation.maxAge)
  ))
  && !title.sensitiveTopics.some((topic) => filters.excludedSensitiveTopics.includes(topic));

const includesEvery = (values: readonly string[], selected: readonly string[]) => selected.every((value) => values.includes(value));

export function matchesSoftConstraints(title: WatchTitle, filters: CatalogFilters): boolean {
  if (!filters.contentFormats.includes(title.contentFormat as never) && filters.contentFormats.length) return false;
  if (!includesEvery(title.themes, filters.themes)) return false;
  if (!includesEvery(title.mood, filters.moods)) return false;
  if (filters.countries.length && !filters.countries.some((country) => title.country.includes(country))) return false;

  if (filters.contentType === "cartoon") {
    const cartoon = title as Cartoon;
    if (filters.releaseForms.length && !filters.releaseForms.includes(cartoon.releaseForm)) return false;
    if (filters.episodeCountKnown !== null) {
      const known = cartoon.duration.kind === "series" && cartoon.duration.episodeCount !== undefined;
      if (known !== filters.episodeCountKnown) return false;
    }
  } else {
    const movie = title as Movie;
    if (filters.hasOfficialRating !== null && Boolean(movie.officialRating) !== filters.hasOfficialRating) return false;
  }
  return true;
}

export function filterTitles(titles: readonly WatchTitle[], filters: CartoonFilters): Cartoon[];
export function filterTitles(titles: readonly WatchTitle[], filters: MovieFilters): Movie[];
export function filterTitles(titles: readonly WatchTitle[], filters: CatalogFilters): WatchTitle[];
export function filterTitles(titles: readonly WatchTitle[], filters: CatalogFilters): WatchTitle[] {
  return titles.filter((title) => matchesHardConstraints(title, filters) && matchesSoftConstraints(title, filters));
}
