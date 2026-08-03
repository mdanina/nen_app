#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runEnrichment } from "./pipeline.mjs";
import { normalizePublisherName } from "./publisher-normalization.mjs";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

const root = resolve(import.meta.dirname, "../../..");
const publisherKeys = ["mif", "pink-giraffe", "young-guard", "melik-pashaev", "ast-full"];
const before = await readJson(resolve(root, "data/generated/books.json"), []);
const beforeMissing = before.filter((book) => book.cover?.kind !== "external").length;
const previousSaturation = await readJson(resolve(root, "data/reports/books-cover-saturation.json"), {});
const stageBaselineMissing = previousSaturation.remainingMissing ?? beforeMissing;
const passes = [];

for (const matchLevel of [1, 2, 3]) {
  const result = await runEnrichment({
    root, force: true, missingCoverOnly: true, matchLevel,
    sources: ["official-publishers"], publisherKeys,
  });
  passes.push({ matchLevel, ...result.summary, failureReasons: result.failureReasons, sourceStatus: result.sourceStatus });
  if (matchLevel > 1 && result.summary.officialCoversFound === 0) break;
}

const catalog = await readJson(resolve(root, "data/generated/books.json"), []);
const remaining = catalog.filter((book) => book.cover?.kind !== "external");
const lastPass = passes.at(-1);
const connectedPublishers = new Set([
  "МИФ.Детство", "Розовый жираф", "Молодая гвардия", "Мелик-Пашаев", "АСТ",
  "Азбука-Аттикус", "Эксмо", "Росмэн", "Детская литература", "Стрекоза",
  "Самокат", "Поляндрия", "Белая ворона", "КомпасГид", "Clever", "Архипелаг", "Альпина.Дети",
]);
const reasonFor = (book) => {
  if (!book.publisher || /^\d+$/u.test(String(book.publisher))) return "publisher_missing_or_invalid";
  if (connectedPublishers.has(normalizePublisherName(book.publisher))) return "official_catalog_has_no_verified_title_author_match";
  if (/^[\x00-\x7F\p{M}\s.,'’()\-]+$/u.test(book.publisher)) return "legacy_or_transliterated_publisher_metadata";
  return "new_official_publisher_source_required";
};
const remainingReasonCounts = countBy(remaining, reasonFor);
const report = {
  generatedAt: new Date().toISOString(),
  addedPublisherAdapters: publisherKeys,
  beforeMissing: stageBaselineMissing,
  resumedFromMissing: beforeMissing,
  coversAdded: stageBaselineMissing - remaining.length,
  remainingMissing: remaining.length,
  passes,
  finalFailureReasons: lastPass?.failureReasons ?? {},
  remainingReasonCounts,
  remainingReasonAutomation: {
    publisher_missing_or_invalid: "Автоматически устранимо после подключения авторитетного библиографического источника, определяющего современное издание.",
    official_catalog_has_no_verified_title_author_match: "Текущие официальные каталоги исчерпаны; нужен архив издателя, правообладатель или ручное подтверждение издания.",
    legacy_or_transliterated_publisher_metadata: "Автоматически устранимо после нормализации через национальный библиотечный или ISBN-источник.",
    new_official_publisher_source_required: "Требуется адаптер официального каталога указанного издательства или правообладателя.",
  },
  remainingByPublisher: countBy(remaining, (book) => book.publisher || "publisher_missing"),
  remaining: remaining.map((book) => ({ id: book.id, title: book.title, author: book.author, publisher: book.publisher, isbn13: book.isbn13 })),
};
await writeJsonAtomic(resolve(root, "data/reports/books-additional-cover-saturation.json"), report);
console.log(JSON.stringify({ coversAdded: report.coversAdded, remainingMissing: report.remainingMissing, passes: report.passes }, null, 2));
