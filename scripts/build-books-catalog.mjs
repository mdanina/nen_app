import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "data/source/catalog-full.json");
const targetPath = resolve(root, "data/generated/books.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

function compact(values) { return Array.isArray(values) ? [...new Set(values.filter(Boolean))] : []; }
function readingMode(item) {
  if (item.suitableForIndependentUse && item.suitableForFamily) return "both";
  return item.suitableForIndependentUse ? "independent" : "together";
}
function lengthCategory(item) {
  if (item.durationCategory === "длинная книга" || (item.pageCount ?? 0) > 250) return "long";
  if (item.durationCategory === "на несколько вечеров" || (item.pageCount ?? 0) > 80) return "medium";
  if (item.durationCategory === "на один вечер") return "short";
  return "very-short";
}
function description(item) {
  if (item.shortDescription?.trim()) return item.shortDescription.trim();
  const genre = item.genres?.[0] ? `${item.genres[0][0].toLocaleUpperCase("ru")}${item.genres[0].slice(1)}` : "История";
  const themes = compact(item.interests).slice(0, 3).join(", ");
  return `${genre}${themes ? ` о темах: ${themes}` : ""}. Рекомендована НЭН детям ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет.`;
}
function why(item) {
  if (item.editorialNote?.trim()) return item.editorialNote.trim();
  const themes = compact(item.interests).slice(0, 2).join(" и ");
  return themes ? `Помогает поговорить с ребёнком о таких темах, как ${themes}.` : `Подходит детям ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет для совместного знакомства с историей.`;
}
function classicOrModern(item) {
  const label = String(item.categoryLabel ?? "").toLocaleLowerCase("ru");
  if (item.contentType === "fairy-tale" || label.includes("классичес")) return "classic";
  if (label.includes("современн")) return "modern";
  return undefined;
}

const seenIds = new Set();
const seenSlugs = new Set();
const books = source.filter((item) => item.contentType === "book" || item.contentType === "fairy-tale").map((item, index) => {
  for (const [field, value] of [["id", item.id], ["slug", item.slug], ["title", item.title]]) {
    if (!value) throw new Error(`Запись ${index + 1}: отсутствует ${field}`);
  }
  if (seenIds.has(item.id)) throw new Error(`Повторяющийся id: ${item.id}`);
  if (seenSlugs.has(item.slug)) throw new Error(`Повторяющийся slug: ${item.slug}`);
  if (!Number.isFinite(item.recommendedAgeMin) || !Number.isFinite(item.recommendedAgeMax) || item.recommendedAgeMin > item.recommendedAgeMax) throw new Error(`Некорректный возраст: ${item.slug}`);
  seenIds.add(item.id); seenSlugs.add(item.slug);
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    originalTitle: item.originalTitle || undefined,
    author: item.creator || "Автор не указан",
    shortDescription: description(item),
    fullDescription: item.shortDescription?.trim() || undefined,
    whyRecommended: why(item),
    coverUrl: item.imageUrl || undefined,
    ageMin: item.recommendedAgeMin,
    ageMax: item.recommendedAgeMax,
    ageLabel: `${item.recommendedAgeMin}–${item.recommendedAgeMax} лет`,
    readingMode: readingMode(item),
    genres: compact(item.genres),
    themes: compact(item.interests),
    moods: compact(item.moods),
    suitableForBedtime: Boolean(item.suitableForBedtime),
    lengthCategory: lengthCategory(item),
    lengthLabel: item.durationCategory || undefined,
    pages: item.pageCount || undefined,
    classicOrModern: classicOrModern(item),
    sensitiveTopics: [],
    officialAgeRating: item.officialAgeRatingSource ? item.officialAgeRatingRu || undefined : undefined,
    officialAgeRatingSource: item.officialAgeRatingSource || undefined,
    sourceUpdatedAt: item.updatedAt || undefined,
    status: "published"
  };
});

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(books, null, 2)}\n`, "utf8");
console.log(`Сформировано книг: ${books.length}`);
