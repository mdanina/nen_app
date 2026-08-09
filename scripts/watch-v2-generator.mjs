const MOODS = new Set([
  "спокойное", "весёлое", "уютное", "приключенческое", "таинственное",
  "напряжённое", "вдумчивое", "эмоциональное", "вдохновляющее",
]);
const GENRES = new Set([
  "семейный", "комедия", "драма", "приключения", "фэнтези", "фантастика",
  "детектив", "сказка", "мюзикл", "мелодрама", "исторический",
  "биографический", "спортивный", "триллер", "документальный", "образовательный", "короткометражный",
]);
const THEMES = new Set([
  "семья", "дружба", "отношения с родителями", "братья и сёстры", "взросление",
  "самостоятельность", "самопринятие", "эмпатия", "ответственность", "смелость",
  "выбор", "справедливость", "командная работа", "школа", "животные", "природа",
  "экология", "путешествия", "волшебство", "космос", "наука", "технологии",
  "история", "искусство", "музыка", "спорт", "мечты", "культурное разнообразие",
  "утрата", "разлука",
]);
const KINDS = new Set(["movie", "animated-feature", "animated-short", "animated-series", "series", "documentary", "short-film"]);
const RATINGS = new Set(["0+", "6+", "12+", "16+", "18+"]);
const TITLE_LOCALIZATIONS = new Set(["official-ru", "original-only"]);
const SERVICE_MARKER = /\b(?:demo|test|sample|todo|tbd)\b|демонстрацион|тестов|заглушк|заполнить позже|уточнить позже/iu;

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isHttpUrl = (value) => isText(value) && /^https?:\/\//u.test(value);
const textArray = (value, allowEmpty = false) => Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isText);
const ref = (record, index) => `запись ${index + 1} [id=${isText(record?.id) ? record.id : "?"} slug=${isText(record?.slug) ? record.slug : "?"}]`;

export class WatchV2GenerationError extends Error {
  constructor(issues) {
    super(`Каталог watch-v2 не прошёл проверку (${issues.length}):\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "WatchV2GenerationError";
    this.issues = issues;
  }
}

function validateRecord(record, index) {
  const issues = [];
  const add = (field, message) => issues.push(`${ref(record, index)} ${field}: ${message}`);
  if (!isRecord(record)) return [`${ref(record, index)} record: ожидается объект`];
  if (record.schemaVersion !== 2) add("schemaVersion", "ожидается 2");
  for (const field of ["id", "slug", "title", "originalTitle", "shortDescription", "whyRecommended"]) {
    if (!isText(record[field])) add(field, "обязательная непустая строка");
  }
  if (isText(record.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.slug)) add("slug", "ожидается kebab-case");
  if (!TITLE_LOCALIZATIONS.has(record.titleLocalization)) add("titleLocalization", "ожидается official-ru или original-only");
  if (record.titleLocalization === "original-only" && record.title !== record.originalTitle) add("title", "без официального русского названия основным должно быть оригинальное название");
  if (!KINDS.has(record.kind)) add("kind", "неизвестный вид произведения");
  for (const field of ["id", "slug", "title", "shortDescription", "whyRecommended"]) {
    if (isText(record[field]) && SERVICE_MARKER.test(record[field])) add(field, "служебные demo/test/sample/TODO-данные запрещены");
  }
  for (const [field, allowed] of [["mood", MOODS], ["genres", GENRES], ["themes", THEMES]]) {
    if (!textArray(record[field])) add(field, "требуется непустой массив");
    else for (const value of record[field]) if (!allowed.has(value)) add(field, `значение «${value}» отсутствует в редакционном словаре`);
  }
  if (!textArray(record.country)) add("country", "требуется непустой массив стран");
  if (!textArray(record.discussionTopics)) add("discussionTopics", "требуется непустой массив тем обсуждения");
  if (!textArray(record.sensitiveTopics, true)) add("sensitiveTopics", "ожидается массив строк");
  if (!Number.isInteger(record.year) || record.year < 1888 || record.year > new Date().getFullYear() + 1) add("year", "некорректный год");

  if (record.officialRating !== undefined && !isRecord(record.officialRating)) add("officialRating", "если поле задано, ожидается объект подтверждённой российской маркировки");
  else if (isRecord(record.officialRating)) {
    if (!RATINGS.has(record.officialRating.value)) add("officialRating.value", "допустимы только 0+, 6+, 12+, 16+, 18+");
    if (!isHttpUrl(record.officialRating.sourceUrl)) add("officialRating.sourceUrl", "обязателен HTTP(S)-источник");
  }
  if (record.frame !== undefined) {
    if (!isRecord(record.frame)) add("frame", "ожидается объект");
    else {
      if (!isHttpUrl(record.frame.url)) add("frame.url", "нужен HTTP(S)-адрес изображения");
      if (!textArray(record.frame.studios)) add("frame.studios", "нужен непустой список студий производства");
    }
  }
  if (record.awards !== undefined && (!Array.isArray(record.awards) || record.awards.length === 0 || record.awards.some((award) => !isRecord(award) || !isText(award.title)))) add("awards", "ожидается непустой список наград");
  if (record.studios !== undefined && !textArray(record.studios)) add("studios", "ожидается непустой список студий");
  if (record.relatedTitles !== undefined && !textArray(record.relatedTitles)) add("relatedTitles", "ожидается непустой список связанных произведений");

  if (!isRecord(record.nenAgeRecommendation)) add("nenAgeRecommendation", "рекомендация НЭН обязательна");
  else {
    const { minAge, maxAge, rationale } = record.nenAgeRecommendation;
    if (!Number.isInteger(minAge) || minAge < 0 || minAge > 18) add("nenAgeRecommendation.minAge", "ожидается целое число 0–18");
    if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < minAge || maxAge > 18)) add("nenAgeRecommendation.maxAge", "ожидается целое число от minAge до 18");
    if (!isText(rationale) || rationale.trim().length < 30 || SERVICE_MARKER.test(rationale)) add("nenAgeRecommendation.rationale", "требуется содержательное редакционное обоснование");
  }

  if (!isRecord(record.duration)) add("duration", "объект длительности обязателен");
  else if (record.kind === "animated-series" || record.kind === "series") {
    if (!Number.isInteger(record.duration.episodeMinutes) || record.duration.episodeMinutes < 1 || record.duration.episodeMinutes > 180) add("duration.episodeMinutes", "для сериала требуется 1–180 минут");
    if ("minutes" in record.duration) add("duration.minutes", "сериал использует episodeMinutes");
    if (record.duration.episodeMinutesMax !== undefined && (!Number.isInteger(record.duration.episodeMinutesMax) || record.duration.episodeMinutesMax < record.duration.episodeMinutes || record.duration.episodeMinutesMax > 240)) add("duration.episodeMinutesMax", "ожидается значение от обычной длительности серии до 240");
    if (record.duration.episodeCount !== undefined && (!Number.isInteger(record.duration.episodeCount) || record.duration.episodeCount < 1)) add("duration.episodeCount", "ожидается положительное целое число");
    if (record.duration.seasonCount !== undefined && (!Number.isInteger(record.duration.seasonCount) || record.duration.seasonCount < 1)) add("duration.seasonCount", "ожидается положительное целое число");
  } else {
    if (!Number.isInteger(record.duration.minutes) || record.duration.minutes < 1 || record.duration.minutes > 360) add("duration.minutes", "требуется 1–360 минут");
    if ("episodeMinutes" in record.duration || "episodeMinutesMax" in record.duration || "episodeCount" in record.duration || "seasonCount" in record.duration) add("duration", "отдельное произведение использует только minutes");
    if (record.kind === "animated-short" && record.duration.minutes > 40) add("duration.minutes", "animated-short должен длиться не более 40 минут");
    if (record.kind === "animated-feature" && record.duration.minutes <= 40) add("duration.minutes", "animated-feature должен длиться более 40 минут");
  }
  return issues;
}

export function validateWatchV2Catalog(input) {
  if (!Array.isArray(input)) return ["catalog: ожидается массив записей"];
  const issues = input.flatMap(validateRecord);
  const ids = new Map();
  const slugs = new Map();
  input.forEach((record, index) => {
    if (!isRecord(record)) return;
    if (isText(record.id)) {
      if (ids.has(record.id)) issues.push(`${ref(record, index)} id: дублирует запись ${ids.get(record.id) + 1}`);
      else ids.set(record.id, index);
    }
    if (isText(record.slug)) {
      if (slugs.has(record.slug)) issues.push(`${ref(record, index)} slug: дублирует запись ${slugs.get(record.slug) + 1}`);
      else slugs.set(record.slug, index);
    }
  });
  return issues;
}

function normalize(record) {
  return {
    schemaVersion: 2,
    id: record.id.trim(),
    slug: record.slug.trim(),
    title: record.title.trim(),
    originalTitle: record.originalTitle.trim(),
    titleLocalization: record.titleLocalization,
    kind: record.kind,
    shortDescription: record.shortDescription.trim(),
    whyRecommended: record.whyRecommended.trim(),
    country: [...new Set(record.country.map((value) => value.trim()))].sort((a, b) => a.localeCompare(b, "ru")),
    year: record.year,
    duration: record.kind === "animated-series" || record.kind === "series"
      ? {
          episodeMinutes: record.duration.episodeMinutes,
          ...(record.duration.episodeMinutesMax ? { episodeMinutesMax: record.duration.episodeMinutesMax } : {}),
          ...(record.duration.episodeCount ? { episodeCount: record.duration.episodeCount } : {}),
          ...(record.duration.seasonCount ? { seasonCount: record.duration.seasonCount } : {}),
        }
      : { minutes: record.duration.minutes },
    genres: [...new Set(record.genres)].sort((a, b) => a.localeCompare(b, "ru")),
    themes: [...new Set(record.themes)].sort((a, b) => a.localeCompare(b, "ru")),
    discussionTopics: [...new Set(record.discussionTopics.map((value) => value.trim()))],
    mood: [...new Set(record.mood)].sort((a, b) => a.localeCompare(b, "ru")),
    sensitiveTopics: [...new Set(record.sensitiveTopics.map((value) => value.trim()))].sort((a, b) => a.localeCompare(b, "ru")),
    nenAgeRecommendation: {
      minAge: record.nenAgeRecommendation.minAge,
      ...(record.nenAgeRecommendation.maxAge !== undefined ? { maxAge: record.nenAgeRecommendation.maxAge } : {}),
      rationale: record.nenAgeRecommendation.rationale.trim(),
    },
    ...(record.officialRating ? { officialRating: {
      value: record.officialRating.value,
      sourceUrl: record.officialRating.sourceUrl.trim(),
      ...(record.officialRating.sourceTitle ? { sourceTitle: record.officialRating.sourceTitle.trim() } : {}),
    } } : {}),
    ...(record.frame ? { frame: {
      url: record.frame.url.trim(),
      studios: [...new Set(record.frame.studios.map((value) => value.trim()))],
    } } : {}),
    ...(record.awards ? { awards: record.awards.map((award) => ({ title: award.title.trim() })) } : {}),
    ...(record.studios ? { studios: [...new Set(record.studios.map((value) => value.trim()))] } : {}),
    ...(record.relatedTitles ? { relatedTitles: [...new Set(record.relatedTitles.map((value) => value.trim()))] } : {}),
  };
}

export function generateWatchV2Catalog(input) {
  const issues = validateWatchV2Catalog(input);
  if (issues.length) throw new WatchV2GenerationError(issues);
  const items = input.map(normalize).sort((a, b) => a.id.localeCompare(b.id, "en") || a.slug.localeCompare(b.slug, "en"));
  const byKind = Object.fromEntries([...KINDS].map((kind) => [kind, items.filter((item) => item.kind === kind).length]));
  return {
    items,
    report: {
      total: items.length,
      movies: byKind.movie + byKind.series + byKind.documentary + byKind["short-film"],
      cartoons: byKind["animated-feature"] + byKind["animated-short"] + byKind["animated-series"],
      byKind,
      withOfficialRating: items.filter((item) => item.officialRating).length,
      withoutOfficialRating: items.filter((item) => !item.officialRating).length,
    },
  };
}

export const serializeWatchV2Catalog = (items) => `${JSON.stringify(items, null, 2)}\n`;

export function formatWatchV2Report(report) {
  return [
    "Каталог watch-v2 сформирован",
    `Всего произведений: ${report.total}`,
    `Фильмов: ${report.movies}`,
    `Мультфильмов: ${report.cartoons}`,
    `movie: ${report.byKind.movie}`,
    `animated-feature: ${report.byKind["animated-feature"]}`,
    `animated-short: ${report.byKind["animated-short"]}`,
    `animated-series: ${report.byKind["animated-series"]}`,
    `series: ${report.byKind.series}`,
    `documentary: ${report.byKind.documentary}`,
    `short-film: ${report.byKind["short-film"]}`,
    `С подтверждённым officialRating: ${report.withOfficialRating}`,
    `Без officialRating: ${report.withoutOfficialRating}`,
  ].join("\n");
}
