import { contentFormatLabel, type Cartoon, type Movie, type WatchTitle } from "./types";
import { filterTitles, matchesHardConstraints, type CatalogFilters } from "./filters";

export const FILTER_WEIGHTS = {
  contentFormat: 30,
  releaseForm: 24,
  theme: 14,
  mood: 10,
  country: 6,
  episodeCountKnown: 5,
  officialRating: 3,
} as const;

export interface ConditionExplanation {
  key: string;
  label: string;
}

export interface RankedTitle {
  title: WatchTitle;
  score: number;
  matchedConditions: ConditionExplanation[];
  relaxedConditions: ConditionExplanation[];
}

const condition = (key: string, label: string): ConditionExplanation => ({ key, label });
function addArrayCriterion(
  values: readonly string[],
  selected: readonly string[],
  key: string,
  label: string,
  weight: number,
  matched: ConditionExplanation[],
  relaxed: ConditionExplanation[],
) {
  let score = 0;
  for (const value of selected) {
    if (values.includes(value)) {
      score += weight;
      matched.push(condition(`${key}:${value}`, `${label}: ${value}`));
    } else {
      relaxed.push(condition(`${key}:${value}`, `${label}: ${value}`));
    }
  }
  return score;
}

function evaluate(title: WatchTitle, filters: CatalogFilters): RankedTitle {
  const matched: ConditionExplanation[] = [];
  const relaxed: ConditionExplanation[] = [];
  let score = 0;
  if (filters.age !== null) matched.push(condition("age", `возраст ${filters.age} лет`));
  if (filters.excludedSensitiveTopics.length) matched.push(condition("sensitiveTopics", "исключённые чувствительные темы отсутствуют"));

  if (filters.contentFormats.length) {
    if (filters.contentFormats.includes(title.contentFormat as never)) {
      score += FILTER_WEIGHTS.contentFormat;
      matched.push(condition("contentFormat", `формат: ${contentFormatLabel(title.contentFormat)}`));
    } else relaxed.push(condition("contentFormat", "формат контента"));
  }
  score += addArrayCriterion(title.themes, filters.themes, "theme", "тема", FILTER_WEIGHTS.theme, matched, relaxed);
  score += addArrayCriterion(title.mood, filters.moods, "mood", "настроение", FILTER_WEIGHTS.mood, matched, relaxed);
  if (filters.countries.length) {
    const countries = filters.countries.filter((value) => title.country.includes(value));
    if (countries.length) {
      score += FILTER_WEIGHTS.country;
      matched.push(condition("country", `страна: ${countries.join(", ")}`));
    } else relaxed.push(condition("country", "страна"));
  }
  if (filters.contentType === "cartoon") {
    const cartoon = title as Cartoon;
    if (filters.releaseForms.length) {
      if (filters.releaseForms.includes(cartoon.releaseForm)) {
        score += FILTER_WEIGHTS.releaseForm;
        matched.push(condition("releaseForm", `форма выпуска: ${cartoon.releaseForm}`));
      } else relaxed.push(condition("releaseForm", "форма выпуска"));
    }
    if (filters.episodeCountKnown !== null) {
      const known = cartoon.duration.kind === "series" && cartoon.duration.episodeCount !== undefined;
      if (known === filters.episodeCountKnown) {
        score += FILTER_WEIGHTS.episodeCountKnown;
        matched.push(condition("episodeCountKnown", "наличие количества серий"));
      } else relaxed.push(condition("episodeCountKnown", "наличие количества серий"));
    }
  } else {
    const movie = title as Movie;
    if (filters.hasOfficialRating !== null) {
      if (Boolean(movie.officialRating) === filters.hasOfficialRating) {
        score += FILTER_WEIGHTS.officialRating;
        matched.push(condition("officialRating", "наличие официального рейтинга"));
      } else relaxed.push(condition("officialRating", "наличие официального рейтинга"));
    }
  }
  return { title, score, matchedConditions: matched, relaxedConditions: relaxed };
}

const stableSort = (a: RankedTitle, b: RankedTitle) =>
  a.relaxedConditions.length - b.relaxedConditions.length
  || b.score - a.score
  || a.title.title.localeCompare(b.title.title, "ru")
  || a.title.id.localeCompare(b.title.id, "en");

export function rankExactMatches(titles: readonly WatchTitle[], filters: CatalogFilters): RankedTitle[] {
  return filterTitles(titles, filters).map((title) => evaluate(title, filters)).sort(stableSort);
}

export function findNearbyMatches(titles: readonly WatchTitle[], filters: CatalogFilters, limit = 6): RankedTitle[] {
  return titles
    .filter((title) => matchesHardConstraints(title, filters))
    .map((title) => evaluate(title, filters))
    .filter((result) => result.relaxedConditions.length > 0)
    .sort(stableSort)
    .slice(0, Math.max(0, limit));
}
