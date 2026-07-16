import { catalog } from "../data/catalog";
import type { AppContentType, BookItem, CartoonItem, CatalogItem, ContentItem, MovieItem, ReadingMode } from "../types";
import { neutralDescription } from "./catalog";

export function appContentType(item: CatalogItem): AppContentType {
  return item.contentType === "fairy-tale" ? "book" : item.contentType;
}

export function confirmedOfficialRating(item: CatalogItem): string | undefined {
  if (!item.officialAgeRatingRu || !item.officialAgeRatingSource) return undefined;
  if (/требует|зависит|уточн|сверк/i.test(item.officialAgeRatingRu)) return undefined;
  return item.officialAgeRatingRu;
}

function readingMode(item: CatalogItem): ReadingMode {
  if (item.suitableForIndependentUse && item.suitableForFamily) return "both";
  return item.suitableForIndependentUse ? "independent" : "together";
}

function lengthCategory(item: CatalogItem): BookItem["lengthCategory"] {
  if ((item.pageCount ?? 0) > 250 || item.durationCategory === "длинная книга") return "long";
  if ((item.pageCount ?? 0) > 80 || item.durationCategory === "на несколько вечеров") return "medium";
  return "short";
}

function languageDifficulty(item: CatalogItem): BookItem["languageDifficulty"] {
  if (item.recommendedAgeMax <= 6) return "easy";
  if (item.recommendedAgeMin >= 10) return "advanced";
  return "medium";
}

function base(item: CatalogItem, type: AppContentType) {
  return {
    id: item.id,
    slug: item.slug,
    type,
    title: item.title,
    originalTitle: item.originalTitle ?? undefined,
    description: neutralDescription(item),
    imageUrl: item.imageUrl ?? undefined,
    officialAgeRating: confirmedOfficialRating(item),
    nenAgeRecommendation: { min: item.recommendedAgeMin, max: item.recommendedAgeMax, label: `${item.recommendedAgeMin}–${item.recommendedAgeMax} лет` },
    themes: item.interests,
    moods: item.moods,
    country: item.countryOrTradition ?? undefined,
    year: typeof item.originalYear === "number" ? item.originalYear : undefined,
    source: item,
  };
}

function toBook(item: CatalogItem): BookItem {
  const category = item.categoryLabel.toLocaleLowerCase("ru");
  return {
    ...base(item, "book"),
    type: "book",
    author: item.creator ?? undefined,
    readingMode: readingMode(item),
    lengthCategory: lengthCategory(item),
    genres: item.genres,
    languageDifficulty: languageDifficulty(item),
    classicOrModern: category.includes("классичес") || item.contentType === "fairy-tale" ? "classic" : category.includes("современн") ? "modern" : undefined,
  };
}

function toCartoon(item: CatalogItem): CartoonItem {
  const educationalThemes = ["наука", "история", "природа", "техника", "космос"];
  const educational = item.interests.some((value) => educationalThemes.includes(value));
  const funny = item.moods.includes("смешное");
  return {
    ...base(item, "cartoon"),
    type: "cartoon",
    format: (item.durationMinutes ?? 999) <= 30 ? "short-or-series" : "feature",
    durationMinutes: item.durationMinutes ?? undefined,
    studio: item.studioOrPublisher ?? undefined,
    purpose: educational && funny ? "mixed" : educational ? "educational" : "entertainment",
    pace: item.moods.some((value) => value === "спокойное" || value === "уютное") ? "calm" : item.moods.includes("захватывающее") ? "dynamic" : "moderate",
  };
}

function toMovie(item: CatalogItem): MovieItem {
  return {
    ...base(item, "movie"),
    type: "movie",
    durationMinutes: item.durationMinutes ?? undefined,
    audienceType: item.recommendedAgeMin >= 11 ? "teen" : "family",
    genres: item.genres,
    discussionPotential: item.suitableForFamily ? "high" : "medium",
  };
}

export const contentItems: ContentItem[] = catalog.map((item) => {
  const type = appContentType(item);
  if (type === "book") return toBook(item);
  if (type === "cartoon") return toCartoon(item);
  return toMovie(item);
});

export const contentByType = {
  book: contentItems.filter((item): item is BookItem => item.type === "book"),
  cartoon: contentItems.filter((item): item is CartoonItem => item.type === "cartoon"),
  movie: contentItems.filter((item): item is MovieItem => item.type === "movie"),
};

export function contentPath(item: CatalogItem | ContentItem): string {
  const type = "contentType" in item ? appContentType(item) : item.type;
  const section = type === "book" ? "books" : type === "cartoon" ? "cartoons" : "movies";
  return `/${section}/${item.slug}`;
}
