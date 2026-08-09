import { WATCH_GENRES, WATCH_MOODS, WATCH_THEMES, type WatchV2Title } from "./watchV2";

export interface WatchV2Issue {
  field: string;
  message: string;
}

const kinds = new Set(["movie", "animated-feature", "animated-short", "animated-series", "series", "documentary", "short-film"]);
const moods = new Set<string>(WATCH_MOODS);
const genres = new Set<string>(WATCH_GENRES);
const themes = new Set<string>(WATCH_THEMES);
const ratings = new Set(["0+", "6+", "12+", "16+", "18+"]);
const titleLocalizations = new Set(["official-ru", "original-only"]);
const serviceText = /\b(?:demo|test|sample|todo|tbd)\b|демонстрацион|тестов|заглушк|заполнить позже|уточнить позже/iu;
const allowedFields = new Set([
  "schemaVersion", "id", "slug", "title", "originalTitle", "titleLocalization", "kind", "shortDescription",
  "whyRecommended", "country", "year", "duration", "genres", "themes", "discussionTopics",
  "mood", "sensitiveTopics", "nenAgeRecommendation", "officialRating", "frame", "awards", "studios", "relatedTitles",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmptyString = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const httpUrl = (value: unknown) => nonEmptyString(value) && /^https?:\/\//u.test(value as string);
const stringArray = (value: unknown, allowEmpty = false) =>
  Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(nonEmptyString);

export function validateWatchV2Record(value: unknown): WatchV2Issue[] {
  const issues: WatchV2Issue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!isRecord(value)) return [{ field: "record", message: "Запись должна быть объектом" }];

  for (const field of Object.keys(value).filter((field) => !allowedFields.has(field))) add(field, "Поле не входит в watch-v2");
  if (value.schemaVersion !== 2) add("schemaVersion", "Для watch-v2 требуется schemaVersion: 2");
  for (const field of ["id", "slug", "title", "originalTitle"]) if (!nonEmptyString(value[field])) add(field, "Обязательная непустая строка");
  if (typeof value.slug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.slug)) add("slug", "Ожидается kebab-case");
  if (!titleLocalizations.has(String(value.titleLocalization))) add("titleLocalization", "Ожидается official-ru или original-only");
  if (value.titleLocalization === "original-only" && value.title !== value.originalTitle) add("title", "Без официального русского названия основным должно быть оригинальное название");
  if (!kinds.has(String(value.kind))) add("kind", "Неизвестный вид произведения");

  for (const [field, minLength] of [["shortDescription", 40], ["whyRecommended", 40]] as const) {
    if (!nonEmptyString(value[field]) || String(value[field]).trim().length < minLength) add(field, `Содержательный текст должен быть не короче ${minLength} символов`);
    else if (serviceText.test(String(value[field]))) add(field, "Служебный или шаблонный текст запрещён");
  }
  for (const field of ["country", "genres", "themes", "mood", "discussionTopics"]) {
    if (!stringArray(value[field])) add(field, "Для production требуется непустой массив непустых строк");
  }
  if (!stringArray(value.sensitiveTopics, true)) add("sensitiveTopics", "Ожидается массив непустых строк; пустой массив означает, что значимые темы не выделены");
  if (Array.isArray(value.mood) && value.mood.some((item) => !moods.has(String(item)))) add("mood", "Неизвестное настроение");
  if (Array.isArray(value.genres) && value.genres.some((item) => !genres.has(String(item)))) add("genres", "Неизвестный жанр");
  if (Array.isArray(value.themes) && value.themes.some((item) => !themes.has(String(item)))) add("themes", "Неизвестная тема");
  if (Array.isArray(value.discussionTopics) && value.discussionTopics.some((item) => String(item).trim().length < 12 || serviceText.test(String(item)))) add("discussionTopics", "Каждая тема обсуждения должна быть содержательной");
  if (!Number.isInteger(value.year) || Number(value.year) < 1888 || Number(value.year) > new Date().getFullYear() + 1) add("year", "Некорректный год");

  if (!isRecord(value.duration)) add("duration", "Обязательный объект длительности");
  else if (value.kind === "animated-series" || value.kind === "series") {
    if (Object.keys(value.duration).some((key) => !["episodeMinutes", "episodeMinutesMax", "episodeCount", "seasonCount"].includes(key))) add("duration", "Для сериала допустимы только episodeMinutes, episodeMinutesMax, episodeCount и seasonCount");
    if (!Number.isInteger(value.duration.episodeMinutes) || Number(value.duration.episodeMinutes) < 1 || Number(value.duration.episodeMinutes) > 180) add("duration.episodeMinutes", "Ожидается 1–180 минут");
    if (value.duration.episodeMinutesMax !== undefined && (!Number.isInteger(value.duration.episodeMinutesMax) || Number(value.duration.episodeMinutesMax) < Number(value.duration.episodeMinutes) || Number(value.duration.episodeMinutesMax) > 240)) add("duration.episodeMinutesMax", "Верхняя граница должна быть не меньше обычной длительности и не больше 240 минут");
    if (value.duration.episodeCount !== undefined && (!Number.isInteger(value.duration.episodeCount) || Number(value.duration.episodeCount) < 1)) add("duration.episodeCount", "Количество серий должно быть положительным целым числом");
    if (value.duration.seasonCount !== undefined && (!Number.isInteger(value.duration.seasonCount) || Number(value.duration.seasonCount) < 1)) add("duration.seasonCount", "Количество сезонов должно быть положительным целым числом");
  } else {
    if (Object.keys(value.duration).some((key) => key !== "minutes")) add("duration", "Для отдельного произведения допустимо только minutes");
    if (!Number.isInteger(value.duration.minutes) || Number(value.duration.minutes) < 1 || Number(value.duration.minutes) > 360) add("duration.minutes", "Ожидается 1–360 минут");
    if (value.kind === "animated-short" && Number(value.duration.minutes) > 40) add("duration.minutes", "animated-short должен длиться не более 40 минут");
    if (value.kind === "animated-feature" && Number(value.duration.minutes) <= 40) add("duration.minutes", "animated-feature должен длиться более 40 минут");
  }

  if (!isRecord(value.nenAgeRecommendation)) add("nenAgeRecommendation", "Обязательная рекомендация НЭН");
  else {
    const min = value.nenAgeRecommendation.minAge;
    const max = value.nenAgeRecommendation.maxAge;
    if (Object.keys(value.nenAgeRecommendation).some((key) => !["minAge", "maxAge", "rationale"].includes(key))) add("nenAgeRecommendation", "Рекомендация НЭН содержит неизвестные поля");
    if (!Number.isInteger(min) || Number(min) < 0 || Number(min) > 18) add("nenAgeRecommendation.minAge", "Ожидается возраст 0–18");
    if (max !== undefined && (!Number.isInteger(max) || Number(max) < Number(min) || Number(max) > 18)) add("nenAgeRecommendation.maxAge", "Максимальный возраст должен быть от minAge до 18");
    const rationale = value.nenAgeRecommendation.rationale;
    if (!nonEmptyString(rationale) || String(rationale).trim().length < 30) add("nenAgeRecommendation.rationale", "Нужно содержательное редакционное обоснование не короче 30 символов");
    else if (serviceText.test(String(rationale))) add("nenAgeRecommendation.rationale", "Служебный или шаблонный текст запрещён");
  }

  if (value.officialRating !== undefined && !isRecord(value.officialRating)) add("officialRating", "Если поле задано, ожидается объект подтверждённой российской маркировки");
  else if (isRecord(value.officialRating)) {
    if (Object.keys(value.officialRating).some((key) => !["value", "sourceUrl", "sourceTitle"].includes(key))) add("officialRating", "Допустимы только value, sourceUrl и sourceTitle");
    if (!ratings.has(String(value.officialRating.value))) add("officialRating.value", "Допустимы только 0+, 6+, 12+, 16+ и 18+");
    if (!httpUrl(value.officialRating.sourceUrl)) add("officialRating.sourceUrl", "Требуется надёжный HTTP(S)-источник российской маркировки");
    if (value.officialRating.sourceTitle !== undefined && !nonEmptyString(value.officialRating.sourceTitle)) add("officialRating.sourceTitle", "Если поле задано, оно не должно быть пустым");
  }

  if (value.frame !== undefined && !isRecord(value.frame)) add("frame", "Если кадр задан, ожидается объект с URL и студиями производства");
  else if (isRecord(value.frame)) {
    if (Object.keys(value.frame).some((key) => !["url", "studios"].includes(key))) add("frame", "Для кадра допустимы только url и studios");
    if (!httpUrl(value.frame.url)) add("frame.url", "Требуется HTTP(S)-адрес изображения");
    if (!stringArray(value.frame.studios)) add("frame.studios", "Нужен непустой список студий производства");
  }

  if (value.awards !== undefined && (!Array.isArray(value.awards) || value.awards.length === 0 || value.awards.some((award) => !isRecord(award) || Object.keys(award).some((key) => key !== "title") || !nonEmptyString(award.title)))) {
    add("awards", "Награды должны быть непустым списком объектов с полем title");
  }
  if (value.studios !== undefined && !stringArray(value.studios)) add("studios", "Студии должны быть непустым списком названий");
  if (value.relatedTitles !== undefined && !stringArray(value.relatedTitles)) add("relatedTitles", "Связанные произведения должны быть непустым списком названий");

  return issues;
}

export const isWatchV2Title = (value: unknown): value is WatchV2Title => validateWatchV2Record(value).length === 0;
