import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCatalogBook } from "./books/fiction-classifier.mjs";
import { fixGeneratedAuthorCases } from "./books/russian-morphology.mjs";
import { buildBookRecommendation, isGeneratedRecommendation } from "./books/book-recommendation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyPath = resolve(root, "data/source/catalog-full.json");
const v2Path = resolve(root, "data/source/books-v2.json");
const importedPath = resolve(root, "data/source/openlibrary-books.json");
const importedExclusionsPath = resolve(root, "data/source/openlibrary-books-excluded.json");
const curatedPublisherPath = resolve(root, "data/source/curated-publisher-books.json");
const curatedMultiPublisherPath = resolve(root, "data/source/curated-multi-publisher-books.json");
const curatedPriorityPublisherPath = resolve(root, "data/source/curated-priority-publisher-books.json");
const curatedOfficialFictionPath = resolve(root, "data/source/curated-official-fiction-books.json");
const nenCollectionBooksPath = resolve(root, "data/source/nen-collection-books.json");
const annotationOverridesPath = resolve(root, "data/source/book-annotation-overrides.json");
const officialCoverOverridesPath = resolve(root, "data/source/official-cover-overrides.json");
const coverAssignmentCorrectionsPath = resolve(root, "data/source/cover-assignment-corrections.json");
const officialMetadataOverridesPath = resolve(root, "data/source/official-metadata-overrides.json");
const catalogMaintenanceExclusionsPath = resolve(root, "data/source/catalog-maintenance-exclusions.json");
const targetPath = resolve(root, "data/generated/books.json");
const fictionExcludedReportPath = resolve(root, "data/reports/fiction-catalog-excluded.json");
const fictionAmbiguousReportPath = resolve(root, "data/reports/ambiguous-review.json");
const legacySource = JSON.parse(await readFile(legacyPath, "utf8"));
const v2Source = JSON.parse(await readFile(v2Path, "utf8"));
const importedSource = JSON.parse(await readFile(importedPath, "utf8"));
const importedExclusions = JSON.parse(await readFile(importedExclusionsPath, "utf8"));
const curatedPublisherSource = JSON.parse(await readFile(curatedPublisherPath, "utf8"));
const curatedMultiPublisherSource = JSON.parse(await readFile(curatedMultiPublisherPath, "utf8"));
const curatedPriorityPublisherSource = JSON.parse(await readFile(curatedPriorityPublisherPath, "utf8"));
const curatedOfficialFictionSource = JSON.parse(await readFile(curatedOfficialFictionPath, "utf8"));
const nenCollectionSource = JSON.parse(await readFile(nenCollectionBooksPath, "utf8"));
const annotationOverrides = JSON.parse(await readFile(annotationOverridesPath, "utf8"));
const officialCoverOverrides = JSON.parse(await readFile(officialCoverOverridesPath, "utf8"));
const coverAssignmentCorrections = JSON.parse(await readFile(coverAssignmentCorrectionsPath, "utf8").catch(() => "{\"invalidAssignments\":[],\"reassignments\":[]}"));
const officialMetadataOverrides = JSON.parse(await readFile(officialMetadataOverridesPath, "utf8"));
const catalogMaintenanceExclusions = JSON.parse(await readFile(catalogMaintenanceExclusionsPath, "utf8").catch(() => "[]"));
const annotationById = new Map(annotationOverrides.map((item) => [item.id, item]));
const officialCoverById = new Map(officialCoverOverrides.map((item) => [item.id, item.cover]));
const invalidCoverAssignmentsById = new Map();
for (const item of coverAssignmentCorrections.invalidAssignments) {
  if (!invalidCoverAssignmentsById.has(item.id)) invalidCoverAssignmentsById.set(item.id, []);
  invalidCoverAssignmentsById.get(item.id).push(item);
}
const reassignedCoverById = new Map(coverAssignmentCorrections.reassignments.map((item) => [item.targetId, item.cover]));
const officialMetadataById = new Map(officialMetadataOverrides.map((item) => [item.id, item]));
const catalogMaintenanceExcludedIds = new Set(catalogMaintenanceExclusions.map((item) => item.id));

const allowed = {
  readingMode: new Set(["independent", "together", "both"]),
  lengthCategory: new Set(["very-short", "short", "medium", "long"]),
  languageDifficulty: new Set(["easy", "medium", "advanced"]),
  bookFormats: new Set(["картонная книга", "книжка-картинка", "первое самостоятельное чтение", "книга с короткими главами", "повесть", "роман", "графический роман", "комикс", "сборник", "поэзия", "иллюстрированный нон-фикшн", "энциклопедия", "книга-игра"]),
  genres: new Set(["сказка", "реалистическая проза", "семейная история", "приключения", "детектив", "юмор", "фэнтези", "научная фантастика", "историческая проза", "биография", "научно-популярная литература", "документальная литература", "поэзия"]),
  themes: new Set(["дружба", "семья", "братья и сёстры", "развод родителей", "школа", "буллинг", "первая любовь", "детский сад", "животные", "природа", "наука", "техника", "история", "искусство", "путешествия", "взросление", "самооценка", "эмоции", "страх", "смерть", "война", "инклюзия", "принятие себя", "ответственность", "смелость", "доброта", "отношения", "тело", "безопасность", "культурное разнообразие", "юмор", "волшебство", "приключения", "детектив", "фантастика", "динозавры", "творчество", "космос", "экология", "мифология", "музыка", "театр", "спорт", "морские приключения", "изобретения"]),
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
    seriesName: item.seriesName || undefined, translator: item.translator || undefined,
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

function normalizePublisher(value) {
  if (!value) return undefined;
  const clean = String(value).replace(/[\[\]"]/g, "").replace(/[.,\s]+$/u, "").trim();
  if (/^\d+$/u.test(clean)) return undefined;
  const key = clean.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ru").replace(/[^a-zа-я0-9]+/gu, " ").trim();
  const rules = [
    [/samokat|самокат/u, "Самокат"],
    [/polyandria|поляндри/iu, "Поляндрия"],
    [/albus corvus|белая ворона/iu, "Белая ворона"],
    [/kompas ?gid|компас ?гид/iu, "КомпасГид"],
    [/(?:^|\s)clever|клевер/iu, "Clever"],
    [/archipelag|архипелаг/iu, "Архипелаг"],
    [/alpina(?:.*det)?|альпина(?:\.|\s*дети)?/iu, "Альпина.Дети"],
    [/rozovy zhiraf|розовый жираф/u, "Розовый жираф"],
    [/peshkom v istor|пешком в истор/u, "Пешком в историю"],
    [/makhaon|махаон/u, "Азбука-Аттикус"],
    [/(?:^|\s)mif(?:\s|$)|манн.*иванов.*фербер|миф(?:\. |\s*)детство/iu, "МИФ.Детство"],
    [/(?:^|\s)e?ksmo|эксмо/u, "Эксмо"],
    [/(?:^|\s)ast(?:\s|$)|издательство аст|изд во аст/u, "АСТ"],
    [/astrel|estrel|астрель/u, "АСТ"],
    [/rosm[eė]n|росмэн/u, "Росмэн"],
    [/strekoza|стрекоза/u, "Стрекоза"],
    [/detsk.*lit|detgiz|detizdat|детская литература/u, "Детская литература"],
    [/chavash.*izdat|чувашское книжное/u, "Чувашское книжное издательство"],
    [/samovar|самовар/u, "Самовар"],
    [/azbuka|азбука/u, "Азбука-Аттикус"],
    [/drofa|дрофа/u, "Дрофа"],
    [/malysh|малыш/u, "Малыш"],
    [/bely.*gorod|белый город/u, "Белый город"],
    [/oniks|оникс/u, "Оникс"],
    [/olma|олма/u, "ОЛМА"],
    [/ripol|рипол/u, "РИПОЛ классик"],
    [/molodai?a.*gvardi|mol.*gvard|молодая гвардия/u, "Молодая гвардия"],
    [/novoe literaturnoe obozrenie|новое литературное обозрение/u, "Новое литературное обозрение"],
    [/rech(?:\s|$)|речь/u, "Речь"],
    [/prof press|проф-пресс/u, "Проф-Пресс"],
    [/bukmaster|букмастер/u, "Букмастер"],
  ];
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? clean;
}

function curatedPublisherBook(item, index) {
  for (const field of ["id", "slug", "title", "shortDescription", "publisher", "isbn13"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Издательская запись ${index + 1}: отсутствует ${field}`);
  }
  if (!Array.isArray(item.authors) || !item.authors.length) throw new Error(`Издательская запись ${item.id}: отсутствует автор`);
  if (!Number.isFinite(item.ageMin) || !Number.isFinite(item.ageMax) || item.ageMin > item.ageMax) throw new Error(`Издательская запись ${item.id}: некорректный возраст`);
  if (!allowed.readingMode.has(item.readingMode)) throw new Error(`Издательская запись ${item.id}: неизвестный формат чтения`);
  for (const field of ["genres", "themes"]) assertVocabulary(item, field);
  if (!item.cover?.url || item.cover.kind !== "external" || item.cover.isbn13 !== item.isbn13) throw new Error(`Издательская запись ${item.id}: некорректная обложка`);
  return {
    ...item,
    author: item.authors.join("; "),
    authors: undefined,
    ageLabel: `${item.ageMin}–${item.ageMax} лет`,
  };
}

function nenCollectionBook(item, index) {
  for (const field of ["id", "slug", "title", "shortDescription"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Карточка подборки НЭН ${index + 1}: отсутствует ${field}`);
  }
  if (!Array.isArray(item.authors) || !item.authors.length) throw new Error(`Карточка подборки НЭН ${item.id}: отсутствует автор`);
  if (!Number.isFinite(item.ageMin) || !Number.isFinite(item.ageMax) || item.ageMin > item.ageMax) throw new Error(`Карточка подборки НЭН ${item.id}: некорректный возраст`);
  if (!allowed.readingMode.has(item.readingMode)) throw new Error(`Карточка подборки НЭН ${item.id}: неизвестный формат чтения`);
  for (const field of ["genres", "themes"]) assertVocabulary(item, field);
  return {
    ...item,
    author: item.authors.join("; "),
    authors: undefined,
    ageLabel: `${item.ageMin}–${item.ageMax} лет`,
    whyRecommended: item.whyRecommended ?? "",
    sensitiveTopics: compact(item.sensitiveTopics),
    sensitiveTopicsReviewed: true,
  };
}

function importedBook(item, index) {
  for (const field of ["id", "slug", "title", "author", "whyRecommended"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Импортированная запись ${index + 1}: отсутствует ${field}`);
  }
  if (!Number.isFinite(item.ageMin) || !Number.isFinite(item.ageMax) || item.ageMin > item.ageMax) throw new Error(`Импортированная запись ${item.id}: некорректный возраст`);
  if (!allowed.readingMode.has(item.readingMode)) throw new Error(`Импортированная запись ${item.id}: неизвестный формат чтения`);
  for (const field of ["genres", "themes"]) assertVocabulary(item, field);
  if (!Array.isArray(item.moods) || item.moods.some((value) => !allowed.moods.has(value))) throw new Error(`Импортированная запись ${item.id}: неизвестное настроение`);
  if (item.status !== "published") throw new Error(`Импортированная запись ${item.id}: разрешены только опубликованные карточки`);
  const annotation = annotationById.get(item.id);
  return {
    ...item,
    shortDescription: annotation?.description ?? "",
    fullDescription: annotation?.description ?? "",
    annotationProvenance: annotation ? {
      source: annotation.source,
      sourceUrl: annotation.sourceUrl,
      method: annotation.method,
      evidenceField: annotation.evidenceField,
      verifiedAt: "2026-07-24",
      copiedVerbatim: false,
    } : {
      source: null,
      method: "no_reliable_plot_description_found",
      verifiedAt: "2026-07-24",
      copiedVerbatim: false,
    },
  };
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
const curatedPublisherBooks = [
  ...curatedPublisherSource.books,
  ...curatedMultiPublisherSource.books,
  ...curatedPriorityPublisherSource.books,
  ...curatedOfficialFictionSource.books,
].map(curatedPublisherBook);
const nenCollectionBooks = nenCollectionSource.books.map(nenCollectionBook);
const enrichmentById = new Map([
  ...curatedPublisherSource.enrichments,
  ...curatedMultiPublisherSource.enrichments,
  ...curatedPriorityPublisherSource.enrichments,
  ...curatedOfficialFictionSource.enrichments,
].map((item) => [item.id, item]));
function applyPublisherEnrichment(book) {
  const enrichment = enrichmentById.get(book.id);
  if (!enrichment) return book;
  return {
    ...book,
    publisher: book.publisher || enrichment.publisher || undefined,
    publicationYear: book.publicationYear || enrichment.publicationYear || undefined,
    pages: book.pages || enrichment.pages || undefined,
    seriesName: book.seriesName || enrichment.seriesName || undefined,
    translator: book.translator || enrichment.translator || undefined,
    isbn13: book.isbn13 || enrichment.isbn13 || undefined,
    cover: book.cover?.url || book.coverUrl ? book.cover : enrichment.cover || undefined,
    bibliographicSources: compact([...(book.bibliographicSources ?? []), enrichment.bibliographicSource]),
  };
}
function applyOfficialMetadata(book) {
  const override = officialMetadataById.get(book.id);
  if (!override) return book;
  const replaceEdition = override.replaceEdition === true;
  return {
    ...book,
    publisher: override.publisher || book.publisher || undefined,
    publicationYear: replaceEdition ? override.publicationYear || undefined : override.publicationYear || book.publicationYear || undefined,
    pages: replaceEdition ? override.pages || undefined : override.pages || book.pages || undefined,
    seriesName: replaceEdition ? override.seriesName || undefined : override.seriesName || book.seriesName || undefined,
    isbn13: replaceEdition ? override.isbn13 || undefined : override.isbn13 || book.isbn13 || undefined,
    language: replaceEdition ? override.language || undefined : override.language || book.language || undefined,
    identificationStatus: replaceEdition && !override.isbn13 ? undefined : book.identificationStatus,
    originalTitle: override.originalTitle || book.originalTitle || undefined,
    bibliographicSources: compact([...(book.bibliographicSources ?? []), override.sourceUrl]),
    sourceMetadata: {
      ...(book.sourceMetadata ?? {}),
      officialMetadataAudit: {
        source: override.source,
        sourceUrl: override.sourceUrl,
        sourceRecordId: override.sourceRecordId,
        verifiedAt: override.verifiedAt,
        match: override.match,
        officialTitle: override.officialTitle,
        officialAuthors: override.officialAuthors,
      },
    },
  };
}
const candidateBooks = [...legacyBooks, ...publishedV2, ...importedBooks, ...curatedPublisherBooks, ...nenCollectionBooks]
  .map(applyPublisherEnrichment)
  .map(applyOfficialMetadata)
  .filter((book) => !catalogMaintenanceExcludedIds.has(book.id))
  .map((book) => {
    if (!officialCoverById.has(book.id)) return book;
    const cover = officialCoverById.get(book.id);
    const metadata = officialMetadataById.get(book.id);
    const confirmedSameEdition = metadata?.sourceUrl === cover.sourcePageUrl;
    return {
      ...book,
      cover: confirmedSameEdition ? { ...cover, isbn13: book.isbn13 } : cover,
      coverUrl: undefined,
    };
  })
  .map((book) => {
    if (reassignedCoverById.has(book.id)) return { ...book, cover: reassignedCoverById.get(book.id), coverUrl: undefined };
    const coverUrl = book.cover?.url || book.coverUrl;
    const invalidAssignments = invalidCoverAssignmentsById.get(book.id) || [];
    if (!invalidAssignments.some((item) => !item.url || item.url === coverUrl)) return book;
    const { cover: _cover, coverUrl: _coverUrl, ...withoutCover } = book;
    return withoutCover;
  });
const isNenCollectionBook = (book) => String(book.id).startsWith("curated-nen-collection-");
const fictionExcluded = candidateBooks
  .map((book) => ({ book, classification: classifyCatalogBook(book) }))
  .filter(({ book, classification }) => !isNenCollectionBook(book) && classification.decision === "exclude");
const fictionAmbiguous = candidateBooks
  .map((book) => ({ book, classification: classifyCatalogBook(book) }))
  .filter(({ book, classification }) => !isNenCollectionBook(book) && classification.decision === "ambiguous");

const nonFictionPublicGenres = new Set([
  "биография",
  "документальная литература",
  "научно-популярная литература",
  "научно-популярная книга",
  "познавательная книга",
  "познавательная история",
  "иллюстрированная энциклопедия",
]);
const reviewedFictionGenreOverrides = new Map([
  ["ol-ol19938743w", ["историческая проза"]],
  ["ol-ol12432535w", ["историческая проза"]],
  ["ol-ol38513598w", ["историческая проза"]],
  ["ol-ol33497265w", ["реалистическая проза"]],
  ["ol-ol55522w", ["реалистическая проза"]],
  ["ol-ol667419w", ["поэзия", "юмор"]],
  ["ol-ol38539262w", ["реалистическая проза"]],
  ["ol-ol27958552w", ["сказка"]],
  ["ol-ol23852449w", ["юмор"]],
  ["ol-ol33098425w", ["поэзия"]],
  ["ol-ol33137652w", ["приключения"]],
  ["ol-ol38508810w", ["реалистическая проза"]],
  ["ol-ol38533455w", ["реалистическая проза"]],
  ["ol-ol865246w", ["поэзия", "юмор"]],
  ["ol-ol44466703w", ["фэнтези"]],
  ["ol-ol43943169w", ["реалистическая проза"]],
  ["ol-ol38509253w", ["поэзия"]],
  ["ol-ol10358155w", ["реалистическая проза"]],
]);

const additionalThemeRules = [
  ["братья и сёстры", /(?:брат|сестр)[а-яё]*/iu],
  ["развод родителей", /развод|развед[её]нн|родители разошлись/iu],
  ["буллинг", /буллинг|травл[яеи]|школьн\w+ издев/iu],
  ["первая любовь", /первая любовь|влюб[а-яё]*/iu],
  ["эмоции", /эмоци|чувств[а-яё]*/iu],
  ["страх", /страх|боится|бояться|испуг/iu],
  ["смерть", /смерт|умира|погиб/iu],
  ["война", /войн|блокад|фронт/iu],
  ["инклюзия", /инклюз|инвалид|коляск|незряч|глух/iu],
  ["принятие себя", /приня(?:ть|тие) себя|быть собой|самопринят/iu],
  ["ответственность", /ответствен/iu],
  ["смелость", /смелост|храброст/iu],
  ["доброта", /доброта|добрые поступки/iu],
  ["творчество", /творчеств|рисован|сочиня|мастерит/iu],
  ["детектив", /детектив|расследован|сыщик/iu],
  ["фантастика", /фантастик|инопланет|космическ\w+ приключ/iu],
  ["динозавры", /динозавр/iu],
];

function enrichedThemes(book) {
  const evidence = [book.title, book.shortDescription, book.fullDescription].filter(Boolean).join(" ");
  const normalizedExisting = (book.themes ?? []).map((theme) => theme === "детективы" ? "детектив" : theme);
  return compact([
    ...normalizedExisting,
    ...additionalThemeRules.filter(([, pattern]) => pattern.test(evidence)).map(([theme]) => theme),
  ]);
}

function fictionOnlyGenres(book) {
  const publicGenres = (book.genres ?? []).filter((genre) => !nonFictionPublicGenres.has(genre));
  if (publicGenres.length) return publicGenres;
  const subjects = (book.sourceMetadata?.subjects ?? []).join(" ");
  if (/\b(?:poetry|poems?|riddles)\b/iu.test(subjects)) return ["поэзия"];
  if (/\b(?:fairy tales?|folklore|legends?|myths?)\b/iu.test(subjects)) return ["сказка"];
  if (/\b(?:biographical fiction|historical fiction)\b/iu.test(subjects)) return ["историческая проза"];
  if (/\b(?:juvenile fiction|fiction|short stories|novels?)\b/iu.test(subjects)) return ["реалистическая проза"];
  return reviewedFictionGenreOverrides.get(book.id) ?? [];
}

const books = candidateBooks
  .filter((book) => isNenCollectionBook(book) || classifyCatalogBook(book).decision === "keep")
  .map((book) => {
    const normalized = {
      ...book,
      genres: isNenCollectionBook(book) ? compact(book.genres) : fictionOnlyGenres(book),
      themes: enrichedThemes(book),
      publisher: normalizePublisher(book.publisher),
      shortDescription: fixGeneratedAuthorCases(book.shortDescription, book.author),
      fullDescription: fixGeneratedAuthorCases(book.fullDescription, book.author),
    };
    return {
      ...normalized,
      whyRecommended: buildBookRecommendation(normalized, { force: true }),
    };
  });

const refreshedRecommendations = books.filter((book) => {
  const original = candidateBooks.find((candidate) => candidate.id === book.id)?.whyRecommended ?? "";
  return isGeneratedRecommendation(original) && book.whyRecommended !== original;
});

const missingFictionGenres = books.filter((book) => !book.genres.length);
if (missingFictionGenres.length) {
  throw new Error(`После удаления non-fiction жанров остались книги без подтверждённого художественного жанра: ${missingFictionGenres.map((book) => book.id).join(", ")}`);
}

function classificationReportRecord({ book, classification }) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    reason: classification.type,
    determinedType: classification.type,
    confidence: classification.confidence,
    evidence: classification.evidence,
    bibliographicSources: book.bibliographicSources ?? [],
    sourceSubjects: book.sourceMetadata?.subjects ?? [],
  };
}

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
await mkdir(dirname(fictionExcludedReportPath), { recursive: true });
await Promise.all([
  writeFile(targetPath, `${JSON.stringify(books, null, 2)}\n`, "utf8"),
  writeFile(fictionExcludedReportPath, `${JSON.stringify(fictionExcluded.map(classificationReportRecord), null, 2)}\n`, "utf8"),
  writeFile(fictionAmbiguousReportPath, `${JSON.stringify(fictionAmbiguous.map(classificationReportRecord), null, 2)}\n`, "utf8"),
]);
console.log(`Сформировано книг: ${books.length} (кандидатов ${candidateBooks.length}; исключено ранее ${excludedImportedIds.size}, по типу издания ${fictionExcluded.length}, на ручной проверке ${fictionAmbiguous.length})`);
console.log(`Обновлено автоматически сформированных рекомендаций: ${refreshedRecommendations.length}`);
