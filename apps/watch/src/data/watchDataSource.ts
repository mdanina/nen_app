import productionCatalog from "../../../../data/generated/watch.json";
import type { WatchV2Title } from "../domain/catalog/watchV2";

const moodMap = {
  "спокойное": "calm", "уютное": "calm", "весёлое": "cheerful",
  "приключенческое": "adventurous", "таинственное": "thoughtful",
  "напряжённое": "emotional", "вдумчивое": "thoughtful",
  "эмоциональное": "emotional", "вдохновляющее": "emotional",
} as const;

function toLegacyUiTitle(item: WatchV2Title) {
  const isSeries = item.kind === "animated-series" || item.kind === "series";
  const isCartoon = item.kind.startsWith("animated-");
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    originalTitle: item.originalTitle,
    titleLocalization: item.titleLocalization,
    contentType: isCartoon ? "cartoon" : "movie",
    contentFormat: item.kind === "documentary" ? "documentary" : item.kind === "series" ? "series" : item.kind === "movie" || item.kind === "short-film" ? "fiction" : isSeries ? "animated-series" : "animated-feature",
    releaseForm: isSeries ? "series" : "standalone",
    productionKind: item.kind,
    shortDescription: item.shortDescription,
    whyRecommended: item.whyRecommended,
    country: item.country,
    year: item.year,
    duration: "episodeMinutes" in item.duration
      ? {
          kind: "series",
          episodeMinutes: item.duration.episodeMinutes,
          ...(item.duration.episodeMinutesMax ? { episodeMinutesMax: item.duration.episodeMinutesMax } : {}),
          ...(item.duration.episodeCount ? { episodeCount: item.duration.episodeCount } : {}),
          ...(item.duration.seasonCount ? { seasonCount: item.duration.seasonCount } : {}),
        }
      : { kind: "standalone", minutes: item.duration.minutes },
    genres: item.genres,
    discussionTopics: item.discussionTopics,
    themes: item.themes,
    mood: [...new Set(item.mood.map((value) => moodMap[value]))],
    sensitiveTopics: item.sensitiveTopics,
    nenAgeRecommendation: item.nenAgeRecommendation,
    ...(item.frame ? { frame: item.frame } : {}),
    ...(item.awards?.length ? { awards: item.awards.map((award) => award.title) } : {}),
    ...(item.studios?.length ? { studios: item.studios } : {}),
    ...(item.relatedTitles?.length ? { relatedTitles: item.relatedTitles } : {}),
    ...(item.officialRating ? { officialRating: { system: "Возрастная маркировка РФ", ...item.officialRating } } : {}),
  };
}

export interface WatchDataSource {
  load(): Promise<unknown>;
}

export class StaticWatchDataSource implements WatchDataSource {
  constructor(private readonly input: unknown = (productionCatalog as WatchV2Title[]).map(toLegacyUiTitle)) {}

  async load(): Promise<unknown> {
    return this.input;
  }
}
