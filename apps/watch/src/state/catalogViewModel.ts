import type { WatchTitle } from "../domain/catalog/types";
import { findNearbyMatches, rankExactMatches, type RankedTitle } from "../domain/catalog/ranking";
import type { CatalogFilters } from "../domain/catalog/filters";
import type { ContentType } from "../domain/catalog/types";

export type CatalogResultState =
  | { kind: "exact"; results: RankedTitle[] }
  | { kind: "nearby"; results: RankedTitle[] }
  | { kind: "empty"; results: [] };

export function buildCatalogResult(titles: readonly WatchTitle[], filters: CatalogFilters): CatalogResultState {
  const exact = rankExactMatches(titles, filters);
  if (exact.length) return { kind: "exact", results: exact };
  const nearby = findNearbyMatches(titles, filters);
  return nearby.length ? { kind: "nearby", results: nearby } : { kind: "empty", results: [] };
}

export function toggleFilterValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function findDetailTitle(titles: readonly WatchTitle[], slug: string, contentType: ContentType): WatchTitle | null {
  return titles.find((title) => title.slug === slug && title.contentType === contentType) ?? null;
}
