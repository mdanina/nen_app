#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalTitleKey, isValidIsbn, normalizeMatch } from "./pipeline.mjs";

const root = resolve(process.argv[2] ?? "data/import/bnf/staging");
const parseLines = async (path) => (await readFile(path, "utf8")).trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const books = await parseLines(`${root}/books.jsonl`);
const summary = JSON.parse(await readFile(`${root}/reports/summary.json`, "utf8"));
const errors = [];
const seenIds = new Set();
const seenCards = new Set();
const forbidden = ["age", "moods", "nenThemes", "lifeSituations", "whyRecommended", "recommendations", "collections"];

for (const [index, book] of books.entries()) {
  const label = `books.jsonl:${index + 1}`;
  if (!book.id || seenIds.has(book.id)) errors.push(`${label}: missing or duplicate id`);
  seenIds.add(book.id);
  if (!book.title?.trim()) errors.push(`${label}: missing title`);
  if (!book.authors?.length || !book.author?.trim()) errors.push(`${label}: missing author`);
  if (!book.editions?.length) errors.push(`${label}: missing editions`);
  if (book.productionStatus !== "staging-only") errors.push(`${label}: not staging-only`);
  const cardKey = `${canonicalTitleKey(book.title)}|${book.authors.map(normalizeMatch).sort().join("|")}`;
  if (seenCards.has(cardKey)) errors.push(`${label}: duplicate user card`);
  seenCards.add(cardKey);
  for (const key of forbidden) if (key in book) errors.push(`${label}: imported forbidden editorial field ${key}`);
  for (const key of ["title", "authors", "sourceSubjects", "languages", "isbns", "bnfWorkIds", "bnfEditionArks"]) {
    if (!book.provenance?.[key]?.source || !book.provenance[key].retrievedAt || !book.provenance[key].licence) errors.push(`${label}: incomplete provenance for ${key}`);
  }
  if (book.description !== null) {
    if (!book.sourceDescriptions.includes(book.description)) errors.push(`${label}: description differs from source value`);
    if (!book.descriptionProvenance?.textUnmodified || book.descriptionProvenance?.publicUseStatus !== "editorial-review-required") errors.push(`${label}: unsafe description provenance`);
  }
  for (const isbn of book.isbns) if (!isValidIsbn(isbn)) errors.push(`${label}: invalid ISBN ${isbn}`);
}

if (books.length > 3000) errors.push(`catalog exceeds 3000 books: ${books.length}`);
if (summary.counts.stagingBooks !== books.length) errors.push("summary stagingBooks differs from books.jsonl");
const editionCount = books.reduce((count, book) => count + book.editions.length, 0);
const mergedWorkCount = books.reduce((count, book) => count + Math.max(0, book.bnfWorkIds.length - 1), 0);
const multiEditionCount = books.filter((book) => book.editions.length > 1).length;
if (summary.counts.editionsInStaging !== editionCount) errors.push("summary editionsInStaging differs from books.jsonl");
if (summary.counts.editionsCombined !== editionCount - books.length) errors.push("summary editionsCombined differs from books.jsonl");
if (summary.counts.duplicateWorksMerged !== mergedWorkCount) errors.push("summary duplicateWorksMerged differs from books.jsonl");
if (summary.counts.booksWithMultipleEditions !== multiEditionCount) errors.push("summary booksWithMultipleEditions differs from books.jsonl");
if (errors.length) {
  console.error(JSON.stringify({ valid: false, errorCount: errors.length, errors: errors.slice(0, 100) }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ valid: true, books: books.length, uniqueCards: seenCards.size, stagingOnly: true }, null, 2));
}
