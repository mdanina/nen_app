export const WATCH_V2_SCHEMA_VERSION = 2 as const;

export type WatchV2Kind =
  | "movie"
  | "animated-feature"
  | "animated-short"
  | "animated-series"
  | "series"
  | "documentary";
export type RussianAgeRating = "0+" | "6+" | "12+" | "16+" | "18+";

export const WATCH_MOODS = [
  "спокойное", "весёлое", "уютное", "приключенческое", "таинственное",
  "напряжённое", "вдумчивое", "эмоциональное", "вдохновляющее",
] as const;
export type WatchMood = typeof WATCH_MOODS[number];

export const WATCH_GENRES = [
  "семейный", "комедия", "драма", "приключения", "фэнтези", "фантастика",
  "детектив", "сказка", "мюзикл", "мелодрама", "исторический",
  "биографический", "спортивный", "триллер",
] as const;
export type WatchGenre = typeof WATCH_GENRES[number];

export const WATCH_THEMES = [
  "семья", "дружба", "отношения с родителями", "братья и сёстры", "взросление",
  "самостоятельность", "самопринятие", "эмпатия", "ответственность", "смелость",
  "выбор", "справедливость", "командная работа", "школа", "животные", "природа",
  "экология", "путешествия", "волшебство", "космос", "наука", "технологии",
  "история", "искусство", "музыка", "спорт", "мечты", "культурное разнообразие",
  "утрата", "разлука",
] as const;
export type WatchTheme = typeof WATCH_THEMES[number];

export interface WatchV2OfficialRating {
  value: RussianAgeRating;
  sourceUrl: string;
  sourceTitle?: string;
}

export interface WatchV2NenAgeRecommendation {
  minAge: number;
  maxAge?: number;
  rationale: string;
}

export interface WatchV2StandaloneDuration {
  minutes: number;
}

export interface WatchV2SeriesDuration {
  episodeMinutes: number;
  episodeCount?: number;
  seasonCount?: number;
  episodeMinutesMax?: number;
}

export interface WatchV2Frame {
  url: string;
  studios: string[];
}

export interface WatchV2Award {
  title: string;
}

interface WatchV2Base {
  schemaVersion: typeof WATCH_V2_SCHEMA_VERSION;
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  shortDescription: string;
  whyRecommended: string;
  country: string[];
  year: number;
  genres: WatchGenre[];
  themes: WatchTheme[];
  discussionTopics: string[];
  mood: WatchMood[];
  sensitiveTopics: string[];
  nenAgeRecommendation: WatchV2NenAgeRecommendation;
  officialRating?: WatchV2OfficialRating;
  frame?: WatchV2Frame;
  awards?: WatchV2Award[];
}

interface WatchV2StandaloneTitle extends WatchV2Base {
  kind: "movie" | "animated-feature" | "animated-short" | "documentary";
  duration: WatchV2StandaloneDuration;
}

interface WatchV2Series extends WatchV2Base {
  kind: "animated-series" | "series";
  duration: WatchV2SeriesDuration;
}

export type WatchV2Title = WatchV2StandaloneTitle | WatchV2Series;
