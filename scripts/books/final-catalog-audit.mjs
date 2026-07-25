import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyCatalogBook } from "./fiction-classifier.mjs";

const root = resolve(import.meta.dirname, "../..");
const books = JSON.parse(await readFile(resolve(root, "data/generated/books.json"), "utf8"));
const excluded = JSON.parse(await readFile(resolve(root, "data/reports/fiction-catalog-excluded.json"), "utf8"));
const ambiguous = JSON.parse(await readFile(resolve(root, "data/reports/ambiguous-review.json"), "utf8"));
const annotations = JSON.parse(await readFile(resolve(root, "data/reports/annotation-cleanup.json"), "utf8"));

const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("ru")
  .replace(/ё/gu, "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

function duplicatesBy(key) {
  const groups = new Map();
  for (const book of books) {
    const value = key(book);
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push({ id: book.id, title: book.title, author: book.author });
  }
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([value, items]) => ({ value, items }));
}

function exclusionCategory(item) {
  const text = normalize([
    item.title,
    item.determinedType,
    ...(item.evidence ?? []),
    ...(item.sourceSubjects ?? []),
  ].join(" "));
  if (/\bатлас\b/u.test(text) || /\batlases?\b/u.test(text)) return "атласы";
  if (/энциклопед/u.test(text) || /encyclop/u.test(text)) return "энциклопедии";
  if (/учебник|учебн|пособи|рабочая тетрад|грамматик|разговорник|буквар|задачник|упражнен|textbook|study and teaching|grammar|readers|problems exercises/u.test(text)) return "учебные и методические";
  if (/словар|справочник|библиограф|каталог|dictionary|handbook|reference|bibliograph|catalog/u.test(text)) return "справочные";
  if (/биограф|документаль|дневник|мемуар|biograph|autobiograph|diaries|memoirs|personal narratives/u.test(text)) return "биографии и документальные";
  if (/научно популяр|познаватель|science|technology|mathematics|physics|chemistry|astronomy|biology|zoology|botany|anatomy|medicine|geography/u.test(text)) return "научно-популярные и познавательные";
  return "другой non-fiction";
}

const categoryCounts = Object.fromEntries(
  [...new Set(excluded.map(exclusionCategory))]
    .sort()
    .map((category) => [category, excluded.filter((item) => exclusionCategory(item) === category).length]),
);

const keywordPattern = /атлас|энциклопед|словар|справочник|учебник|пособи/iu;
const keywordReview = books
  .filter((book) => keywordPattern.test(`${book.title} ${(book.sourceMetadata?.subjects ?? []).join(" ")}`))
  .map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    classification: classifyCatalogBook(book),
    genres: book.genres,
    subjects: book.sourceMetadata?.subjects ?? [],
  }));

const remainingTypeReview = books
  .map((book) => ({ book, classification: classifyCatalogBook(book) }))
  .filter(({ classification }) => classification.decision !== "keep")
  .map(({ book, classification }) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    classification,
  }));

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    finalBooks: books.length,
    removedInFinalPass: excluded.length,
    ambiguousForManualReview: ambiguous.length,
    remainingAutomaticExclusions: remainingTypeReview.filter((item) => item.classification.decision === "exclude").length,
    keywordReviewRecords: keywordReview.length,
    duplicateIds: duplicatesBy((book) => book.id).length,
    duplicateSlugs: duplicatesBy((book) => book.slug).length,
    duplicateTitleAuthors: duplicatesBy((book) => `${normalize(book.title)}|${normalize(book.author)}`).length,
    prohibitedTemplateHits: annotations.summary.prohibitedTemplateHits,
    exactDuplicateDescriptionGroups: annotations.summary.exactDuplicateDescriptionGroups,
    nearDuplicateDescriptionPairs: annotations.summary.nearDuplicateDescriptionPairs,
  },
  removedByType: categoryCounts,
  keywordReview,
  remainingTypeReview,
  ambiguous,
  duplicates: {
    ids: duplicatesBy((book) => book.id),
    slugs: duplicatesBy((book) => book.slug),
    titleAuthors: duplicatesBy((book) => `${normalize(book.title)}|${normalize(book.author)}`),
  },
};

const output = resolve(root, "data/reports/final-fiction-scan.json");
await mkdir(resolve(root, "data/reports"), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report.summary, removedByType: report.removedByType }, null, 2));
