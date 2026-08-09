import type { WatchTitle } from "./types";

export type SeriesCategory = "all" | "live-action" | "animated" | "documentary" | "educational";

export interface SeriesCatalogFilters {
  query: string;
  category: SeriesCategory;
  age: number | null;
  country: string;
}

export const isSeriesTitle = (title: WatchTitle) => title.releaseForm === "series";

export function filterSeriesTitles(titles: readonly WatchTitle[], filters: SeriesCatalogFilters): WatchTitle[] {
  const query = filters.query.trim().toLocaleLowerCase("ru");
  return titles.filter((title) => {
    if (!isSeriesTitle(title)) return false;
    if (filters.category === "animated" && title.productionKind !== "animated-series") return false;
    if (filters.category === "live-action" && title.productionKind !== "series") return false;
    if (filters.category === "documentary" && !title.genres.includes("документальный")) return false;
    if (filters.category === "educational" && !title.genres.includes("образовательный")) return false;
    if (filters.age !== null && (
      filters.age < title.nenAgeRecommendation.minAge
      || (title.nenAgeRecommendation.maxAge !== undefined && filters.age > title.nenAgeRecommendation.maxAge)
    )) return false;
    if (filters.country && !title.country.includes(filters.country)) return false;
    if (query) {
      const searchable = [
        title.title,
        title.originalTitle,
        title.shortDescription,
        ...title.themes,
        ...title.genres,
      ].filter(Boolean).join(" ").toLocaleLowerCase("ru");
      if (!searchable.includes(query)) return false;
    }
    return true;
  }).sort((left, right) => left.title.localeCompare(right.title, "ru") || left.year - right.year);
}
