import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { createGunzip } from "node:zlib";
import {
  isChildSubject,
  normalizeAuthorName,
  normalizeIsbn,
  normalizeLanguage,
  normalizePublicationYear,
  normalizeTitle,
  parseDumpLine,
} from "./pipeline.mjs";

const SOURCE = "openlibrary";
const LICENSE = {
  code: "openlibrary-rights-not-asserted",
  documentation: "https://openlibrary.org/developers/licensing",
  metadataReuse: "unknown-third-party-rights-may-remain",
  annotationReuse: "unknown",
  coverReuse: "external-display-only-rights-review-required",
};

const array = (value) => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
const unique = (values) => [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
const ref = (value) => typeof value === "string" ? value : value?.key;
const clean = (value) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() || null : value;
const exactDescription = (value) => typeof value === "string" ? value : typeof value?.value === "string" ? value.value : null;
const json = (value) => JSON.stringify(value === undefined ? null : value);
const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");

function createSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS import_runs (
      batch_id TEXT PRIMARY KEY, dump_date TEXT NOT NULL, retrieved_at TEXT NOT NULL,
      started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL, report_json TEXT
    );
    CREATE TABLE IF NOT EXISTS source_records (
      entity_level TEXT NOT NULL, source_id TEXT NOT NULL, revision INTEGER NOT NULL,
      source_modified_at TEXT, payload_hash TEXT NOT NULL, raw_line TEXT NOT NULL,
      retrieved_at TEXT NOT NULL, dump_date TEXT NOT NULL, license_json TEXT NOT NULL,
      PRIMARY KEY (entity_level, source_id)
    );
    CREATE TABLE IF NOT EXISTS authors (
      source_id TEXT PRIMARY KEY, name TEXT, normalized_name TEXT, alternate_names_json TEXT NOT NULL,
      revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS works (
      source_id TEXT PRIMARY KEY, title TEXT, normalized_title TEXT, original_title TEXT,
      author_ids_json TEXT NOT NULL, subjects_json TEXT NOT NULL, explicit_age_json TEXT,
      explicit_moods_json TEXT NOT NULL, description_text TEXT, cover_ids_json TEXT NOT NULL,
      child_candidate INTEGER NOT NULL, merge_key TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS works_merge_key_idx ON works(merge_key);
    CREATE INDEX IF NOT EXISTS works_child_idx ON works(child_candidate);
    CREATE TABLE IF NOT EXISTS editions (
      source_id TEXT PRIMARY KEY, work_ids_json TEXT NOT NULL, title TEXT, author_ids_json TEXT NOT NULL,
      isbns_json TEXT NOT NULL, publishers_json TEXT NOT NULL, languages_json TEXT NOT NULL,
      publication_year INTEGER, pages INTEGER, description_text TEXT, cover_ids_json TEXT NOT NULL,
      revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS affected_works (
      batch_id TEXT NOT NULL, work_id TEXT NOT NULL, PRIMARY KEY(batch_id, work_id)
    );
    CREATE TABLE IF NOT EXISTS work_book_map (
      work_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, merge_key TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS book_aliases (
      old_book_id TEXT NOT NULL, new_book_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(old_book_id, new_book_id)
    );
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, merge_key TEXT UNIQUE NOT NULL, title TEXT NOT NULL, author TEXT,
      short_description TEXT, description TEXT, age_json TEXT, topics_json TEXT NOT NULL,
      moods_json TEXT NOT NULL, work_ids_json TEXT NOT NULL, edition_ids_json TEXT NOT NULL,
      annotation_ids_json TEXT NOT NULL, cover_ids_json TEXT NOT NULL,
      source_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL, production_status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL, entity_level TEXT NOT NULL, source_record_id TEXT NOT NULL,
      text TEXT NOT NULL, source TEXT NOT NULL, retrieved_at TEXT NOT NULL, license_json TEXT NOT NULL,
      origin TEXT, public_use TEXT NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS covers (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL, entity_level TEXT NOT NULL, source_record_id TEXT NOT NULL,
      source_cover_id TEXT NOT NULL, external_url TEXT NOT NULL, source TEXT NOT NULL,
      license_json TEXT NOT NULL, origin TEXT, locally_stored INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS field_provenance (
      book_id TEXT NOT NULL, field_name TEXT NOT NULL, source_record_id TEXT NOT NULL,
      entity_level TEXT NOT NULL, retrieved_at TEXT NOT NULL, license_json TEXT NOT NULL,
      raw_value_json TEXT, normalized_value_json TEXT, verification_status TEXT NOT NULL,
      PRIMARY KEY(book_id, field_name, source_record_id, entity_level),
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);
}

function statements(database) {
  return {
    getSource: database.prepare("SELECT revision, payload_hash FROM source_records WHERE entity_level = ? AND source_id = ?"),
    upsertSource: database.prepare(`INSERT INTO source_records(entity_level,source_id,revision,source_modified_at,payload_hash,raw_line,retrieved_at,dump_date,license_json)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(entity_level,source_id) DO UPDATE SET revision=excluded.revision,source_modified_at=excluded.source_modified_at,payload_hash=excluded.payload_hash,raw_line=excluded.raw_line,retrieved_at=excluded.retrieved_at,dump_date=excluded.dump_date,license_json=excluded.license_json`),
    upsertAuthor: database.prepare(`INSERT INTO authors(source_id,name,normalized_name,alternate_names_json,revision,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,alternate_names_json=excluded.alternate_names_json,revision=excluded.revision,updated_at=excluded.updated_at`),
    upsertWork: database.prepare(`INSERT INTO works(source_id,title,normalized_title,original_title,author_ids_json,subjects_json,explicit_age_json,explicit_moods_json,description_text,cover_ids_json,child_candidate,merge_key,revision,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET title=excluded.title,normalized_title=excluded.normalized_title,original_title=excluded.original_title,author_ids_json=excluded.author_ids_json,subjects_json=excluded.subjects_json,explicit_age_json=excluded.explicit_age_json,explicit_moods_json=excluded.explicit_moods_json,description_text=excluded.description_text,cover_ids_json=excluded.cover_ids_json,child_candidate=excluded.child_candidate,merge_key=excluded.merge_key,revision=excluded.revision,updated_at=excluded.updated_at`),
    upsertEdition: database.prepare(`INSERT INTO editions(source_id,work_ids_json,title,author_ids_json,isbns_json,publishers_json,languages_json,publication_year,pages,description_text,cover_ids_json,revision,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET work_ids_json=excluded.work_ids_json,title=excluded.title,author_ids_json=excluded.author_ids_json,isbns_json=excluded.isbns_json,publishers_json=excluded.publishers_json,languages_json=excluded.languages_json,publication_year=excluded.publication_year,pages=excluded.pages,description_text=excluded.description_text,cover_ids_json=excluded.cover_ids_json,revision=excluded.revision,updated_at=excluded.updated_at`),
    affect: database.prepare("INSERT OR IGNORE INTO affected_works(batch_id, work_id) VALUES(?,?)"),
  };
}

function workMergeKey(titleMatch, authorIds, sourceId) {
  if (!titleMatch || !authorIds.length) return `source:${sourceId}`;
  return `title-author:${titleMatch}|${[...authorIds].sort().join("|")}`;
}

function normalizedAuthor(record) {
  const name = normalizeAuthorName(record.value.name);
  return { name: name.display ?? null, normalizedName: name.match ?? null, alternateNames: unique(array(record.value.alternate_names).map(clean)) };
}

function normalizedWork(record) {
  const title = normalizeTitle(record.value.title);
  const authorIds = unique(array(record.value.authors).map((entry) => ref(entry?.author ?? entry)).filter(Boolean));
  const subjects = unique(array(record.value.subjects).map(clean));
  const moods = unique(array(record.value.moods).map(clean));
  return {
    title: title.display ?? null,
    normalizedTitle: title.match ?? null,
    originalTitle: normalizeTitle(record.value.original_title).display ?? null,
    authorIds,
    subjects,
    explicitAge: record.value.age ?? record.value.ages ?? null,
    explicitMoods: moods,
    description: exactDescription(record.value.description),
    coverIds: unique(array(record.value.covers).filter((value) => Number.isFinite(value) || typeof value === "string")),
    childCandidate: subjects.some(isChildSubject),
    mergeKey: workMergeKey(title.match, authorIds, record.key),
  };
}

function normalizedEdition(record) {
  const workIds = unique(array(record.value.works).map(ref).filter(Boolean));
  const authorIds = unique(array(record.value.authors).map(ref).filter(Boolean));
  const rawIsbns = [...array(record.value.isbn_10), ...array(record.value.isbn_13)];
  return {
    workIds,
    title: normalizeTitle(record.value.title).display ?? null,
    authorIds,
    isbns: rawIsbns.map(normalizeIsbn).map((entry) => ({ raw: entry.raw, value: entry.normalized ?? null, type: entry.type ?? null, valid: entry.valid })),
    publishers: unique(array(record.value.publishers).map(clean)),
    languages: unique(array(record.value.languages).map(normalizeLanguage)),
    publicationYear: normalizePublicationYear(record.value.publish_date) ?? null,
    pages: Number.isInteger(record.value.number_of_pages) && record.value.number_of_pages > 0 ? record.value.number_of_pages : null,
    description: exactDescription(record.value.description),
    coverIds: unique(array(record.value.covers).filter((value) => Number.isFinite(value) || typeof value === "string")),
  };
}

function importRecord(record, context) {
  const { database, sql, batchId, dumpDate, retrievedAt, counters } = context;
  const payloadJson = JSON.stringify(record.value);
  const payloadHash = sha(payloadJson);
  const existing = sql.getSource.get(record.entityLevel, record.key);
  if (existing && Number(existing.revision) > Number(record.revision)) { counters.older += 1; return; }
  if (existing && Number(existing.revision) === Number(record.revision) && existing.payload_hash === payloadHash) { counters.unchanged += 1; return; }
  const state = existing ? "updated" : "inserted";
  counters[state] += 1;
  counters.byEntity[record.entityLevel][state] += 1;
  sql.upsertSource.run(record.entityLevel, record.key, Number(record.revision) || 0, record.lastModified, payloadHash, record.rawLine, retrievedAt, dumpDate, json(LICENSE));
  if (record.entityLevel === "author") {
    const author = normalizedAuthor(record);
    sql.upsertAuthor.run(record.key, author.name, author.normalizedName, json(author.alternateNames), Number(record.revision) || 0, retrievedAt);
    for (const row of database.prepare("SELECT source_id FROM works WHERE EXISTS (SELECT 1 FROM json_each(author_ids_json) WHERE value = ?)").iterate(record.key)) sql.affect.run(batchId, row.source_id);
  } else if (record.entityLevel === "work") {
    const work = normalizedWork(record);
    sql.upsertWork.run(record.key, work.title, work.normalizedTitle, work.originalTitle, json(work.authorIds), json(work.subjects), json(work.explicitAge), json(work.explicitMoods), work.description, json(work.coverIds), work.childCandidate ? 1 : 0, work.mergeKey, Number(record.revision) || 0, retrievedAt);
    sql.affect.run(batchId, record.key);
  } else if (record.entityLevel === "edition") {
    const edition = normalizedEdition(record);
    sql.upsertEdition.run(record.key, json(edition.workIds), edition.title, json(edition.authorIds), json(edition.isbns), json(edition.publishers), json(edition.languages), edition.publicationYear, edition.pages, edition.description, json(edition.coverIds), Number(record.revision) || 0, retrievedAt);
    for (const workId of edition.workIds) sql.affect.run(batchId, workId);
  }
}

async function importFile(path, context, batchSize) {
  const stream = createReadStream(path);
  const input = path.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
  const reader = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  let inTransaction = false;
  const begin = () => { if (!inTransaction) { context.database.exec("BEGIN"); inTransaction = true; } };
  const commit = () => { if (inTransaction) { context.database.exec("COMMIT"); inTransaction = false; } };
  begin();
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) continue;
      context.counters.processed += 1;
      try {
        const record = parseDumpLine(line, lineNumber, basename(path));
        if (record) importRecord(record, context);
      } catch (error) {
        context.counters.errors += 1;
        if (context.counters.errorExamples.length < 100) context.counters.errorExamples.push({ file: basename(path), line: lineNumber, message: error.message });
      }
      if (lineNumber % batchSize === 0) { commit(); begin(); }
    }
    commit();
  } catch (error) {
    if (inTransaction) context.database.exec("ROLLBACK");
    throw error;
  }
}

function allEditionsForWorks(database, workIds) {
  if (!workIds.length) return [];
  const editions = new Map();
  const query = database.prepare("SELECT * FROM editions WHERE EXISTS (SELECT 1 FROM json_each(work_ids_json) WHERE value = ?)");
  for (const workId of workIds) for (const edition of query.iterate(workId)) editions.set(edition.source_id, edition);
  return [...editions.values()];
}

function provenance(database, bookId, fieldName, sourceRecordId, entityLevel, retrievedAt, rawValue, normalizedValue) {
  database.prepare(`INSERT OR REPLACE INTO field_provenance(book_id,field_name,source_record_id,entity_level,retrieved_at,license_json,raw_value_json,normalized_value_json,verification_status)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(bookId, fieldName, sourceRecordId, entityLevel, retrievedAt, json(LICENSE), json(rawValue), json(normalizedValue), "unreviewed");
}

function rebuildBook(database, workId, retrievedAt) {
  const seedWork = database.prepare("SELECT * FROM works WHERE source_id = ?").get(workId);
  if (!seedWork || !seedWork.child_candidate) {
    database.prepare("DELETE FROM work_book_map WHERE work_id = ?").run(workId);
    return { rebuilt: false, reason: "not-child-candidate" };
  }
  const works = [...database.prepare("SELECT * FROM works WHERE child_candidate = 1 AND merge_key = ? ORDER BY source_id").iterate(seedWork.merge_key)];
  const workIds = works.map((work) => work.source_id);
  const editions = allEditionsForWorks(database, workIds);
  const bookId = `book:${sha(seedWork.merge_key).slice(0, 24)}`;
  const oldMappings = works.map((work) => database.prepare("SELECT book_id FROM work_book_map WHERE work_id = ?").get(work.source_id)?.book_id).filter(Boolean);
  for (const oldId of unique(oldMappings).filter((id) => id !== bookId)) database.prepare("INSERT OR IGNORE INTO book_aliases(old_book_id,new_book_id,reason,created_at) VALUES(?,?,?,?)").run(oldId, bookId, "canonical-key-changed", retrievedAt);
  const preferredWork = works.find((work) => work.description_text) ?? works[0];
  const authorIds = unique(works.flatMap((work) => parseJson(work.author_ids_json, [])));
  const authorNames = authorIds.map((id) => database.prepare("SELECT name FROM authors WHERE source_id = ?").get(id)?.name).filter(Boolean);
  const topics = unique(works.flatMap((work) => parseJson(work.subjects_json, [])));
  const moods = unique(works.flatMap((work) => parseJson(work.explicit_moods_json, [])));
  const explicitAges = works.map((work) => parseJson(work.explicit_age_json, null)).filter((value) => value !== null);
  const age = explicitAges.length ? explicitAges[0] : null;
  const shortDescription = works.map((work) => {
    const source = database.prepare("SELECT raw_line FROM source_records WHERE entity_level='work' AND source_id=?").get(work.source_id);
    if (!source) return null;
    try { return JSON.parse(source.raw_line.split("\t").slice(4).join("\t")).short_description ?? null; } catch { return null; }
  }).find(Boolean) ?? null;
  const descriptions = [
    ...works.filter((work) => work.description_text !== null).map((work) => ({ entityLevel: "work", sourceId: work.source_id, text: work.description_text })),
    ...editions.filter((edition) => edition.description_text !== null).map((edition) => ({ entityLevel: "edition", sourceId: edition.source_id, text: edition.description_text })),
  ];
  const coverEntries = [
    ...works.flatMap((work) => parseJson(work.cover_ids_json, []).map((coverId) => ({ entityLevel: "work", sourceId: work.source_id, coverId }))),
    ...editions.flatMap((edition) => parseJson(edition.cover_ids_json, []).map((coverId) => ({ entityLevel: "edition", sourceId: edition.source_id, coverId }))),
  ];
  const annotationIds = descriptions.map((entry) => `annotation:${sha(`${entry.entityLevel}:${entry.sourceId}:${entry.text}`).slice(0, 24)}`);
  const coverIds = coverEntries.map((entry) => `cover:${sha(`${entry.entityLevel}:${entry.sourceId}:${entry.coverId}`).slice(0, 24)}`);
  const sourceIds = unique([...workIds, ...editions.map((edition) => edition.source_id), ...authorIds]);
  database.prepare(`INSERT INTO books(id,merge_key,title,author,short_description,description,age_json,topics_json,moods_json,work_ids_json,edition_ids_json,annotation_ids_json,cover_ids_json,source_ids_json,updated_at,production_status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET merge_key=excluded.merge_key,title=excluded.title,author=excluded.author,short_description=excluded.short_description,description=excluded.description,age_json=excluded.age_json,topics_json=excluded.topics_json,moods_json=excluded.moods_json,work_ids_json=excluded.work_ids_json,edition_ids_json=excluded.edition_ids_json,annotation_ids_json=excluded.annotation_ids_json,cover_ids_json=excluded.cover_ids_json,source_ids_json=excluded.source_ids_json,updated_at=excluded.updated_at,production_status=excluded.production_status`)
    .run(bookId, seedWork.merge_key, preferredWork.title, authorNames.join("; ") || null, shortDescription, descriptions[0]?.text ?? null, json(age), json(topics), json(moods), json(workIds), json(editions.map((edition) => edition.source_id)), json(annotationIds), json(coverIds), json(sourceIds), retrievedAt, "staging-only");
  database.prepare("DELETE FROM annotations WHERE book_id = ?").run(bookId);
  descriptions.forEach((entry, index) => database.prepare(`INSERT INTO annotations(id,book_id,entity_level,source_record_id,text,source,retrieved_at,license_json,origin,public_use)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(annotationIds[index], bookId, entry.entityLevel, entry.sourceId, entry.text, SOURCE, retrievedAt, json(LICENSE), "Open Library record; upstream origin unknown", "unknown"));
  database.prepare("DELETE FROM covers WHERE book_id = ?").run(bookId);
  coverEntries.forEach((entry, index) => database.prepare(`INSERT INTO covers(id,book_id,entity_level,source_record_id,source_cover_id,external_url,source,license_json,origin,locally_stored)
    VALUES(?,?,?,?,?,?,?,?,?,0)`).run(coverIds[index], bookId, entry.entityLevel, entry.sourceId, String(entry.coverId), `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(entry.coverId))}-L.jpg`, SOURCE, json(LICENSE), "Open Library Covers Repository; upstream origin unknown"));
  database.prepare("DELETE FROM field_provenance WHERE book_id = ?").run(bookId);
  provenance(database, bookId, "title", preferredWork.source_id, "work", retrievedAt, preferredWork.title, preferredWork.title);
  provenance(database, bookId, "author", preferredWork.source_id, "work", retrievedAt, authorIds, authorNames);
  provenance(database, bookId, "shortDescription", preferredWork.source_id, "work", retrievedAt, shortDescription, shortDescription);
  provenance(database, bookId, "description", preferredWork.source_id, "work", retrievedAt, preferredWork.description_text, descriptions[0]?.text ?? null);
  provenance(database, bookId, "age", preferredWork.source_id, "work", retrievedAt, explicitAges, age);
  provenance(database, bookId, "sourceSubjects", preferredWork.source_id, "work", retrievedAt, works.map((work) => parseJson(work.subjects_json, [])), topics);
  provenance(database, bookId, "moods", preferredWork.source_id, "work", retrievedAt, works.map((work) => parseJson(work.explicit_moods_json, [])), moods);
  for (const work of works) database.prepare(`INSERT INTO work_book_map(work_id,book_id,merge_key,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(work_id) DO UPDATE SET book_id=excluded.book_id,merge_key=excluded.merge_key,updated_at=excluded.updated_at`).run(work.source_id, bookId, seedWork.merge_key, retrievedAt);
  return { rebuilt: true, bookId, workCount: works.length, editionCount: editions.length };
}

function reconcile(database, batchId, retrievedAt) {
  const rebuiltBooks = new Set();
  let affected = 0;
  database.exec("BEGIN");
  try {
    for (const row of database.prepare("SELECT work_id FROM affected_works WHERE batch_id = ? ORDER BY work_id").iterate(batchId)) {
      affected += 1;
      const result = rebuildBook(database, row.work_id, retrievedAt);
      if (result.rebuilt) rebuiltBooks.add(result.bookId);
    }
    database.prepare("DELETE FROM affected_works WHERE batch_id = ?").run(batchId);
    database.exec("DELETE FROM books WHERE id NOT IN (SELECT DISTINCT book_id FROM work_book_map)");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { affectedWorks: affected, rebuiltBooks: rebuiltBooks.size };
}

async function writeRows(path, iterator, transform) {
  const stream = createWriteStream(path, { encoding: "utf8" });
  for (const row of iterator) if (!stream.write(`${JSON.stringify(transform(row))}\n`)) await once(stream, "drain");
  stream.end();
  await once(stream, "finish");
}

async function exportStaging(database, output, report) {
  await mkdir(output, { recursive: true });
  await writeRows(join(output, "books.jsonl"), database.prepare("SELECT * FROM books ORDER BY id").iterate(), (row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    shortDescription: row.short_description,
    description: row.description,
    age: parseJson(row.age_json, null),
    themes: [],
    moods: parseJson(row.moods_json, []),
    internal: {
      sourceSubjects: parseJson(row.topics_json, []),
      workIds: parseJson(row.work_ids_json, []),
      editionIds: parseJson(row.edition_ids_json, []),
      annotationIds: parseJson(row.annotation_ids_json, []),
      coverIds: parseJson(row.cover_ids_json, []),
      sourceIds: parseJson(row.source_ids_json, []),
      productionStatus: row.production_status,
    },
  }));
  await writeRows(join(output, "editions.jsonl"), database.prepare("SELECT * FROM editions ORDER BY source_id").iterate(), (row) => ({ ...row, work_ids: parseJson(row.work_ids_json, []), author_ids: parseJson(row.author_ids_json, []), isbns: parseJson(row.isbns_json, []), publishers: parseJson(row.publishers_json, []), languages: parseJson(row.languages_json, []), cover_ids: parseJson(row.cover_ids_json, []) }));
  await writeRows(join(output, "annotations.jsonl"), database.prepare("SELECT * FROM annotations ORDER BY id").iterate(), (row) => ({ ...row, license: parseJson(row.license_json, {}) }));
  await writeRows(join(output, "covers.jsonl"), database.prepare("SELECT * FROM covers ORDER BY id").iterate(), (row) => ({ ...row, license: parseJson(row.license_json, {}) }));
  await writeRows(join(output, "provenance.jsonl"), database.prepare("SELECT * FROM field_provenance ORDER BY book_id, field_name").iterate(), (row) => ({ ...row, license: parseJson(row.license_json, {}), rawValue: parseJson(row.raw_value_json, null), normalizedValue: parseJson(row.normalized_value_json, null) }));
  await writeRows(join(output, "aliases.jsonl"), database.prepare("SELECT * FROM book_aliases ORDER BY old_book_id").iterate(), (row) => row);
  await writeJson(join(output, "report.json"), report);
}

async function writeJson(path, value) {
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.end(`${JSON.stringify(value, null, 2)}\n`);
  await once(stream, "finish");
}

export async function runMassImport({ inputs, databasePath, output, dumpDate, retrievedAt, batchId, batchSize = 5000 }) {
  if (!inputs?.length) throw new Error("At least one official dump or dump fragment is required");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dumpDate ?? "")) throw new Error("dumpDate must use YYYY-MM-DD");
  if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) throw new Error("retrievedAt must be an ISO timestamp");
  await mkdir(dirname(resolve(databasePath)), { recursive: true });
  const database = new DatabaseSync(resolve(databasePath));
  createSchema(database);
  const sql = statements(database);
  const counters = { processed: 0, inserted: 0, updated: 0, unchanged: 0, older: 0, errors: 0, errorExamples: [], byEntity: { author: { inserted: 0, updated: 0 }, work: { inserted: 0, updated: 0 }, edition: { inserted: 0, updated: 0 } } };
  const startedAt = new Date().toISOString();
  database.prepare("INSERT OR REPLACE INTO import_runs(batch_id,dump_date,retrieved_at,started_at,status) VALUES(?,?,?,?,?)").run(batchId, dumpDate, retrievedAt, startedAt, "running");
  try {
    const context = { database, sql, batchId, dumpDate, retrievedAt, counters };
    for (const input of inputs.map((input) => resolve(input))) await importFile(input, context, Math.max(1, Number(batchSize) || 5000));
    const reconciliation = reconcile(database, batchId, retrievedAt);
    const counts = {
      sourceRecords: database.prepare("SELECT COUNT(*) AS count FROM source_records").get().count,
      authors: database.prepare("SELECT COUNT(*) AS count FROM authors").get().count,
      works: database.prepare("SELECT COUNT(*) AS count FROM works").get().count,
      editions: database.prepare("SELECT COUNT(*) AS count FROM editions").get().count,
      childBooks: database.prepare("SELECT COUNT(*) AS count FROM books").get().count,
      annotations: database.prepare("SELECT COUNT(*) AS count FROM annotations").get().count,
      covers: database.prepare("SELECT COUNT(*) AS count FROM covers").get().count,
    };
    const report = { batchId, dumpDate, retrievedAt, source: SOURCE, license: LICENSE, inputs: inputs.map((input) => basename(input)), counters, reconciliation, counts, productionIntegration: false };
    database.prepare("UPDATE import_runs SET completed_at=?,status='completed',report_json=? WHERE batch_id=?").run(new Date().toISOString(), json(report), batchId);
    await exportStaging(database, resolve(output), report);
    database.close();
    return report;
  } catch (error) {
    database.prepare("UPDATE import_runs SET completed_at=?,status='failed',report_json=? WHERE batch_id=?").run(new Date().toISOString(), json({ error: error.message }), batchId);
    database.close();
    throw error;
  }
}
