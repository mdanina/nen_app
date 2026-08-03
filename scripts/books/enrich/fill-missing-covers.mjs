#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runEnrichment } from "./pipeline.mjs";

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
const before = await readJson(resolve(root, "data/generated/books.json"), []);
const beforeMissing = before.filter((book) => book.cover?.kind !== "external").length;
const passes = [];

for (let pass = 1; pass <= 6; pass += 1) {
  const matchLevel = Math.min(pass, 3);
  const result = await runEnrichment({ root, force: true, missingCoverOnly: true, matchLevel, sources: ["official-publishers"] });
  passes.push({ pass, matchLevel, ...result.summary, failureReasons: result.failureReasons });
  if (pass >= 3 && result.summary.officialCoversFound === 0) break;
}

const catalog = await readJson(resolve(root, "data/generated/books.json"), []);
const remaining = catalog.filter((book) => book.cover?.kind !== "external");
const lastPass = passes.at(-1);
const report = {
  generatedAt: new Date().toISOString(),
  beforeMissing,
  coversAdded: beforeMissing - remaining.length,
  remainingMissing: remaining.length,
  passes,
  finalFailureReasons: lastPass?.failureReasons ?? {},
  remainingByPublisher: countBy(remaining, (book) => book.publisher || "publisher_missing"),
  remaining: remaining.map((book) => ({ id: book.id, title: book.title, author: book.author, publisher: book.publisher, isbn13: book.isbn13 })),
};
await writeJsonAtomic(resolve(root, "data/reports/books-cover-saturation.json"), report);
console.log(JSON.stringify({ coversAdded: report.coversAdded, remainingMissing: report.remainingMissing, passes: report.passes }, null, 2));
