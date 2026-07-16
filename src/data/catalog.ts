import rawCatalog from "./catalog.json";
import type { CatalogItem } from "../types";

const requiredKeys: (keyof CatalogItem)[] = ["id", "slug", "title", "contentType", "recommendedAgeMin", "recommendedAgeMax"];

export const catalog: CatalogItem[] = (rawCatalog as CatalogItem[]).filter((item) =>
  requiredKeys.every((key) => item[key] !== undefined),
);

if (catalog.length === 0) {
  throw new Error("Каталог не удалось прочитать");
}

export const filterOptions = {
  interests: [...new Set(catalog.flatMap((item) => item.interests))].sort((a, b) => a.localeCompare(b, "ru")),
  moods: [...new Set(catalog.flatMap((item) => item.moods))].sort((a, b) => a.localeCompare(b, "ru")),
  durations: [...new Set(catalog.map((item) => item.durationCategory).filter((value): value is string => Boolean(value)))],
};

export const ageBounds = {
  min: Math.min(...catalog.map((item) => item.recommendedAgeMin)),
  max: Math.max(...catalog.map((item) => item.recommendedAgeMax)),
};
