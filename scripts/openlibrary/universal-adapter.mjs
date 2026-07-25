import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import {
  annotationRecord,
  coverReference,
  defineAdapter,
  internalSourceId,
  sourceIdentifier,
  sourcedValue,
} from "../../packages/import-core/src/index.mjs";
import { normalizeAuthorName, normalizeIsbn, normalizeLanguage, normalizePublicationYear, normalizeTitle, parseDumpLine } from "./pipeline.mjs";

export const openLibraryDescriptor = {
  id: "openlibrary",
  displayName: "Open Library",
  homepage: "https://openlibrary.org/",
  license: {
    code: "openlibrary-rights-not-asserted",
    name: "Internet Archive does not assert new database rights; third-party rights may remain",
    url: "https://openlibrary.org/developers/licensing",
    metadataReuse: "unknown",
    annotationReuse: "unknown",
    coverReuse: "external-display-only",
    attributionRequired: "unknown",
    notes: "No field is cleared for public use automatically; annotations and cover references require rights review.",
  },
};

const array = (value) => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
const clean = (value) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() || null : value;
const unique = (values) => [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
const ref = (value) => typeof value === "string" ? value : value?.key;
const descriptionText = (value) => typeof value === "string" ? value : typeof value?.value === "string" ? value.value : null;

async function readFileRecords(input, retrievedAt, records, errors) {
  const source = createReadStream(input);
  const decoded = input.endsWith(".gz") ? source.pipe(createGunzip()) : source;
  const reader = createInterface({ input: decoded, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      const parsed = parseDumpLine(line, lineNumber, basename(input));
      if (!parsed) continue;
      records.push({
        source: openLibraryDescriptor.id,
        sourceRecordId: parsed.key,
        entityLevel: parsed.entityLevel,
        retrievedAt,
        license: openLibraryDescriptor.license,
        payload: parsed.value,
        rawLine: line,
        sourceRevision: parsed.revision,
        sourceLastModified: parsed.lastModified,
      });
    } catch (error) {
      errors.push({ input: basename(input), lineNumber, message: error.message });
    }
  }
}

function field(record, rawValue, normalizedValue) {
  return sourcedValue({
    descriptor: openLibraryDescriptor,
    sourceRecordId: record.sourceRecordId,
    entityLevel: record.entityLevel,
    retrievedAt: record.retrievedAt,
    rawValue,
    normalizedValue,
  });
}

function identifiers(record) {
  return [sourceIdentifier(openLibraryDescriptor.id, record.entityLevel, record.sourceRecordId)];
}

function annotations(record, entityId) {
  const text = descriptionText(record.payload.description);
  if (text === null) return [];
  return [annotationRecord({
    descriptor: openLibraryDescriptor,
    sourceRecordId: record.sourceRecordId,
    entityLevel: record.entityLevel,
    entityId,
    retrievedAt: record.retrievedAt,
    text,
    origin: "openlibrary-record; upstream-origin-unknown",
    publicUse: "unknown",
  })];
}

function covers(record, entityId) {
  return unique(array(record.payload.covers).filter((value) => Number.isFinite(value) || typeof value === "string")).map((coverId) => coverReference({
    descriptor: openLibraryDescriptor,
    sourceRecordId: record.sourceRecordId,
    entityLevel: record.entityLevel,
    entityId,
    retrievedAt: record.retrievedAt,
    sourceCoverId: String(coverId),
    url: `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(coverId))}-L.jpg`,
    origin: "Open Library Covers Repository; upstream-image-origin-unknown",
    publicUse: "unknown",
  }));
}

function normalizeAuthorRecord(record) {
  const id = internalSourceId(openLibraryDescriptor.id, "author", record.sourceRecordId);
  const name = normalizeAuthorName(record.payload.name).display ?? null;
  const alternateNames = unique(array(record.payload.alternate_names).map(clean));
  return {
    id,
    entityLevel: "author",
    identifiers: identifiers(record),
    preferredName: field(record, record.payload.name, name),
    alternateNames: field(record, record.payload.alternate_names, alternateNames),
    verificationStatus: "unreviewed",
  };
}

function normalizeWorkRecord(record) {
  const id = internalSourceId(openLibraryDescriptor.id, "work", record.sourceRecordId);
  const title = normalizeTitle(record.payload.title).display ?? null;
  const originalTitle = normalizeTitle(record.payload.original_title).display ?? null;
  const rawAuthors = array(record.payload.authors);
  const authorRefs = unique(rawAuthors.map((entry) => ref(entry?.author ?? entry)).filter(Boolean).map((sourceId) => internalSourceId(openLibraryDescriptor.id, "author", sourceId)));
  const subjects = unique(array(record.payload.subjects).map(clean));
  return {
    id,
    entityLevel: "work",
    identifiers: identifiers(record),
    title: field(record, record.payload.title, title),
    originalTitle: field(record, record.payload.original_title, originalTitle),
    authorRefs: field(record, record.payload.authors, authorRefs),
    importedSubjects: field(record, record.payload.subjects, subjects),
    annotations: annotations(record, id),
    covers: covers(record, id),
    verificationStatus: "unreviewed",
  };
}

function normalizeEditionRecord(record) {
  const id = internalSourceId(openLibraryDescriptor.id, "edition", record.sourceRecordId);
  const rawWorks = array(record.payload.works);
  const workRefs = unique(rawWorks.map(ref).filter(Boolean).map((sourceId) => internalSourceId(openLibraryDescriptor.id, "work", sourceId)));
  const rawAuthors = array(record.payload.authors);
  const authorRefs = unique(rawAuthors.map(ref).filter(Boolean).map((sourceId) => internalSourceId(openLibraryDescriptor.id, "author", sourceId)));
  const rawIsbns = [...array(record.payload.isbn_10), ...array(record.payload.isbn_13)];
  const isbns = rawIsbns.map(normalizeIsbn).map((isbn) => ({ value: isbn.normalized ?? String(isbn.raw ?? ""), type: isbn.type ?? null, valid: isbn.valid }));
  const publishers = unique(array(record.payload.publishers).map(clean));
  const languages = unique(array(record.payload.languages).map(normalizeLanguage));
  const year = normalizePublicationYear(record.payload.publish_date) ?? null;
  const pages = Number.isInteger(record.payload.number_of_pages) && record.payload.number_of_pages > 0 ? record.payload.number_of_pages : null;
  const rawTranslation = record.payload.translation_of ?? record.payload.translated_from;
  const translationSourceId = ref(rawTranslation);
  const translationOf = translationSourceId ? internalSourceId(openLibraryDescriptor.id, "work", translationSourceId) : null;
  return {
    id,
    entityLevel: "edition",
    identifiers: identifiers(record),
    workRefs: field(record, record.payload.works, workRefs),
    title: field(record, record.payload.title, normalizeTitle(record.payload.title).display ?? null),
    authorRefs: field(record, record.payload.authors, authorRefs),
    isbns: field(record, rawIsbns, isbns),
    publishers: field(record, record.payload.publishers, publishers),
    languages: field(record, record.payload.languages, languages),
    publicationYear: field(record, record.payload.publish_date, year),
    pages: field(record, record.payload.number_of_pages, pages),
    translationOf: field(record, rawTranslation, translationOf),
    annotations: annotations(record, id),
    covers: covers(record, id),
    verificationStatus: "unreviewed",
  };
}

export const OpenLibraryAdapter = defineAdapter({
  descriptor: openLibraryDescriptor,
  async read(inputs, { retrievedAt }) {
    const records = [];
    const errors = [];
    for (const input of inputs) await readFileRecords(input, retrievedAt, records, errors);
    return { records, errors };
  },
  normalize(record) {
    if (record.entityLevel === "author") return normalizeAuthorRecord(record);
    if (record.entityLevel === "work") return normalizeWorkRecord(record);
    if (record.entityLevel === "edition") return normalizeEditionRecord(record);
    throw new Error(`Unsupported Open Library entity: ${record.entityLevel}`);
  },
});

