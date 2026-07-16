export type ContentType = "fairy-tale" | "book" | "cartoon" | "movie";

export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  originalTitle: string | null;
  contentType: ContentType;
  categoryLabel: string;
  creator: string | null;
  contributor: string | null;
  studioOrPublisher: string | null;
  countryOrTradition: string | null;
  originalYear: number | string | null;
  referenceEditionOrRelease: string | null;
  isbnOrIdentifier: string | null;
  pageCount: number | null;
  durationMinutes: number | null;
  officialAgeRatingRu: string | null;
  officialAgeRatingSource: string | null;
  recommendedAgeMin: number;
  recommendedAgeMax: number;
  ageGroups: string[];
  genres: string[];
  interests: string[];
  moods: string[];
  suitableForBedtime: boolean;
  suitableForFamily: boolean;
  suitableForIndependentUse: boolean;
  durationCategory: string | null;
  imageUrl: string | null;
  shortDescription: string | null;
  editorialNote: string | null;
  descriptionStatus?: string | null;
  metadataSource: string | null;
  verificationStatus: string | null;
  annotationStatus: string | null;
  note: string | null;
}

export type Situation = "bedtime" | "family" | "independent";
export type FormatFilter = "all" | "reading" | "cartoon" | "movie";

export interface CatalogQuery {
  age: number | null;
  format: FormatFilter;
  interests: string[];
  moods: string[];
  situation: Situation | null;
  duration: string | null;
  search: string;
}

export interface ScoredItem {
  item: CatalogItem;
  score: number;
  reasons: string[];
  missed: string[];
}

export type AppContentType = "book" | "cartoon" | "movie";
export type ReadingMode = "independent" | "together" | "both";

export interface BaseContentItem {
  id: string;
  slug: string;
  type: AppContentType;
  title: string;
  originalTitle?: string;
  description: string;
  imageUrl?: string;
  officialAgeRating?: string;
  nenAgeRecommendation: { min: number; max: number; label: string };
  themes: string[];
  moods: string[];
  country?: string;
  year?: number;
  source: CatalogItem;
}

export interface BookItem extends BaseContentItem {
  type: "book";
  author?: string;
  readingMode: ReadingMode;
  lengthCategory: "short" | "medium" | "long";
  genres: string[];
  languageDifficulty: "easy" | "medium" | "advanced";
  classicOrModern?: "classic" | "modern";
}

export interface CartoonItem extends BaseContentItem {
  type: "cartoon";
  format: "feature" | "short-or-series";
  durationMinutes?: number;
  studio?: string;
  purpose: "educational" | "entertainment" | "mixed";
  pace: "calm" | "moderate" | "dynamic";
}

export interface MovieItem extends BaseContentItem {
  type: "movie";
  durationMinutes?: number;
  audienceType: "family" | "teen";
  genres: string[];
  discussionPotential: "medium" | "high";
}

export type ContentItem = BookItem | CartoonItem | MovieItem;

export interface EditorialCollection {
  id: string;
  slug: string;
  title: string;
  description: string;
  introduction: string;
  itemIds: string[];
  contentTypes: AppContentType[];
  ageLabel?: string;
  publishedAt: string;
  updatedAt?: string;
  seoTitle: string;
  seoDescription: string;
  featured?: boolean;
  status: "published";
}
