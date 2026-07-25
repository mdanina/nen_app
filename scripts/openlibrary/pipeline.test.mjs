import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  PUBLIC_USE,
  findDuplicates,
  isValidIsbn10,
  isValidIsbn13,
  normalizeAuthor,
  normalizeAuthorName,
  normalizeEdition,
  normalizeTitle,
  normalizeWork,
  parseDumpLine,
  runPipeline,
  seededSample,
  isChildSubject,
} from "./pipeline.mjs";

const dumpDate = "2026-07-01";
const line = (type, key, value) => `${type}\t${key}\t1\t2026-07-01T00:00:00.000000\t${JSON.stringify({ key, type: { key: type }, ...value })}`;
const record = (type, key, value) => parseDumpLine(line(type, key, value), 1, "test.txt");
const hash = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

test("validates ISBN-10 and ISBN-13 checksums", () => {
  assert.equal(isValidIsbn10("0306406152"), true);
  assert.equal(isValidIsbn10("0306406153"), false);
  assert.equal(isValidIsbn10("097522980X"), true);
  assert.equal(isValidIsbn13("9780306406157"), true);
  assert.equal(isValidIsbn13("9780306406158"), false);
});

test("normalizes titles without losing the readable original", () => {
  assert.deepEqual(normalizeTitle("  Ёжик  —  герой ! "), { display: "Ёжик-герой!", match: "ежик герой" });
});

test("normalizes author names without changing name order", () => {
  assert.deepEqual(normalizeAuthorName("  Иванов,   Иван  "), { display: "Иванов, Иван", match: "иванов иван" });
});

test("handles missing optional fields", () => {
  const work = normalizeWork(record("/type/work", "/works/OLPILOT1W", { title: "Книга" }), dumpDate);
  assert.equal(work.title, "Книга");
  assert.deepEqual(work.authorIds, []);
  assert.equal(work.childFilter.passed, false);
});

test("recognizes explicit Russian and English child subjects", () => {
  assert.equal(isChildSubject("Книги для детей"), true);
  assert.equal(isChildSubject("Juvenile literature"), true);
  assert.equal(isChildSubject("Literary fiction"), false);
});

test("keeps work, edition, and author as separate entities", () => {
  const work = normalizeWork(record("/type/work", "/works/OLPILOT1W", { title: "Книга", authors: [{ author: { key: "/authors/OLPILOT1A" } }], subjects: ["Juvenile fiction"] }), dumpDate);
  const edition = normalizeEdition(record("/type/edition", "/books/OLPILOT1M", { title: "Книга", works: [{ key: work.workId }], authors: [{ key: "/authors/OLPILOT1A" }] }), dumpDate);
  const author = normalizeAuthor(record("/type/author", "/authors/OLPILOT1A", { name: "Автор" }), dumpDate);
  assert.equal(work.entityLevel, "work");
  assert.equal(edition.entityLevel, "edition");
  assert.equal(author.entityLevel, "author");
  assert.deepEqual(edition.workIds, [work.workId]);
});

test("seeded review sample is reproducible", () => {
  const items = Array.from({ length: 20 }, (_, index) => index);
  assert.deepEqual(seededSample(items, 10, 42), seededSample(items, 10, 42));
  assert.notDeepEqual(seededSample(items, 10, 42), seededSample(items, 10, 43));
});

test("reports probable duplicates without merging them", () => {
  const authors = [normalizeAuthor(record("/type/author", "/authors/OLPILOT1A", { name: "Автор" }), dumpDate)];
  const works = ["1", "2"].map((id) => normalizeWork(record("/type/work", `/works/OLPILOT${id}W`, { title: "Одна книга", authors: [{ author: { key: "/authors/OLPILOT1A" } }], subjects: ["Juvenile fiction"] }), dumpDate));
  const editions = ["1", "2"].map((id) => normalizeEdition(record("/type/edition", `/books/OLPILOT${id}M`, { title: "Одна книга", works: [{ key: works[Number(id) - 1].workId }], isbn_13: ["9780306406157"] }), dumpDate));
  const duplicates = findDuplicates(works, editions, authors);
  assert.equal(duplicates.probableWorkDuplicates.length, 1);
  assert.equal(duplicates.sharedIsbnEditionCandidates.length, 1);
  assert.equal(duplicates.exactEditionDuplicates.length, 0);
  assert.equal(works.length, 2);
});

test("blocks descriptions and cover IDs from automatic publication", () => {
  const work = normalizeWork(record("/type/work", "/works/OLPILOT1W", { title: "Книга", description: "Источник", covers: [123], subjects: ["Juvenile fiction"] }), dumpDate);
  assert.equal(work.restrictedFields.description.publicUse, PUBLIC_USE.blocked);
  assert.equal(work.restrictedFields.coverIds.publicUse, PUBLIC_USE.blocked);
  assert.equal("coverUrl" in work, false);
});

test("pipeline cannot modify the production catalog", async () => {
  const root = resolve(import.meta.dirname, "../..");
  const production = ["data/source/catalog-full.json", "data/source/books-v2.json", "data/generated/books.json"].map((path) => resolve(root, path));
  const before = await Promise.all(production.map(hash));
  const temp = await mkdtemp(join(tmpdir(), "nen-openlibrary-"));
  const input = join(temp, "fragment.txt");
  await writeFile(input, [
    line("/type/author", "/authors/OLPILOT1A", { name: "Автор" }),
    line("/type/work", "/works/OLPILOT1W", { title: "Книга", authors: [{ author: { key: "/authors/OLPILOT1A" } }], subjects: ["Juvenile fiction"] }),
    line("/type/edition", "/books/OLPILOT1M", { title: "Книга", works: [{ key: "/works/OLPILOT1W" }], authors: [{ key: "/authors/OLPILOT1A" }] }),
  ].join("\n"), "utf8");
  await runPipeline({ inputs: [input], output: join(temp, "output"), dumpDate, fixture: true });
  const after = await Promise.all(production.map(hash));
  assert.deepEqual(after, before);
  await rm(temp, { recursive: true, force: true });
});
