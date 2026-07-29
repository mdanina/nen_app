import type {
  Cartoon,
  ContentFormat,
  Mood,
  WatchTitle,
} from "./types";

export interface ValidationIssue {
  index: number;
  field: string;
  message: string;
}

export interface CatalogValidationResult {
  items: WatchTitle[];
  issues: ValidationIssue[];
}

const moods = new Set<Mood>(["calm", "cheerful", "adventurous", "thoughtful", "emotional"]);
const cartoonFormats = new Set<ContentFormat>(["animated-feature", "animated-series"]);
const movieFormats = new Set<ContentFormat>(["fiction", "series", "documentary"]);
const topLevelKeys = new Set([
  "id", "slug", "title", "originalTitle", "contentType", "contentFormat", "releaseForm",
  "shortDescription", "whyRecommended", "country", "year", "duration", "themes", "mood",
  "sensitiveTopics", "nenAgeRecommendation", "officialRating", "productionKind", "genres",
  "discussionTopics", "frame", "awards",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function issue(issues: ValidationIssue[], index: number, field: string, message: string) {
  issues.push({ index, field, message });
}

function requiredString(record: Record<string, unknown>, field: string, index: number, issues: ValidationIssue[]) {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    issue(issues, index, field, "Обязательное непустое строковое поле");
    return false;
  }
  return true;
}

function stringArray(record: Record<string, unknown>, field: string, index: number, issues: ValidationIssue[]) {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    issue(issues, index, field, "Ожидается массив непустых строк");
    return false;
  }
  return true;
}

function unknownKeys(record: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(record).filter((key) => !allowed.has(key));
}

function validateNenRecommendation(value: unknown, index: number, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    issue(issues, index, "nenAgeRecommendation", "Обязательный объект рекомендации НЭН");
    return;
  }
  for (const key of unknownKeys(value, new Set(["minAge", "maxAge", "rationale"]))) {
    issue(issues, index, `nenAgeRecommendation.${key}`, "Поле не относится к рекомендации НЭН");
  }
  const min = value.minAge;
  const max = value.maxAge;
  if (!Number.isInteger(min) || Number(min) < 0 || Number(min) > 18) {
    issue(issues, index, "nenAgeRecommendation.minAge", "Возраст должен быть целым числом от 0 до 18");
  }
  if (max !== undefined && (!Number.isInteger(max) || Number(max) < Number(min) || Number(max) > 18)) {
    issue(issues, index, "nenAgeRecommendation.maxAge", "Максимальный возраст должен быть не меньше минимального и не больше 18");
  }
  if (typeof value.rationale !== "string" || !value.rationale.trim()) {
    issue(issues, index, "nenAgeRecommendation.rationale", "Нужно обоснование рекомендации НЭН");
  }
}

function validateOfficialRating(value: unknown, index: number, issues: ValidationIssue[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issue(issues, index, "officialRating", "Официальный рейтинг должен быть объектом");
    return;
  }
  for (const key of unknownKeys(value, new Set(["system", "value", "sourceUrl"]))) {
    issue(issues, index, `officialRating.${key}`, "Поле не относится к официальному рейтингу");
  }
  for (const field of ["system", "value", "sourceUrl"]) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      issue(issues, index, `officialRating.${field}`, "Обязательное поле официального рейтинга");
    }
  }
  if (typeof value.sourceUrl === "string" && !/^https?:\/\//.test(value.sourceUrl)) {
    issue(issues, index, "officialRating.sourceUrl", "Источник должен быть HTTP(S)-ссылкой");
  }
}

function validateDuration(record: Record<string, unknown>, index: number, issues: ValidationIssue[]) {
  const value = record.duration;
  if (!isRecord(value)) {
    issue(issues, index, "duration", "Обязательный объект длительности");
    return;
  }
  if (value.kind === "standalone") {
    for (const key of unknownKeys(value, new Set(["kind", "minutes"]))) issue(issues, index, `duration.${key}`, "Недопустимое поле длительности");
    if (!Number.isInteger(value.minutes) || Number(value.minutes) < 1 || Number(value.minutes) > 360) {
      issue(issues, index, "duration.minutes", "Длительность должна быть целым числом от 1 до 360 минут");
    }
    if (record.releaseForm !== "standalone") issue(issues, index, "duration.kind", "Тип длительности не совпадает с releaseForm");
    return;
  }
  if (value.kind === "series") {
    for (const key of unknownKeys(value, new Set(["kind", "episodeMinutes", "episodeMinutesMax", "episodeCount", "seasonCount"]))) issue(issues, index, `duration.${key}`, "Недопустимое поле длительности");
    if (!Number.isInteger(value.episodeMinutes) || Number(value.episodeMinutes) < 1 || Number(value.episodeMinutes) > 180) {
      issue(issues, index, "duration.episodeMinutes", "Длительность серии должна быть целым числом от 1 до 180 минут");
    }
    if (value.episodeCount !== undefined && (!Number.isInteger(value.episodeCount) || Number(value.episodeCount) < 1)) {
      issue(issues, index, "duration.episodeCount", "Количество серий должно быть положительным целым числом");
    }
    if (value.seasonCount !== undefined && (!Number.isInteger(value.seasonCount) || Number(value.seasonCount) < 1)) {
      issue(issues, index, "duration.seasonCount", "Количество сезонов должно быть положительным целым числом");
    }
    if (record.releaseForm !== "series") issue(issues, index, "duration.kind", "Тип длительности не совпадает с releaseForm");
    return;
  }
  issue(issues, index, "duration.kind", "Неизвестный тип длительности");
}

function validateRecord(record: Record<string, unknown>, index: number, issues: ValidationIssue[]) {
  for (const key of unknownKeys(record, topLevelKeys)) issue(issues, index, key, "Неизвестное поле");
  for (const field of ["id", "slug", "title", "shortDescription", "whyRecommended"]) requiredString(record, field, index, issues);
  if (typeof record.slug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) issue(issues, index, "slug", "Slug должен быть в kebab-case");
  if (record.originalTitle !== undefined && (typeof record.originalTitle !== "string" || !record.originalTitle.trim())) issue(issues, index, "originalTitle", "Ожидается непустая строка");
  for (const field of ["country", "themes", "mood", "sensitiveTopics", "genres", "discussionTopics"]) stringArray(record, field, index, issues);
  if (!Number.isInteger(record.year) || Number(record.year) < 1888 || Number(record.year) > new Date().getFullYear() + 1) issue(issues, index, "year", "Некорректный год выпуска");
  if (!Array.isArray(record.mood) || record.mood.some((value) => !moods.has(value as Mood))) issue(issues, index, "mood", "Неизвестное настроение");

  if (record.contentType === "cartoon") {
    if (!cartoonFormats.has(record.contentFormat as ContentFormat)) issue(issues, index, "contentFormat", "Формат не относится к мультфильмам");
    if (record.releaseForm !== "standalone" && record.releaseForm !== "series") issue(issues, index, "releaseForm", "Неизвестная форма выпуска");
    if (record.contentFormat === "animated-feature" && record.releaseForm !== "standalone") issue(issues, index, "releaseForm", "Полнометражный мультфильм должен быть standalone");
    if (record.contentFormat === "animated-series" && record.releaseForm !== "series") issue(issues, index, "releaseForm", "Анимационный сериал должен иметь releaseForm series");
  } else if (record.contentType === "movie") {
    if (!movieFormats.has(record.contentFormat as ContentFormat)) issue(issues, index, "contentFormat", "Формат не относится к фильмам");
    if (record.releaseForm !== "standalone" && record.releaseForm !== "series") issue(issues, index, "releaseForm", "Неизвестная форма выпуска");
  } else {
    issue(issues, index, "contentType", "Допустимы только cartoon и movie");
  }
  validateDuration(record, index, issues);
  validateNenRecommendation(record.nenAgeRecommendation, index, issues);
  validateOfficialRating(record.officialRating, index, issues);
}

export function validateCatalog(input: unknown): CatalogValidationResult {
  if (!Array.isArray(input)) return { items: [], issues: [{ index: -1, field: "catalog", message: "Каталог должен быть массивом" }] };
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const items: WatchTitle[] = [];
  input.forEach((value, index) => {
    if (!isRecord(value)) {
      issue(issues, index, "record", "Запись должна быть объектом");
      return;
    }
    const start = issues.length;
    if (typeof value.id === "string") {
      if (ids.has(value.id)) issue(issues, index, "id", "Дублирующийся id");
      ids.add(value.id);
    }
    if (typeof value.slug === "string") {
      if (slugs.has(value.slug)) issue(issues, index, "slug", "Дублирующийся slug");
      slugs.add(value.slug);
    }
    validateRecord(value, index, issues);
    if (issues.length === start) items.push(value as unknown as WatchTitle);
  });
  return { items, issues };
}

export const isCartoon = (item: WatchTitle): item is Cartoon => item.contentType === "cartoon";
