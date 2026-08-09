export type ContentType = "cartoon" | "movie";
export type Mood = "calm" | "cheerful" | "adventurous" | "thoughtful" | "emotional";
export type ReleaseForm = "standalone" | "series";

export type CartoonFormat = "animated-feature" | "animated-series";
export type MovieFormat = "fiction" | "series" | "documentary";
export type ContentFormat = CartoonFormat | MovieFormat;
export type ProductionKind = "movie" | "animated-feature" | "animated-short" | "animated-series" | "series" | "documentary" | "short-film";

export const contentFormatLabel = (format: ContentFormat) => ({
  "animated-feature": "Мультфильм",
  "animated-series": "Мультсериал",
  fiction: "Фильм",
  series: "Сериал",
  documentary: "Документальный фильм",
})[format];

export interface OfficialRating {
  system: string;
  value: string;
  sourceUrl: string;
}

export interface NenAgeRecommendation {
  minAge: number;
  maxAge?: number;
  rationale: string;
}

export interface StandaloneDuration {
  kind: "standalone";
  minutes: number;
}

export interface SeriesDuration {
  kind: "series";
  episodeMinutes: number;
  episodeMinutesMax?: number;
  episodeCount?: number;
  seasonCount?: number;
}

export type WatchDuration = StandaloneDuration | SeriesDuration;

interface WatchTitleBase {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  titleLocalization?: "official-ru" | "original-only";
  shortDescription: string;
  whyRecommended: string;
  country: string[];
  year: number;
  themes: string[];
  mood: Mood[];
  sensitiveTopics: string[];
  nenAgeRecommendation: NenAgeRecommendation;
  officialRating?: OfficialRating;
  productionKind: ProductionKind;
  genres: string[];
  discussionTopics: string[];
  frame?: {
    url: string;
    studios: string[];
  };
  awards?: string[];
  studios?: string[];
  relatedTitles?: string[];
}

export interface Cartoon extends WatchTitleBase {
  contentType: "cartoon";
  contentFormat: CartoonFormat;
  releaseForm: ReleaseForm;
  duration: WatchDuration;
}

export interface Movie extends WatchTitleBase {
  contentType: "movie";
  contentFormat: MovieFormat;
  releaseForm: ReleaseForm;
  duration: WatchDuration;
}

export type WatchTitle = Cartoon | Movie;

export interface FilterDictionary {
  countries: string[];
  contentFormats: ContentFormat[];
  moods: Mood[];
  themes: string[];
  sensitiveTopics: string[];
  releaseForms: ReleaseForm[];
}
