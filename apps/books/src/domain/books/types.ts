export type ReadingMode = "independent" | "together" | "both";
export type LengthCategory = "very-short" | "short" | "medium" | "long";
export type Difficulty = "easy" | "medium" | "advanced";
export type IdentificationStatus = "provisional" | "identified";
export type CoverKind = "local" | "external" | "placeholder";
export type CoverRightsStatus = "licensed" | "open-license" | "public-domain" | "external-display-only" | "unverified" | "not-required";

export interface BookCoverData {
  kind: CoverKind;
  url?: string;
  rightsStatus: CoverRightsStatus;
  sourceName?: string;
  sourcePageUrl?: string;
  isbn13?: string;
  temporary?: boolean;
  attribution?: string;
  verifiedAt?: string;
  assignmentMethod?: "global_ocr_work_match" | "canonical_work_official_cover";
  assignmentConfidence?: number;
  assignmentVerifiedAt?: string;
}

export interface Book {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  author: string;
  shortDescription: string;
  fullDescription?: string;
  annotationProvenance?: {
    source: string | null;
    sourceUrl?: string;
    method: string;
    evidenceField?: string;
    verifiedAt: string;
    copiedVerbatim: boolean;
  };
  whyRecommended: string;
  editorialReason?: string;
  coverUrl?: string;
  cover?: BookCoverData;
  identificationStatus?: IdentificationStatus;
  isbn13?: string;
  publisher?: string;
  publicationYear?: number;
  bibliographicSources?: string[];
  ageMin: number;
  ageMax: number;
  ageLabel: string;
  readingMode: ReadingMode;
  genres: string[];
  themes: string[];
  moods: string[];
  bookFormats?: string[];
  lifeSituations?: string[];
  emotionalStates?: string[];
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
  translator?: string;
  classicOrModern?: "classic" | "modern";
  sensitiveTopics: string[];
  sensitiveTopicsReviewed?: boolean;
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
  publishers: string[];
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
