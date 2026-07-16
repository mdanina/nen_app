export type ReadingMode = "independent" | "together" | "both";
export type LengthCategory = "very-short" | "short" | "medium" | "long";
export type Difficulty = "easy" | "medium" | "advanced";

export interface Book {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  author: string;
  shortDescription: string;
  fullDescription?: string;
  whyRecommended: string;
  editorialReason?: string;
  coverUrl?: string;
  ageMin: number;
  ageMax: number;
  ageLabel: string;
  readingMode: ReadingMode;
  genres: string[];
  themes: string[];
  moods: string[];
  suitableForBedtime?: boolean;
  languageDifficulty?: Difficulty;
  lengthCategory?: LengthCategory;
  lengthLabel?: string;
  pages?: number;
  estimatedReadingMinutes?: number;
  estimatedReadingSessions?: number;
  illustrationsLevel?: "few" | "medium" | "many";
  isSeries?: boolean;
  seriesName?: string;
  classicOrModern?: "classic" | "modern";
  sensitiveTopics: string[];
  similarBookIds?: string[];
  officialAgeRating?: string;
  officialAgeRatingSource?: string;
  nenRating?: number;
  popularityScore?: number;
  featured?: boolean;
  status: "draft" | "published";
  updatedAt?: string;
}

export interface BookFilters {
  age: number | null;
  reading: ReadingMode | null;
  lengths: LengthCategory[];
  genres: string[];
  themes: string[];
  moods: string[];
  difficulty: Difficulty | null;
  search: string;
}

export interface RankedBook {
  book: Book;
  score: number;
  matched: string[];
  relaxed: string[];
}

export interface BookSearchResult { exact: RankedBook[]; nearby: RankedBook[]; explanation: string; }
