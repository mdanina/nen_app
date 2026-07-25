#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOptions = {
  imported: resolve(root, "data/import/openlibrary/russian-children-staging/books.jsonl"),
  production: resolve(root, "data/generated/books.json"),
  output: resolve(root, "data/import/openlibrary/prepared-catalog"),
  seed: 20260723,
};

const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];
const compactText = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const stripMarks = (value) => compactText(value).normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "");
const transliteration = new Map(Object.entries({
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
}));
export function normalizeMatch(value) {
  return [...stripMarks(value).toLocaleLowerCase("ru")]
    .map((character) => transliteration.get(character) ?? character)
    .join("")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}
const tokens = (value) => new Set(normalizeMatch(value).split(" ").filter((token) => token.length >= 4));
const intersects = (left, right) => [...left].some((value) => right.has(value));

const exclusionRules = [
  { code: "dissertation", label: "диссертация или автореферат", pattern: /\b(?:dissertat|dissertats|avtoreferat|thesis submitted|doctoral thesis)\w*/u },
  { code: "conference_materials", label: "материалы конференции", pattern: /\b(?:materialy?\s+(?:nauch|mezhdunarod|konfer)|conference proceedings|proceedings of|sbornik dokladov)\b/u },
  { code: "bibliography", label: "библиография или библиографический указатель", pattern: /\b(?:bibliograf|bibliograph|bibliographical index|ukazatel literatur|annotirovannyi ukazatel)\w*/u },
  { code: "library_catalog", label: "каталог или служебная библиотечная публикация", pattern: /^(?:katalog|catalogue?|library catalog|sistematicheskii katalog|pechatnyi katalog)\b/u },
  { code: "textbook", label: "явно обозначенный учебник или учебный курс", pattern: /^(?:uchebnik\b|vvedenie v teoriiu\b|nachalnyi kurs geografii\b|pervye uroki geografii\b.*\bshkol|kurs\b.*\bdlia\b.*\buchebnykh zaveden)/u },
  { code: "higher_education", label: "учебное издание для вузов или студентов", pattern: /\b(?:uchebnik dlia vuz|uchebnoe posobie dlia student|studentov pedagogich|university textbook|higher education course)\w*/u },
  { code: "teaching_methodology", label: "методическое или педагогическое пособие", pattern: /\b(?:metodichesk|metodika prepodav|posobie dlia uchitel|teacher(?:'s)? manual|pedagogichesk|vospitan\w* detei|obuchenii detei)\w*/u },
  { code: "teaching_methodology", label: "идеологическое пособие о воспитании", pattern: /\bkommunistich\w*.{0,30}\bvospitan\w*/u },
  { code: "parent_or_library_guide", label: "руководство для взрослых или библиотечных работников", pattern: /\b(?:chto i kak chitat vashemu rebenku|rabota s .{0,50} literaturoi v biblioteke|rukovodstvo dlia roditelei)\b/u },
  { code: "literary_research", label: "исследование или справочник по детской литературе", pattern: /^(?:detskaia literatura(?: [a-z]+){0,3}|sovetskie detskie pisateli|o detskoi literature(?: .*)?|mirovaia slovesnost dlia detei i o detiakh)$/u },
  { code: "literary_research", label: "исторический курс детской литературы", pattern: /^detskaia literatura (?:pervaia|vtoraia) polovina\b/u },
  { code: "literary_research", label: "исследование или справочник по детской литературе", pattern: /\b(?:detskaia literatura i voprosy masterstva|za chto deti liubiat chars)\w*/u },
  { code: "literary_research", label: "исследование или справочник по чтению", pattern: /\b(?:literatura .{0,40} v detskom chtenii|neizdannye materialy ekspedits)\w*/u },
  { code: "publisher_record", label: "служебная запись издательства или книжного склада", pattern: /\b(?:izdatel\s*stvo i knizhny\s*i sklad|knigoizdatel\s*stvo i knizhny\s*i sklad)\b/u },
  { code: "literary_research", label: "исследование или критика детской литературы", pattern: /\b(?:detskaia literatura|detskoi literatury|children s literature)\b.{0,70}\b(?:istor|kritik|poetik|kontekst|problem|razvit|issledovan|teori|bibliograf)\w*/u },
  { code: "literary_research", label: "исследование или критика детской литературы", pattern: /\b(?:istor|kritik|poetik|kontekst|problem|razvit|issledovan|teori)\w*.{0,70}\b(?:detskaia literatura|detskoi literatury|children s literature)\b/u },
];

export function exclusionReason(book) {
  const title = normalizeMatch(book.title);
  for (const rule of exclusionRules) {
    if (rule.pattern.test(title)) return { code: rule.code, reason: rule.label, evidence: book.title };
  }
  return null;
}

function sourceTitleKeys(book) {
  return unique([book.title, book.originalTitle, ...(book.alternativeTitles ?? [])].map(normalizeMatch));
}
function productionTitleKeys(book) {
  return unique([book.title, book.originalTitle].map(normalizeMatch));
}
function sourceAuthorTokens(book) { return tokens((book.authors ?? []).join(" ")); }
function productionAuthorTokens(book) { return tokens(book.author); }

export function duplicateEvidence(imported, production, productionIndexes) {
  const importedIsbns = new Set(imported.isbns ?? []);
  for (const isbn of importedIsbns) {
    const match = productionIndexes.byIsbn.get(isbn);
    if (match) return { existing: match, method: "isbn", evidence: isbn, confidence: "high" };
  }
  if (productionIndexes.byWorkId) {
    const match = productionIndexes.byWorkId.get(imported.workId);
    if (match) return { existing: match, method: "work_id", evidence: imported.workId, confidence: "high" };
  }
  const importedTitles = sourceTitleKeys(imported);
  const importedAuthors = sourceAuthorTokens(imported);
  for (const existing of production) {
    if (!productionTitleKeys(existing).some((title) => importedTitles.includes(title))) continue;
    if (intersects(importedAuthors, productionAuthorTokens(existing))) {
      return { existing, method: "title_author", evidence: `${imported.title} — ${(imported.authors ?? []).join(", ")}`, confidence: "high" };
    }
  }
  return null;
}

function slugPart(value) {
  const result = normalizeMatch(value).replace(/\s+/gu, "-").replace(/^-|-$/gu, "").slice(0, 72);
  return result || "book";
}
function importedId(workId) {
  const key = String(workId ?? "").replace(/^\/works\//u, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-");
  return key ? `ol-${key}` : `ol-${sha(workId).slice(0, 16)}`;
}
function importedDraft(book) {
  const id = importedId(book.workId);
  const isbn13 = (book.isbns ?? []).find((isbn) => /^97[89]\d{10}$/u.test(isbn)) ?? null;
  return {
    id,
    slug: `${slugPart(book.title)}-${id.replace(/^ol-/u, "")}`,
    title: book.title,
    originalTitle: book.originalTitle ?? null,
    author: (book.authors ?? []).join("; "),
    shortDescription: "",
    fullDescription: null,
    whyRecommended: "",
    cover: { kind: "placeholder", rightsStatus: "not-required" },
    identificationStatus: isbn13 ? "identified" : "provisional",
    isbn13,
    publisher: book.publishers?.[0] ?? null,
    publicationYear: book.firstPublicationYear ?? null,
    bibliographicSources: [`https://openlibrary.org${book.workId}`],
    ageMin: null,
    ageMax: null,
    ageLabel: "",
    readingMode: null,
    genres: [],
    themes: [],
    moods: [],
    bookFormats: [],
    lifeSituations: [],
    emotionalStates: [],
    suitableForBedtime: false,
    languageDifficulty: null,
    lengthCategory: null,
    sensitiveTopics: [],
    sensitiveTopicsReviewed: false,
    status: "draft",
    sourceMetadata: {
      source: "openlibrary",
      retrievedAt: book.retrievedAt,
      license: book.license,
      workId: book.workId,
      editionIds: book.editionIds ?? [],
      primaryEditionId: book.primaryEditionId ?? null,
      editionCount: book.editionCount ?? 0,
      authors: book.authors ?? [],
      authorIds: book.authorIds ?? [],
      authorStatus: book.authorStatus,
      sourceDescription: book.description ?? null,
      descriptionProvenance: book.descriptionProvenance ?? null,
      languages: book.languages ?? [],
      publishers: book.publishers ?? [],
      isbns: book.isbns ?? [],
      series: book.series ?? [],
      subjects: book.subjects ?? [],
      subjectPeople: book.subjectPeople ?? [],
      subjectPlaces: book.subjectPlaces ?? [],
      subjectTimes: book.subjectTimes ?? [],
      coverIds: book.coverIds ?? [],
      coverUrl: book.coverUrl ?? null,
      coverProvenance: book.coverProvenance ?? null,
      alternativeTitles: book.alternativeTitles ?? [],
      completenessStatus: book.completenessStatus,
    },
  };
}

function seededSample(values, count, seed) {
  let state = Number(seed) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((left, right) => left.order - right.order).slice(0, count).map(({ value }) => value);
}

export async function prepareAppCatalog(options = defaultOptions) {
const imported = (await readFile(options.imported, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const production = JSON.parse(await readFile(options.production, "utf8"));
const productionIndexes = {
  byIsbn: new Map(production.filter((book) => book.isbn13).map((book) => [book.isbn13, book])),
  byWorkId: new Map(production.filter((book) => book.sourceMetadata?.workId).map((book) => [book.sourceMetadata.workId, book])),
};

const excluded = [];
const cleaned = [];
for (const book of imported) {
  const reason = exclusionReason(book);
  if (reason) excluded.push({ id: book.id, workId: book.workId, title: book.title, authors: book.authors, subjects: book.subjects, ...reason });
  else cleaned.push(book);
}

const duplicates = [];
const additions = [];
for (const book of cleaned) {
  const match = duplicateEvidence(book, production, productionIndexes);
  if (match) {
    duplicates.push({ imported: { id: book.id, workId: book.workId, title: book.title, authors: book.authors, isbns: book.isbns }, existing: { id: match.existing.id, slug: match.existing.slug, title: match.existing.title, author: match.existing.author, isbn13: match.existing.isbn13 ?? null }, method: match.method, evidence: match.evidence, confidence: match.confidence });
  } else additions.push(importedDraft(book));
}

const combined = [...production, ...additions];
const exclusionCounts = Object.fromEntries(Object.entries(excluded.reduce((result, item) => { result[item.code] = (result[item.code] ?? 0) + 1; return result; }, {})).sort((left, right) => right[1] - left[1]));
const summary = {
  generatedAt: new Date().toISOString(),
  productionModified: false,
  source: { production: options.production, imported: options.imported },
  counts: { productionBooks: production.length, importedBooks: imported.length, excluded: excluded.length, cleanedImported: cleaned.length, duplicatesWithProduction: duplicates.length, newImportedBooks: additions.length, combinedCatalog: combined.length },
  exclusionCounts,
  notes: ["Редакционные книги сохранены без изменения объектов.", "Импортированные книги имеют status=draft и пустые поля НЭН.", "Исходные аннотации и обложки не разрешены для автоматической публикации."],
};

await mkdir(options.output, { recursive: true });
await Promise.all([
  writeFile(resolve(options.output, "catalog.json"), JSON.stringify(combined, null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "cleaned-imported.json"), JSON.stringify(additions, null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "excluded.json"), JSON.stringify(excluded, null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "duplicates.json"), JSON.stringify(duplicates, null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "sample-50.json"), JSON.stringify(seededSample(combined, Math.min(50, combined.length), options.seed), null, 2) + "\n", "utf8"),
  writeFile(resolve(options.output, "excluded-sample-20.json"), JSON.stringify(seededSample(excluded, Math.min(20, excluded.length), options.seed + 1), null, 2) + "\n", "utf8"),
]);
console.log(JSON.stringify(summary, null, 2));
return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { ...defaultOptions };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[++index];
    if (key === "--imported") options.imported = resolve(value);
    else if (key === "--production") options.production = resolve(value);
    else if (key === "--output") options.output = resolve(value);
    else if (key === "--seed") options.seed = Number(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  await prepareAppCatalog(options);
}
