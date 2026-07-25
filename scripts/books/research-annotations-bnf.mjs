import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BNF_LICENSE, cleanAuthor, cleanTitle, extractIsbns, normalizeMatch, parseSruDublinCore } from "../bnf/pipeline.mjs";

const root = resolve(import.meta.dirname, "../..");
const catalog = JSON.parse(await readFile(resolve(root, "data/generated/books.json"), "utf8"));
const output = resolve(root, "data/reports/annotation-source-research.json");
const endpoint = "https://catalogue.bnf.fr/api/SRU";
const retrievedAt = new Date().toISOString();
const template = /^«.+» относится к жанру «.+»\. В центре внимания — .+\.$/u;
const candidates = catalog.filter((book) => book.id.startsWith("ol-") && template.test(book.shortDescription ?? ""));

function compact(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function isTechnicalDescription(value) {
  return /^(?:collection|contient|comprend|extrait|reprod|traduit de|la couv|titre de couv|publication en série|isbn|notice|texte imprimé)\b/iu.test(compact(value));
}

function titleMatches(book, record) {
  const expected = normalizeMatch(book.title);
  return record.titles.some((title) => {
    const actual = normalizeMatch(cleanTitle(title));
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  });
}

function authorMatches(book, record) {
  const expected = normalizeMatch(book.author).split(" ").filter((part) => part.length > 2);
  const actual = record.creators.map(cleanAuthor).map(normalizeMatch).join(" ");
  return expected.some((part) => actual.includes(part));
}

function makeUrl(query, maximumRecords = 50) {
  const url = new URL(endpoint);
  url.searchParams.set("version", "1.2");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("recordSchema", "dublincore");
  url.searchParams.set("maximumRecords", String(maximumRecords));
  url.searchParams.set("query", query);
  return url;
}

async function fetchRecords(query, maximumRecords) {
  const response = await fetch(makeUrl(query, maximumRecords), {
    headers: { Accept: "application/xml,text/xml", "User-Agent": "NEN-Books/1.0 (annotation source verification)" },
  });
  if (!response.ok) throw new Error(`BnF SRU ${response.status}: ${response.statusText}`);
  return parseSruDublinCore(await response.text());
}

const byId = new Map(candidates.map((book) => [book.id, {
  id: book.id,
  title: book.title,
  author: book.author,
  status: "not_found",
  queries: [],
  matches: [],
}]));
const byIsbn = new Map();
for (const book of candidates) {
  for (const isbn of book.sourceMetadata?.isbns ?? []) {
    if (!byIsbn.has(isbn)) byIsbn.set(isbn, []);
    byIsbn.get(isbn).push(book);
  }
}

const isbns = [...byIsbn.keys()];
for (let index = 0; index < isbns.length; index += 12) {
  const batch = isbns.slice(index, index + 12);
  const query = `bib.isbn any "${batch.join(" ")}"`;
  const records = await fetchRecords(query, 50);
  for (const record of records) {
    const recordIsbns = extractIsbns(record.identifiers);
    for (const isbn of recordIsbns) {
      for (const book of byIsbn.get(isbn) ?? []) {
        const report = byId.get(book.id);
        report.queries.push({ kind: "isbn", value: isbn });
        if (!titleMatches(book, record) || !authorMatches(book, record)) continue;
        const descriptions = record.descriptions.filter((value) => !isTechnicalDescription(value) && compact(value).length >= 40);
        if (!descriptions.length) continue;
        report.status = "matched";
        report.matches.push({
          source: "bnf-sru",
          recordId: record.recordId,
          title: record.titles,
          creators: record.creators,
          descriptions,
          identifiers: record.identifiers,
          retrievedAt,
          licence: BNF_LICENSE,
          matchEvidence: ["isbn", "normalized_title", "author_name"],
        });
      }
    }
  }
}

for (const book of candidates.filter((item) => !(item.sourceMetadata?.isbns?.length))) {
  const title = compact(book.title).replace(/"/gu, " ");
  const author = compact(book.author).replace(/"/gu, " ");
  const query = `(bib.title all "${title}") and (bib.author all "${author}")`;
  const report = byId.get(book.id);
  report.queries.push({ kind: "title_author", value: `${title} | ${author}` });
  const records = await fetchRecords(query, 10);
  for (const record of records) {
    if (!titleMatches(book, record) || !authorMatches(book, record)) continue;
    const descriptions = record.descriptions.filter((value) => !isTechnicalDescription(value) && compact(value).length >= 40);
    if (!descriptions.length) continue;
    report.status = "matched";
    report.matches.push({
      source: "bnf-sru",
      recordId: record.recordId,
      title: record.titles,
      creators: record.creators,
      descriptions,
      identifiers: record.identifiers,
      retrievedAt,
      licence: BNF_LICENSE,
      matchEvidence: ["normalized_title", "author_name"],
    });
  }
}

const items = [...byId.values()];
const report = {
  generatedAt: retrievedAt,
  source: "BnF Catalogue général SRU",
  sourceDocumentation: "https://api.bnf.fr/fr/api-sru-catalogue-general",
  licence: BNF_LICENSE,
  candidates: candidates.length,
  matched: items.filter((item) => item.status === "matched").length,
  notFound: items.filter((item) => item.status !== "matched").length,
  items,
};
await mkdir(resolve(root, "data/reports"), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ candidates: report.candidates, matched: report.matched, notFound: report.notFound }, null, 2));
