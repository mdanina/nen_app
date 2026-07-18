import productionCatalog from "../../../../data/generated/watch.json";
import type { WatchV2Title } from "../domain/catalog/watchV2";

const moodMap = {
  "спокойное": "calm", "уютное": "calm", "весёлое": "cheerful",
  "приключенческое": "adventurous", "таинственное": "thoughtful",
  "напряжённое": "emotional", "вдумчивое": "thoughtful",
  "эмоциональное": "emotional", "вдохновляющее": "emotional",
} as const;

function toLegacyUiTitle(item: WatchV2Title) {
  const isSeries = item.kind === "animated-series";
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    ...(item.originalTitle ? { originalTitle: item.originalTitle } : {}),
    contentType: item.kind === "movie" ? "movie" : "cartoon",
    contentFormat: item.kind === "movie" ? "fiction" : isSeries ? "animated-series" : "animated-feature",
    releaseForm: isSeries ? "series" : "standalone",
    shortDescription: item.shortDescription,
    whyRecommended: item.whyRecommended,
    country: item.country,
    year: item.year,
    duration: isSeries
      ? { kind: "series", episodeMinutes: item.duration.episodeMinutes, ...(item.duration.episodeCount ? { episodeCount: item.duration.episodeCount } : {}) }
      : { kind: "standalone", minutes: item.duration.minutes },
    themes: item.themes,
    mood: [...new Set(item.mood.map((value) => moodMap[value]))],
    sensitiveTopics: item.sensitiveTopics,
    discussionPotential: item.discussionTopics.length > 1 ? "high" : "medium",
    nenAgeRecommendation: item.nenAgeRecommendation,
    ...(item.officialRating ? { officialRating: { system: "Возрастная маркировка РФ", ...item.officialRating } } : {}),
    status: "published",
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
