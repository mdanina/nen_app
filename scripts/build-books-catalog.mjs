import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyPath = resolve(root, "data/source/catalog-full.json");
const v2Path = resolve(root, "data/source/books-v2.json");
const importedPath = resolve(root, "data/source/openlibrary-books.json");
const importedExclusionsPath = resolve(root, "data/source/openlibrary-books-excluded.json");
const targetPath = resolve(root, "data/generated/books.json");
const legacySource = JSON.parse(await readFile(legacyPath, "utf8"));
const v2Source = JSON.parse(await readFile(v2Path, "utf8"));
const importedSource = JSON.parse(await readFile(importedPath, "utf8"));
const importedExclusions = JSON.parse(await readFile(importedExclusionsPath, "utf8"));

const allowed = {
  readingMode: new Set(["independent", "together", "both"]),
  lengthCategory: new Set(["very-short", "short", "medium", "long"]),
  languageDifficulty: new Set(["easy", "medium", "advanced"]),
  bookFormats: new Set(["картонная книга", "книжка-картинка", "первое самостоятельное чтение", "книга с короткими главами", "повесть", "роман", "графический роман", "комикс", "сборник", "поэзия", "иллюстрированный нон-фикшн", "энциклопедия", "книга-игра"]),
  genres: new Set(["сказка", "реалистическая проза", "семейная история", "приключения", "детектив", "юмор", "фэнтези", "научная фантастика", "историческая проза", "биография", "научно-популярная литература", "документальная литература", "поэзия"]),
  themes: new Set(["дружба", "семья", "школа", "детский сад", "животные", "природа", "наука", "техника", "история", "искусство", "путешествия", "взросление", "самооценка", "отношения", "тело", "безопасность", "культурное разнообразие", "юмор", "волшебство", "приключения"]),
  lifeSituations: new Set(["перед сном", "начало детского сада", "начало школы", "смена школы", "первое самостоятельное чтение", "ребёнок не любит читать", "переезд", "эмиграция", "развод родителей", "рождение брата или сестры", "семейный конфликт", "разлука с близким", "болезнь или больница", "утрата", "буллинг", "трудности с дружбой", "важные перемены", "разговор о безопасности", "совместное семейное обсуждение"]),
  emotionalStates: new Set(["тревожится", "боится", "грустит", "злится", "ревнует", "чувствует себя одиноко", "устал или перегружен", "стесняется", "не уверен в себе", "переживает перемены", "нуждается в поддержке", "хочет успокоиться", "хочет посмеяться", "скучает", "хочет узнать новое"]),
  moods: new Set(["захватывающее", "смешное", "спокойное", "таинственное", "трогательное", "уютное", "напряжённое", "познавательное"]),
};

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
function legacyBook(item) {
  return {
    id: item.id, slug: item.slug, title: item.title, originalTitle: item.originalTitle || undefined,
    author: item.creator || "Автор не указан", shortDescription: description(item),
    fullDescription: item.shortDescription?.trim() || undefined, whyRecommended: why(item), coverUrl: item.imageUrl || undefined,
    ageMin: item.recommendedAgeMin, ageMax: item.recommendedAgeMax, ageLabel: `${item.recommendedAgeMin}–${item.recommendedAgeMax} лет`,
    readingMode: readingMode(item), genres: compact(item.genres), themes: compact(item.interests), moods: compact(item.moods),
    suitableForBedtime: Boolean(item.suitableForBedtime), lengthCategory: lengthCategory(item), lengthLabel: item.durationCategory || undefined,
    pages: item.pageCount || undefined, classicOrModern: classicOrModern(item), sensitiveTopics: [], sensitiveTopicsReviewed: false,
    officialAgeRating: item.officialAgeRatingSource ? item.officialAgeRatingRu || undefined : undefined,
    officialAgeRatingSource: item.officialAgeRatingSource || undefined, sourceUpdatedAt: item.updatedAt || undefined, status: "published",
  };
}

function assertString(item, field) {
  if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`v2 ${item.id ?? "без id"}: отсутствует ${field}`);
}
function assertVocabulary(item, field) {
  if (!Array.isArray(item[field]) || (field !== "lifeSituations" && field !== "emotionalStates" && item[field].length === 0)) throw new Error(`v2 ${item.id}: поле ${field} должно быть массивом`);
  const unknown = item[field].filter((value) => !allowed[field].has(value));
  if (unknown.length) throw new Error(`v2 ${item.id}: неизвестные ${field}: ${unknown.join(", ")}`);
}
function validateV2(item) {
  if (item.schemaVersion !== 2) throw new Error(`v2 ${item.id ?? "без id"}: неверная версия схемы`);
  for (const field of ["id", "slug", "title", "shortDescription", "whyRecommended", "identificationStatus"]) assertString(item, field);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) throw new Error(`v2 ${item.id}: некорректный slug`);
  if (!Array.isArray(item.authors) || !item.authors.length || item.authors.some((author) => !String(author).trim())) throw new Error(`v2 ${item.id}: нужен хотя бы один автор`);
  if (!Number.isInteger(item.ageMin) || !Number.isInteger(item.ageMax) || item.ageMin < 0 || item.ageMax > 17 || item.ageMin > item.ageMax) throw new Error(`v2 ${item.id}: некорректный возраст`);
  if (!allowed.readingMode.has(item.readingMode)) throw new Error(`v2 ${item.id}: неизвестный формат чтения`);
  for (const field of ["bookFormats", "genres", "themes", "lifeSituations", "emotionalStates", "moods"]) assertVocabulary(item, field);
  if (item.languageDifficulty && !allowed.languageDifficulty.has(item.languageDifficulty)) throw new Error(`v2 ${item.id}: неизвестная сложность языка`);
  if (item.lengthCategory && !allowed.lengthCategory.has(item.lengthCategory)) throw new Error(`v2 ${item.id}: неизвестный объём`);
  if (!Array.isArray(item.sensitiveTopics) || item.sensitiveTopicsReviewed !== true) throw new Error(`v2 ${item.id}: чувствительные темы не проверены`);
  if (item.identificationStatus === "identified" && !/^97[89]\d{10}$/.test(item.isbn13 ?? "")) throw new Error(`v2 ${item.id}: identified требует ISBN-13`);
  if (item.isbn13 && !/^97[89]\d{10}$/.test(item.isbn13)) throw new Error(`v2 ${item.id}: некорректный ISBN-13`);
  if (!item.cover || !["local", "external", "placeholder"].includes(item.cover.kind)) throw new Error(`v2 ${item.id}: отсутствует cover`);
  if (item.cover.kind === "placeholder" && item.cover.rightsStatus !== "not-required") throw new Error(`v2 ${item.id}: placeholder должен иметь not-required`);
  if (item.cover.kind === "external") {
    if (item.cover.rightsStatus !== "external-display-only" || !item.cover.url || !item.cover.temporary) throw new Error(`v2 ${item.id}: внешняя обложка должна быть временной и разрешённой для внешнего показа`);
    if (!item.isbn13 || item.cover.isbn13 !== item.isbn13) throw new Error(`v2 ${item.id}: ISBN внешней обложки не совпадает с книгой`);
  }
}
function v2Book(item) {
  validateV2(item);
  return {
    id: item.id, slug: item.slug, title: item.title, originalTitle: item.originalTitle || undefined,
    author: item.authors.join("; "), shortDescription: item.shortDescription.trim(), fullDescription: item.fullDescription?.trim() || undefined,
    whyRecommended: item.whyRecommended.trim(), cover: item.cover, identificationStatus: item.identificationStatus,
    isbn13: item.isbn13 || undefined, publisher: item.publisher || undefined, publicationYear: item.publicationYear || undefined,
    bibliographicSources: compact(item.bibliographicSources), ageMin: item.ageMin, ageMax: item.ageMax, ageLabel: `${item.ageMin}–${item.ageMax} лет`,
    readingMode: item.readingMode, bookFormats: compact(item.bookFormats), genres: compact(item.genres), themes: compact(item.themes),
    lifeSituations: compact(item.lifeSituations), emotionalStates: compact(item.emotionalStates), moods: compact(item.moods),
    suitableForBedtime: Boolean(item.suitableForBedtime), languageDifficulty: item.languageDifficulty || undefined,
    lengthCategory: item.lengthCategory || undefined, pages: item.pages || undefined, illustrationsLevel: item.illustrationsLevel || undefined,
    sensitiveTopics: compact(item.sensitiveTopics), sensitiveTopicsReviewed: true, status: "published",
  };
}
function normalized(value) {
  return String(value).toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

function importedBook(item, index) {
  for (const field of ["id", "slug", "title", "author", "shortDescription", "whyRecommended"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Импортированная запись ${index + 1}: отсутствует ${field}`);
  }
  if (!Number.isFinite(item.ageMin) || !Number.isFinite(item.ageMax) || item.ageMin > item.ageMax) throw new Error(`Импортированная запись ${item.id}: некорректный возраст`);
  if (!allowed.readingMode.has(item.readingMode)) throw new Error(`Импортированная запись ${item.id}: неизвестный формат чтения`);
  for (const field of ["genres", "themes"]) assertVocabulary(item, field);
  if (!Array.isArray(item.moods) || item.moods.some((value) => !allowed.moods.has(value))) throw new Error(`Импортированная запись ${item.id}: неизвестное настроение`);
  if (item.status !== "published") throw new Error(`Импортированная запись ${item.id}: разрешены только опубликованные карточки`);
  return item;
}

const legacyBooks = legacySource.filter((item) => item.contentType === "book" || item.contentType === "fairy-tale").map((item, index) => {
  for (const [field, value] of [["id", item.id], ["slug", item.slug], ["title", item.title]]) if (!value) throw new Error(`Legacy-запись ${index + 1}: отсутствует ${field}`);
  if (!Number.isFinite(item.recommendedAgeMin) || !Number.isFinite(item.recommendedAgeMax) || item.recommendedAgeMin > item.recommendedAgeMax) throw new Error(`Legacy-запись: некорректный возраст ${item.slug}`);
  return legacyBook(item);
});
const publishedV2 = v2Source.filter((item) => item.status === "published").map(v2Book);
const importedIds = new Set(importedSource.map((item) => item.id));
const excludedImportedIds = new Set();
for (const exclusion of importedExclusions) {
  if (!importedIds.has(exclusion.id)) throw new Error(`Исключение ссылается на неизвестную импортированную книгу: ${exclusion.id}`);
  if (excludedImportedIds.has(exclusion.id)) throw new Error(`Повторяющееся исключение импортированной книги: ${exclusion.id}`);
  if (!exclusion.reason || !exclusion.explanation) throw new Error(`Для исключения ${exclusion.id} требуется причина`);
  excludedImportedIds.add(exclusion.id);
}
const importedBooks = importedSource.filter((item) => !excludedImportedIds.has(item.id)).map(importedBook);
const books = [...legacyBooks, ...publishedV2, ...importedBooks];

for (const [label, key] of [["id", (book) => book.id], ["slug", (book) => book.slug], ["ISBN", (book) => book.isbn13], ["название и автор", (book) => `${normalized(book.title)}|${normalized(book.author)}`]]) {
  const seen = new Map();
  for (const book of books) {
    const value = key(book);
    if (!value) continue;
    if (seen.has(value)) throw new Error(`Дубль по полю ${label}: ${book.title} и ${seen.get(value)}`);
    seen.set(value, book.title);
  }
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(books, null, 2)}\n`, "utf8");
console.log(`Сформировано книг: ${books.length} (${legacyBooks.length} legacy + ${publishedV2.length} v2 + ${importedBooks.length} импортированных; исключено ${excludedImportedIds.size})`);
