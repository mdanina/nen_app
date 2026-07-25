import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

export const DEFAULT_SEED = 20260721;
export const PUBLIC_USE = {
  fact: "bibliographic-fact-review-required",
  blocked: "blocked-pending-rights-review",
};

const CHILD_SUBJECT_PATTERNS = [
  /\bjuvenile fiction\b/u,
  /\bjuvenile literature\b/u,
  /\bchildren'?s (?:stories|literature|books)\b/u,
  /\bchildren\b/u,
  /\bpicture books?\b/u,
  /\byoung adult (?:fiction|literature)\b/u,
  /\bfiction for children\b/u,
  /детск(?:ая|ие|ой) (?:литература|книги|литературы)/u,
  /литература для детей/u,
  /книги для детей/u,
  /подростковая литература/u,
];

const EMPTY_MARKERS = new Set(["", "n/a", "na", "none", "null", "unknown", "undefined", "-"]);
const LANGUAGE_MAP = new Map([
  ["rus", "ru"], ["ru", "ru"], ["russian", "ru"],
  ["eng", "en"], ["en", "en"], ["english", "en"],
  ["ger", "de"], ["deu", "de"], ["de", "de"],
  ["fre", "fr"], ["fra", "fr"], ["fr", "fr"],
  ["spa", "es"], ["es", "es"], ["ukr", "uk"], ["uk", "uk"],
]);

function cleanScalar(value) {
  if (typeof value !== "string") return value;
  const cleaned = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return EMPTY_MARKERS.has(cleaned.toLocaleLowerCase("en")) ? undefined : cleaned;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function arrayOf(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function referenceKey(value) {
  if (typeof value === "string") return cleanScalar(value);
  if (value && typeof value === "object") return cleanScalar(value.key);
  return undefined;
}

export function normalizeTitle(value) {
  const display = cleanScalar(value);
  if (!display) return { display: undefined, match: undefined };
  const punctuation = display
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s*([,.;:!?])\s*/gu, "$1 ")
    .replace(/\s+/gu, " ")
    .replace(/\s+$/u, "");
  const match = punctuation
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return { display: punctuation, match };
}

export function normalizeAuthorName(value) {
  const display = cleanScalar(value);
  if (!display) return { display: undefined, match: undefined };
  const normalized = display.replace(/\s*,\s*/gu, ", ").replace(/\s+/gu, " ");
  return {
    display: normalized,
    match: normalized.toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
  };
}

export function normalizeLanguage(value) {
  const key = referenceKey(value)?.replace(/^\/languages\//u, "").toLocaleLowerCase("en");
  if (!key) return undefined;
  return LANGUAGE_MAP.get(key) ?? key;
}

export function normalizePublicationYear(value) {
  if (Number.isInteger(value) && value >= 1000 && value <= 2100) return value;
  const match = String(value ?? "").match(/(?:^|\D)(1\d{3}|20\d{2}|2100)(?:\D|$)/u);
  return match ? Number(match[1]) : undefined;
}

export function normalizeIsbn(value) {
  const compact = String(value ?? "").toLocaleUpperCase("en").replace(/[^0-9X]/gu, "");
  if (compact.length !== 10 && compact.length !== 13) return { raw: value, normalized: compact || undefined, valid: false, type: undefined };
  const valid = compact.length === 10 ? isValidIsbn10(compact) : isValidIsbn13(compact);
  return { raw: value, normalized: compact, valid, type: compact.length === 10 ? "isbn10" : "isbn13" };
}

export function isValidIsbn10(isbn) {
  if (!/^\d{9}[\dX]$/u.test(isbn)) return false;
  const total = [...isbn].reduce((sum, char, index) => sum + (char === "X" ? 10 : Number(char)) * (10 - index), 0);
  return total % 11 === 0;
}

export function isValidIsbn13(isbn) {
  if (!/^\d{13}$/u.test(isbn)) return false;
  const total = [...isbn.slice(0, 12)].reduce((sum, char, index) => sum + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (total % 10)) % 10 === Number(isbn[12]);
}

export function parseDumpLine(line, lineNumber = 0, inputName = "input") {
  const columns = line.split("\t");
  if (columns.length < 5) throw new Error(`${inputName}:${lineNumber}: expected 5 TSV columns`);
  const [type, key, revision, lastModified, ...jsonParts] = columns;
  const entityLevel = type.replace(/^\/type\//u, "");
  if (!["work", "edition", "author"].includes(entityLevel)) return null;
  let value;
  try { value = JSON.parse(jsonParts.join("\t")); }
  catch (error) { throw new Error(`${inputName}:${lineNumber}: invalid JSON: ${error.message}`); }
  return { type, key, revision: Number(revision) || revision, lastModified, entityLevel, value, rawLine: line };
}

function provenance({ entityLevel, entityId, dumpDate, rawValue, normalizedValue, publicUse = PUBLIC_USE.fact }) {
  return {
    source: "openlibrary",
    entityLevel,
    entityId,
    dumpDate,
    rawValue,
    normalizedValue,
    reviewStatus: "unreviewed",
    publicUse,
  };
}

function descriptionValue(value) {
  if (typeof value === "string") return cleanScalar(value);
  if (value && typeof value === "object") return cleanScalar(value.value);
  return undefined;
}

function commonRecord(record, dumpDate) {
  return {
    source: "openlibrary",
    entityLevel: record.entityLevel,
    openLibraryId: record.key,
    dumpDate,
    sourceRevision: record.revision,
    sourceLastModified: record.lastModified,
    reviewStatus: "unreviewed",
    publicUse: PUBLIC_USE.fact,
  };
}

export function normalizeAuthor(record, dumpDate) {
  const rawName = record.value.name;
  const name = normalizeAuthorName(rawName);
  const alternateNames = unique(arrayOf(record.value.alternate_names).map(cleanScalar));
  return {
    ...commonRecord(record, dumpDate),
    authorId: record.key,
    name: name.display,
    nameMatchKey: name.match,
    alternateNames,
    fields: {
      name: provenance({ entityLevel: "author", entityId: record.key, dumpDate, rawValue: rawName, normalizedValue: name.display }),
      alternateNames: provenance({ entityLevel: "author", entityId: record.key, dumpDate, rawValue: record.value.alternate_names, normalizedValue: alternateNames }),
    },
  };
}

export function normalizeWork(record, dumpDate) {
  const title = normalizeTitle(record.value.title);
  const authorIds = unique(arrayOf(record.value.authors).map((entry) => referenceKey(entry?.author ?? entry)));
  const subjects = unique(arrayOf(record.value.subjects).map(cleanScalar));
  const subjectPlaces = unique(arrayOf(record.value.subject_places).map(cleanScalar));
  const subjectPeople = unique(arrayOf(record.value.subject_people).map(cleanScalar));
  const description = descriptionValue(record.value.description);
  const coverIds = unique(arrayOf(record.value.covers).filter(Number.isFinite));
  const childSignals = subjects.filter((subject) => isChildSubject(subject));
  return {
    ...commonRecord(record, dumpDate),
    workId: record.key,
    title: title.display,
    titleMatchKey: title.match,
    authorIds,
    subjects,
    subjectPlaces,
    subjectPeople,
    childFilter: { passed: childSignals.length > 0, explicitSignals: childSignals, method: "explicit-subject-only" },
    restrictedFields: {
      description: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.description, normalizedValue: description, publicUse: PUBLIC_USE.blocked }),
      coverIds: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.covers, normalizedValue: coverIds, publicUse: PUBLIC_USE.blocked }),
    },
    fields: {
      title: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.title, normalizedValue: title.display }),
      authorIds: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.authors, normalizedValue: authorIds }),
      subjects: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.subjects, normalizedValue: subjects }),
      subjectPlaces: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.subject_places, normalizedValue: subjectPlaces }),
      subjectPeople: provenance({ entityLevel: "work", entityId: record.key, dumpDate, rawValue: record.value.subject_people, normalizedValue: subjectPeople }),
    },
  };
}

export function normalizeEdition(record, dumpDate) {
  const title = normalizeTitle(record.value.title);
  const authorIds = unique(arrayOf(record.value.authors).map(referenceKey));
  const workIds = unique(arrayOf(record.value.works).map(referenceKey));
  const rawIsbns = [...arrayOf(record.value.isbn_10), ...arrayOf(record.value.isbn_13)];
  const isbns = rawIsbns.map(normalizeIsbn);
  const languages = unique(arrayOf(record.value.languages).map(normalizeLanguage));
  const publishers = unique(arrayOf(record.value.publishers).map(cleanScalar));
  const year = normalizePublicationYear(record.value.publish_date);
  const coverIds = unique(arrayOf(record.value.covers).filter(Number.isFinite));
  return {
    ...commonRecord(record, dumpDate),
    editionId: record.key,
    workIds,
    title: title.display,
    titleMatchKey: title.match,
    authorIds,
    isbns,
    languages,
    publishers,
    publicationYear: year,
    pages: Number.isInteger(record.value.number_of_pages) && record.value.number_of_pages > 0 ? record.value.number_of_pages : undefined,
    physicalFormat: cleanScalar(record.value.physical_format),
    translationOf: referenceKey(record.value.translation_of ?? record.value.translated_from),
    restrictedFields: {
      description: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.description, normalizedValue: descriptionValue(record.value.description), publicUse: PUBLIC_USE.blocked }),
      coverIds: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.covers, normalizedValue: coverIds, publicUse: PUBLIC_USE.blocked }),
    },
    fields: {
      title: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.title, normalizedValue: title.display }),
      workIds: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.works, normalizedValue: workIds }),
      authorIds: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.authors, normalizedValue: authorIds }),
      isbns: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: rawIsbns, normalizedValue: isbns }),
      languages: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.languages, normalizedValue: languages }),
      publishers: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.publishers, normalizedValue: publishers }),
      publicationYear: provenance({ entityLevel: "edition", entityId: record.key, dumpDate, rawValue: record.value.publish_date, normalizedValue: year }),
    },
  };
}

export function isChildSubject(subject) {
  const normalized = String(subject ?? "").normalize("NFKC").toLocaleLowerCase("ru").replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
  return CHILD_SUBJECT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function seededSample(items, count, seed = DEFAULT_SEED) {
  const random = mulberry32(Number(seed) || DEFAULT_SEED);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function authorSignature(work, authorsById) {
  return work.authorIds.map((id) => authorsById.get(id)?.nameMatchKey ?? id).sort().join("|");
}

export function findDuplicates(works, editions, authors) {
  const authorsById = new Map(authors.map((author) => [author.authorId, author]));
  const isbnGroups = new Map();
  for (const edition of editions) {
    for (const isbn of edition.isbns.filter((entry) => entry.valid)) {
      const group = isbnGroups.get(isbn.normalized) ?? [];
      group.push(edition.editionId);
      isbnGroups.set(isbn.normalized, group);
    }
  }
  const workGroups = new Map();
  for (const work of works) {
    const signature = `${work.titleMatchKey ?? ""}|${authorSignature(work, authorsById)}`;
    if (!work.titleMatchKey) continue;
    const group = workGroups.get(signature) ?? [];
    group.push(work.workId);
    workGroups.set(signature, group);
  }
  const editionsByWork = new Map();
  for (const edition of editions) {
    for (const workId of edition.workIds) {
      const group = editionsByWork.get(workId) ?? [];
      group.push(edition);
      editionsByWork.set(workId, group);
    }
  }
  const editionIdGroups = new Map();
  for (const edition of editions) {
    const group = editionIdGroups.get(edition.editionId) ?? [];
    group.push(edition);
    editionIdGroups.set(edition.editionId, group);
  }
  return {
    exactEditionDuplicates: [...editionIdGroups.entries()].filter(([, group]) => group.length > 1).map(([editionId, group]) => ({ editionId, occurrences: group.length, action: "keep-latest-revision-after-review" })),
    sharedIsbnEditionCandidates: [...isbnGroups.entries()].filter(([, ids]) => new Set(ids).size > 1).map(([isbn, editionIds]) => ({ isbn, editionIds: unique(editionIds), action: "manual-review-no-auto-merge" })),
    probableWorkDuplicates: [...workGroups.entries()].filter(([, ids]) => ids.length > 1).map(([signature, workIds]) => ({ signature, workIds, action: "manual-review-no-auto-merge" })),
    multipleEditionsOfWork: [...editionsByWork.entries()].filter(([, group]) => group.length > 1).map(([workId, group]) => ({ workId, editionIds: group.map((entry) => entry.editionId) })),
    explicitTranslations: editions.filter((edition) => edition.translationOf).map((edition) => ({ editionId: edition.editionId, translationOf: edition.translationOf })),
    probableReissues: [...editionsByWork.entries()].filter(([, group]) => group.length > 1).map(([workId, group]) => ({
      workId,
      editions: group.map((entry) => ({ editionId: entry.editionId, year: entry.publicationYear, publishers: entry.publishers, isbns: entry.isbns.filter((isbn) => isbn.valid).map((isbn) => isbn.normalized) })),
      action: "keep-separate-editions",
    })),
  };
}

function countBy(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([value, count]) => ({ value, count }));
}

function isIncompleteWork(work) {
  const missing = [];
  if (!work.title) missing.push("title");
  if (!work.authorIds.length) missing.push("authorIds");
  if (!work.subjects.length) missing.push("subjects");
  return missing;
}

function isIncompleteEdition(edition) {
  const missing = [];
  if (!edition.title) missing.push("title");
  if (!edition.workIds.length) missing.push("workIds");
  if (!edition.authorIds.length) missing.push("authorIds");
  if (!edition.languages.length) missing.push("languages");
  if (!edition.publicationYear) missing.push("publicationYear");
  if (!edition.isbns.length) missing.push("isbn");
  return missing;
}

async function readDumpFile(path, onLine) {
  const stream = createReadStream(path);
  const input = path.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
  const reader = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    if (line.trim()) await onLine(line, lineNumber);
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function runPipeline({ inputs, output, dumpDate, limit = 1000, seed = DEFAULT_SEED, fixture = false }) {
  if (!inputs?.length) throw new Error("At least one --input path is required");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dumpDate ?? "")) throw new Error("--dump-date must use YYYY-MM-DD");
  const outputRoot = resolve(output);
  const rawDir = join(outputRoot, "raw");
  const normalizedDir = join(outputRoot, "normalized");
  const reportsDir = join(outputRoot, "reports");
  await Promise.all([mkdir(rawDir, { recursive: true }), mkdir(normalizedDir, { recursive: true }), mkdir(reportsDir, { recursive: true })]);

  const rawByEntity = { work: [], edition: [], author: [] };
  const parsed = [];
  const parseErrors = [];
  const seenRecordKeys = new Map();
  const repeatedSourceRecords = [];
  for (const input of inputs.map((value) => resolve(value))) {
    await readDumpFile(input, async (line, lineNumber) => {
      try {
        const record = parseDumpLine(line, lineNumber, basename(input));
        if (!record) return;
        if (!fixture && /OLPILOT/u.test(record.key)) throw new Error(`${basename(input)}:${lineNumber}: fixture record requires --fixture`);
        rawByEntity[record.entityLevel].push(line);
        const identity = `${record.entityLevel}:${record.key}`;
        if (seenRecordKeys.has(identity)) repeatedSourceRecords.push({ entityLevel: record.entityLevel, openLibraryId: record.key, first: seenRecordKeys.get(identity), repeated: { input: basename(input), lineNumber } });
        else seenRecordKeys.set(identity, { input: basename(input), lineNumber });
        parsed.push(record);
      } catch (error) {
        parseErrors.push({ input: basename(input), lineNumber, message: error.message });
      }
    });
  }

  const authorsAll = parsed.filter((record) => record.entityLevel === "author").map((record) => normalizeAuthor(record, dumpDate));
  const worksAll = parsed.filter((record) => record.entityLevel === "work").map((record) => normalizeWork(record, dumpDate));
  const editionsAll = parsed.filter((record) => record.entityLevel === "edition").map((record) => normalizeEdition(record, dumpDate));
  const candidateWorks = worksAll.filter((work) => work.childFilter.passed).sort((a, b) => a.workId.localeCompare(b.workId)).slice(0, Math.max(0, Number(limit) || 1000));
  const candidateWorkIds = new Set(candidateWorks.map((work) => work.workId));
  const candidateEditions = editionsAll.filter((edition) => edition.workIds.some((id) => candidateWorkIds.has(id)));
  const candidateAuthorIds = new Set([...candidateWorks.flatMap((work) => work.authorIds), ...candidateEditions.flatMap((edition) => edition.authorIds)]);
  const candidateAuthors = authorsAll.filter((author) => candidateAuthorIds.has(author.authorId));
  const duplicates = findDuplicates(candidateWorks, candidateEditions, candidateAuthors);
  duplicates.repeatedSourceRecords = repeatedSourceRecords;

  const allIsbns = editionsAll.flatMap((edition) => edition.isbns);
  const invalidIsbns = editionsAll.flatMap((edition) => edition.isbns.filter((isbn) => !isbn.valid).map((isbn) => ({ editionId: edition.editionId, ...isbn })));
  const incompleteRecords = [
    ...worksAll.map((work) => ({ entityLevel: "work", id: work.workId, missing: isIncompleteWork(work) })).filter((entry) => entry.missing.length),
    ...editionsAll.map((edition) => ({ entityLevel: "edition", id: edition.editionId, missing: isIncompleteEdition(edition) })).filter((entry) => entry.missing.length),
    ...authorsAll.filter((author) => !author.name).map((author) => ({ entityLevel: "author", id: author.authorId, missing: ["name"] })),
  ];
  const languages = countBy(editionsAll.flatMap((edition) => edition.languages));
  const subjects = countBy(worksAll.flatMap((work) => work.subjects.map((subject) => subject.toLocaleLowerCase("ru"))));
  const childSubjects = countBy(worksAll.flatMap((work) => work.childFilter.explicitSignals.map((subject) => subject.toLocaleLowerCase("ru"))));
  const exclusions = worksAll.filter((work) => !work.childFilter.passed).map((work) => ({ workId: work.workId, title: work.title, reason: "no-explicit-child-subject" }));
  const russianEditionIds = editionsAll.filter((edition) => edition.languages.includes("ru")).map((edition) => edition.editionId);
  const descriptions = parsed.filter((record) => descriptionValue(record.value.description)).length;
  const coverIds = parsed.filter((record) => arrayOf(record.value.covers).some(Number.isFinite)).length;
  const qualitySummary = {
    source: "openlibrary",
    dumpDate,
    fixture,
    limit: Number(limit),
    seed: Number(seed),
    processedSourceRecords: parsed.length,
    parseErrors: parseErrors.length,
    entities: { works: worksAll.length, editions: editionsAll.length, authors: authorsAll.length },
    candidates: { works: candidateWorks.length, editions: candidateEditions.length, authors: candidateAuthors.length },
    russianEditionRecords: russianEditionIds.length,
    editionsWithIsbn: editionsAll.filter((edition) => edition.isbns.length).length,
    isbnValues: { total: allIsbns.length, valid: allIsbns.filter((isbn) => isbn.valid).length, invalid: allIsbns.filter((isbn) => !isbn.valid).length },
    recordsWithAuthor: { works: worksAll.filter((work) => work.authorIds.length).length, editions: editionsAll.filter((edition) => edition.authorIds.length).length },
    editionsWithYear: editionsAll.filter((edition) => edition.publicationYear).length,
    worksWithSubjects: worksAll.filter((work) => work.subjects.length).length,
    sourceRecordsWithDescription: descriptions,
    sourceRecordsWithCoverId: coverIds,
    duplicates: {
      repeatedSourceRecords: repeatedSourceRecords.length,
      exactEditionGroups: duplicates.exactEditionDuplicates.length,
      sharedIsbnGroups: duplicates.sharedIsbnEditionCandidates.length,
      probableWorkGroups: duplicates.probableWorkDuplicates.length,
      worksWithMultipleEditions: duplicates.multipleEditionsOfWork.length,
    },
    primaryChildFilterPassed: candidateWorks.length,
    primaryExclusionReasons: [{ reason: "no-explicit-child-subject", count: exclusions.length }],
  };

  for (const [entity, lines] of Object.entries(rawByEntity)) await writeFile(join(rawDir, `${entity}s.txt`), lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  await Promise.all([
    writeJson(join(normalizedDir, "works.json"), candidateWorks),
    writeJson(join(normalizedDir, "editions.json"), candidateEditions),
    writeJson(join(normalizedDir, "authors.json"), candidateAuthors),
    writeJson(join(reportsDir, "quality-summary.json"), qualitySummary),
    writeJson(join(reportsDir, "duplicates.json"), duplicates),
    writeJson(join(reportsDir, "invalid-isbns.json"), invalidIsbns),
    writeJson(join(reportsDir, "incomplete-records.json"), incompleteRecords),
    writeJson(join(reportsDir, "languages.json"), languages),
    writeJson(join(reportsDir, "subjects.json"), { all: subjects, childSignals: childSubjects }),
    writeJson(join(reportsDir, "exclusions.json"), exclusions),
    writeJson(join(reportsDir, "parse-errors.json"), parseErrors),
    writeJson(join(reportsDir, "manual-review-sample-100.json"), seededSample(candidateWorks.map((work) => ({ workId: work.workId, title: work.title, authorIds: work.authorIds, explicitChildSignals: work.childFilter.explicitSignals })), 100, Number(seed))),
  ]);
  const manifest = {
    schemaVersion: 1,
    source: "openlibrary",
    sourceFormat: "official-dump-tsv",
    dumpDate,
    fixture,
    inputs: await Promise.all(inputs.map(async (input) => ({ path: basename(input), sha256: sha256(await readFile(resolve(input))) }))),
    generatedFiles: ["raw/works.txt", "raw/editions.txt", "raw/authors.txt", "normalized/works.json", "normalized/editions.json", "normalized/authors.json", "reports/quality-summary.json", "reports/duplicates.json", "reports/invalid-isbns.json", "reports/incomplete-records.json", "reports/languages.json", "reports/subjects.json", "reports/exclusions.json", "reports/parse-errors.json", "reports/manual-review-sample-100.json"],
  };
  await writeJson(join(outputRoot, "manifest.json"), manifest);
  return { qualitySummary, manifest };
}
