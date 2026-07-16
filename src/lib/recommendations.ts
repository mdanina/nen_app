import type { CatalogItem, CatalogQuery, FormatFilter, ScoredItem, Situation } from "../types";
import { matchesSearch, situationLabels } from "./catalog";

const WATCH_DURATIONS = ["до 15 минут", "до 30 минут", "до 60 минут", "до 90 минут", "больше 90 минут"];
const READ_DURATIONS = ["короткая история", "на один вечер", "на несколько вечеров", "длинная книга"];

function matchesFormat(item: CatalogItem, format: FormatFilter): boolean {
  if (format === "all") return true;
  if (format === "reading") return item.contentType === "book" || item.contentType === "fairy-tale";
  return item.contentType === format;
}

function matchesSituation(item: CatalogItem, situation: Situation | null): boolean {
  if (!situation) return true;
  if (situation === "bedtime") return item.suitableForBedtime;
  if (situation === "family") return item.suitableForFamily;
  return item.suitableForIndependentUse;
}

function isAgeMatch(item: CatalogItem, age: number | null): boolean {
  return age === null || (age >= item.recommendedAgeMin && age <= item.recommendedAgeMax);
}

function isNeighbourDuration(selected: string, candidate: string | null): boolean {
  if (!candidate) return false;
  const scale = WATCH_DURATIONS.includes(selected) ? WATCH_DURATIONS : READ_DURATIONS;
  const selectedIndex = scale.indexOf(selected);
  const candidateIndex = scale.indexOf(candidate);
  return selectedIndex >= 0 && candidateIndex >= 0 && Math.abs(selectedIndex - candidateIndex) === 1;
}

function ageReason(item: CatalogItem): string {
  return `Подходит для ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет`;
}

function evaluate(item: CatalogItem, query: CatalogQuery, knownInterests: Set<string>): ScoredItem {
  const reasons: string[] = [];
  const missed: string[] = [];
  let score = 0;

  const ageMatches = isAgeMatch(item, query.age);
  if (ageMatches) {
    score += 100;
    if (query.age !== null) reasons.push(ageReason(item));
  } else missed.push("Не совпадает по возрасту");

  const formatMatches = matchesFormat(item, query.format);
  if (formatMatches) score += query.format === "all" ? 0 : 40;
  else missed.push("Другой тип произведения");

  const situationMatches = matchesSituation(item, query.situation);
  if (situationMatches) {
    if (query.situation) {
      score += 25;
      reasons.push(situationLabels[query.situation]);
    }
  } else missed.push("Не совпадает ситуация использования");

  const knownSelectedInterests = query.interests.filter((value) => knownInterests.has(value));
  const interestMatches = query.interests.filter((value) => item.interests.includes(value));
  if (query.interests.length) {
    score += interestMatches.length * 14;
    if (interestMatches.length) reasons.push(`Совпадает по интересу: ${interestMatches.slice(0, 2).join(", ")}`);
    if (interestMatches.length < query.interests.length) {
      missed.push(knownSelectedInterests.length === 0 ? "Выбранный интерес пока не представлен в базе" : `Совпадает ${interestMatches.length} из ${query.interests.length} интересов`);
    }
  }

  const moodMatches = query.moods.filter((value) => item.moods.includes(value));
  if (query.moods.length) {
    score += moodMatches.length * 7;
    if (moodMatches.length) reasons.push(`Совпадает настроение: ${moodMatches.slice(0, 2).join(", ")}`);
    if (moodMatches.length < query.moods.length) missed.push("Настроение отличается от выбранного");
  }

  if (query.duration) {
    if (item.durationCategory === query.duration) {
      score += 16;
      reasons.push(`Подходит по длительности: ${query.duration}`);
    } else if (isNeighbourDuration(query.duration, item.durationCategory)) {
      score += 7;
      missed.push(`Немного отличается по длительности: ${item.durationCategory ?? "не указана"}`);
    } else missed.push("Заметно отличается по длительности");
  }

  if (query.search) {
    if (matchesSearch(item, query.search)) {
      score += 24;
      reasons.push("Соответствует поисковому запросу");
    } else missed.push("Не совпадает с текстом поиска");
  }

  return { item, score, reasons, missed };
}

function isExact(result: ScoredItem): boolean {
  return result.missed.length === 0;
}

function sortByRelevance(a: ScoredItem, b: ScoredItem): number {
  return b.score - a.score || a.missed.length - b.missed.length || a.item.title.localeCompare(b.item.title, "ru");
}

export interface RecommendationResult {
  exact: ScoredItem[];
  partial: ScoredItem[];
  alternateType: ScoredItem[];
}

export function recommend(items: CatalogItem[], query: CatalogQuery): RecommendationResult {
  const knownInterests = new Set(items.flatMap((item) => item.interests));
  const knownSelectedInterests = query.interests.filter((value) => knownInterests.has(value));
  const evaluated = items.map((item) => evaluate(item, query, knownInterests));
  const exact = evaluated.filter(isExact).sort(sortByRelevance);

  const ageEligible = evaluated.filter((result) => !isExact(result) && isAgeMatch(result.item, query.age));
  const interestEligible = ageEligible.filter((result) => {
    if (knownSelectedInterests.length > 0 && !knownSelectedInterests.some((value) => result.item.interests.includes(value))) return false;
    return true;
  });
  const ageAndInterestEligible = interestEligible.length > 0 ? interestEligible : ageEligible;
  const durationEligible = ageAndInterestEligible.filter((result) => {
    if (query.duration && result.item.durationCategory !== query.duration && !isNeighbourDuration(query.duration, result.item.durationCategory)) return false;
    return true;
  });
  const eligible = durationEligible.length > 0 ? durationEligible : ageAndInterestEligible;

  const sameType = eligible.filter((result) => matchesFormat(result.item, query.format));
  const situationPreserving = query.situation ? sameType.filter((result) => matchesSituation(result.item, query.situation)) : sameType;
  const preferredPool = situationPreserving.length > 0 ? situationPreserving : sameType;
  const needed = Math.max(0, 6 - exact.length);
  const partial = exact.length < 3 ? preferredPool.sort(sortByRelevance).slice(0, needed || 3) : [];

  const alternateType = exact.length === 0 && partial.length === 0 && query.format !== "all"
    ? eligible.filter((result) => !matchesFormat(result.item, query.format)).sort(sortByRelevance).slice(0, 4)
    : [];

  return { exact, partial, alternateType };
}

export function similarItems(source: CatalogItem, items: CatalogItem[]): CatalogItem[] {
  return items
    .filter((item) => item.id !== source.id)
    .map((item) => ({
      item,
      score:
        Math.max(0, 5 - Math.abs((item.recommendedAgeMin + item.recommendedAgeMax) / 2 - (source.recommendedAgeMin + source.recommendedAgeMax) / 2)) +
        item.interests.filter((value) => source.interests.includes(value)).length * 3 +
        item.moods.filter((value) => source.moods.includes(value)).length * 2 +
        item.genres.filter((value) => source.genres.includes(value)).length * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => item);
}
