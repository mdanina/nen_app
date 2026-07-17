import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "data/source/catalog-full.json");
const targetPath = resolve(root, "data/generated/watch.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const serviceMarker = /(?:^|[-_])(demo|test|sample)(?:[-_]|$)|демонстрацион|тестов(?:ая|ое|ый|ые|ую)/iu;
const compact = (values) => Array.isArray(values) ? [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))] : [];
const isWatchTitle = (item) => item?.contentType === "cartoon" || item?.contentType === "movie";
const containsServiceMarker = (item) => [item.id, item.slug, item.title, item.shortDescription, item.editorialNote, item.note]
  .some((value) => typeof value === "string" && serviceMarker.test(value));

const moodMap = new Map([
  ["спокойное", "calm"], ["уютное", "calm"],
  ["смешное", "cheerful"],
  ["захватывающее", "adventurous"],
  ["таинственное", "thoughtful"],
  ["трогательное", "emotional"],
]);

function description(item) {
  if (item.shortDescription?.trim()) return item.shortDescription.trim();
  const format = item.contentType === "cartoon" ? "Мультфильм" : "Фильм";
  const themes = compact(item.interests).slice(0, 3).join(", ");
  return `${format} для детей ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет${themes ? `. Темы: ${themes}` : ""}.`;
}

function recommendation(item) {
  if (item.editorialNote?.trim()) return item.editorialNote.trim();
  const themes = compact(item.interests).slice(0, 2).join(" и ");
  return themes
    ? `Подходит для семейного разговора о таких темах, как ${themes}.`
    : `Подходит для совместного просмотра с детьми ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет.`;
}

function mapRecord(item) {
  const moods = compact(item.moods).map((value) => moodMap.get(value)).filter(Boolean);
  const themes = compact(item.interests);
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    ...(item.originalTitle ? { originalTitle: item.originalTitle } : {}),
    contentType: item.contentType,
    contentFormat: item.contentType === "cartoon" ? "animated-feature" : "fiction",
    releaseForm: "standalone",
    shortDescription: description(item),
    whyRecommended: recommendation(item),
    country: String(item.countryOrTradition ?? "").split("/").map((value) => value.trim()).filter(Boolean),
    year: item.originalYear,
    duration: { kind: "standalone", minutes: item.durationMinutes },
    themes,
    mood: [...new Set(moods.length ? moods : ["thoughtful"])],
    sensitiveTopics: [],
    discussionPotential: themes.length >= 3 ? "high" : "medium",
    nenAgeRecommendation: {
      minAge: item.recommendedAgeMin,
      maxAge: item.recommendedAgeMax,
      rationale: `Редакционный возрастной диапазон НЭН: ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет.`,
    },
    ...(item.officialAgeRatingRu && item.officialAgeRatingSource ? {
      officialRating: { system: "Возрастная маркировка РФ", value: item.officialAgeRatingRu, sourceUrl: item.officialAgeRatingSource },
    } : {}),
    status: "published",
  };
}

const candidates = source.filter(isWatchTitle);
const excluded = candidates.filter(containsServiceMarker);
const seenIds = new Set();
const seenSlugs = new Set();
const watch = candidates.filter((item) => !containsServiceMarker(item)).map((item, index) => {
  for (const field of ["id", "slug", "title", "originalYear", "durationMinutes", "recommendedAgeMin", "recommendedAgeMax"]) {
    if (item[field] === undefined || item[field] === null || item[field] === "") throw new Error(`Запись ${index + 1}: отсутствует ${field}`);
  }
  if (seenIds.has(item.id)) throw new Error(`Повторяющийся id: ${item.id}`);
  if (seenSlugs.has(item.slug)) throw new Error(`Повторяющийся slug: ${item.slug}`);
  if (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 1 || item.durationMinutes > 360) throw new Error(`Некорректная длительность: ${item.slug}`);
  if (!Number.isInteger(item.recommendedAgeMin) || !Number.isInteger(item.recommendedAgeMax) || item.recommendedAgeMin > item.recommendedAgeMax) throw new Error(`Некорректный возраст: ${item.slug}`);
  seenIds.add(item.id);
  seenSlugs.add(item.slug);
  return mapRecord(item);
});

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(watch, null, 2)}\n`, "utf8");
console.log(`Сформировано watch-записей: ${watch.length}; исключено служебных: ${excluded.length}`);
