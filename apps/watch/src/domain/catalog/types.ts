export type ContentType = "cartoon" | "movie";
export type Mood = "calm" | "cheerful" | "adventurous" | "thoughtful" | "emotional";
export type DiscussionPotential = "low" | "medium" | "high";
export type ReleaseForm = "standalone" | "series";

export type CartoonFormat = "animated-feature" | "animated-series";
export type MovieFormat = "fiction" | "documentary";
export type ContentFormat = CartoonFormat | MovieFormat;

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
  episodeCount?: number;
}

export type WatchDuration = StandaloneDuration | SeriesDuration;

interface WatchTitleBase {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  shortDescription: string;
  whyRecommended: string;
  country: string[];
  year: number;
  themes: string[];
  mood: Mood[];
  sensitiveTopics: string[];
  discussionPotential: DiscussionPotential;
  nenAgeRecommendation: NenAgeRecommendation;
  officialRating?: OfficialRating;
  status: "draft" | "published";
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
  releaseForm: "standalone";
  duration: StandaloneDuration;
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
