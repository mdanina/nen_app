import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const catalogPath = resolve(root, "data/generated/books.json");
const overridesPath = resolve(root, "data/source/official-metadata-overrides.json");
const reportPath = resolve(root, "data/reports/placeholder-metadata-audit.json");
const verifiedAt = new Date().toISOString().slice(0, 10);
const sourceName = "Национальная электронная библиотека";

function decode(value = "") {
  return String(value)
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(?:nbsp|#160);/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&apos;/giu, "'")
    .replace(/&laquo;/giu, "«")
    .replace(/&raquo;/giu, "»");
}

function text(value = "") {
  return decode(String(value).replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function normalize(value = "") {
  return text(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ru")
    .replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

const ignored = new Set(["книга", "сказки", "рассказы", "повести", "роман", "стихи", "сборник", "для", "детей"]);
function titleTokens(value = "") {
  return normalize(value).split(" ").filter((token) => token.length >= 3 && !ignored.has(token));
}

function titleScore(left, right) {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (rightNormalized.includes(leftNormalized) || leftNormalized.includes(rightNormalized)) return 1;
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / Math.max(1, leftTokens.size);
}

function authorSurnames(value = "") {
  return String(value).split(/\s*;\s*/u)
    .map((author) => normalize(author).split(" ").filter((token) => token.length >= 3).at(-1))
    .filter(Boolean);
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return decode(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=['"]${escaped}['"][^>]+content=['"]([^'"]+)['"]`, "iu"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=['"]([^'"]+)['"][^>]+(?:property|name)=['"]${escaped}['"]`, "iu"))?.[1]
    ?? "",
  ).trim();
}

function field(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const row = html.match(new RegExp(
    `<div[^>]+cards-table__left[^>]*>\\s*${escaped}\\s*<\\/div>\\s*<div[^>]+cards-table__right[^>]*>([\\s\\S]*?)<\\/div>`,
    "iu",
  ))?.[1];
  return text(row ?? "");
}

function parseNumber(value = "") {
  const number = Number(String(value).match(/\d{1,4}/u)?.[0]);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseIsbn(value = "") {
  const isbn = String(value).replace(/\D/gu, "");
  return /^97[89]\d{10}$/u.test(isbn) ? isbn : undefined;
}

function parseRecord(html, url) {
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? meta(html, "og:title"));
  const authors = [...new Set([...html.matchAll(/<span[^>]+itemprop=['"]author['"][^>]*>([\s\S]*?)<\/span>/giu)]
    .map((match) => text(match[1])).filter(Boolean))];
  const isbn13 = parseIsbn(meta(html, "book:isbn") || field(html, "ISBN"));
  const languageLabel = field(html, "Язык");
  return {
    source: sourceName,
    sourceUrl: url,
    sourceRecordId: decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? ""),
    officialTitle: title,
    officialAuthors: authors,
    publisher: field(html, "Издательство") || undefined,
    publicationYear: parseNumber(field(html, "Год издания")),
    pages: parseNumber(field(html, "Объем")),
    seriesName: field(html, "Серия") || undefined,
    isbn13,
    language: /^рус/iu.test(languageLabel) ? "ru" : languageLabel || undefined,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "NEN placeholder metadata audit/1.0", accept: "text/html" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index], index);
    }
  }));
  return result;
}

function searchQuery(book) {
  const stopWords = new Set(["и", "или", "в", "во", "на", "о", "об", "про", "для", "с", "со", "из"]);
  return normalize(book.title).split(" ").filter((token) => token.length >= 2 && !stopWords.has(token)).join(" ");
}

function recordMatch(book, record) {
  const compactIsbn = book.isbn13 ? String(book.isbn13).replace(/\D/gu, "") : "";
  const isbnExact = Boolean(compactIsbn && record.isbn13 === compactIsbn);
  const score = Math.max(
    titleScore(book.title, record.officialTitle),
    titleScore(book.originalTitle, record.officialTitle),
  );
  const officialAuthors = normalize(record.officialAuthors.join(" "));
  const authorMatch = authorSurnames(book.author).some((surname) => officialAuthors.includes(surname));
  const accepted = isbnExact || (score >= 0.78 && authorMatch);
  return {
    accepted,
    strategy: isbnExact ? "exact_isbn" : "title_author",
    confidence: isbnExact ? 1 : Math.min(0.99, 0.70 + score * 0.2 + (authorMatch ? 0.09 : 0)),
    titleScore: score,
    authorMatch,
    isbnExact,
  };
}

const [catalog, existingOverrides] = await Promise.all([
  readFile(catalogPath, "utf8").then(JSON.parse),
  readFile(overridesPath, "utf8").then(JSON.parse),
]);
const missing = catalog.filter((book) => book.cover?.kind !== "external");
const searches = await mapLimit(missing, 5, async (book, index) => {
  const url = `https://rusneb.ru/search/?q=${encodeURIComponent(searchQuery(book))}`;
  try {
    const html = await fetchText(url);
    const links = [...new Set([...html.matchAll(/href=["']([^"']*\/catalog\/[^"']+)["']/giu)]
      .map((match) => new URL(decode(match[1]), url).href))].slice(0, 3);
    if ((index + 1) % 50 === 0) console.log(`Поиск НЭБ: ${index + 1}/${missing.length}`);
    return { book, searchUrl: url, links };
  } catch (error) {
    return { book, searchUrl: url, links: [], error: String(error) };
  }
});

const recordUrls = [...new Set(searches.flatMap((item) => item.links))];
const recordPages = new Map(await mapLimit(recordUrls, 6, async (url) => {
  try { return [url, parseRecord(await fetchText(url), url)]; }
  catch (error) { return [url, { sourceUrl: url, error: String(error) }]; }
}));

const currentIsbnOwners = new Map(catalog.filter((book) => book.isbn13).map((book) => [book.isbn13, book.id]));
const accepted = [];
const unmatched = [];
const duplicateCandidates = [];
for (const search of searches) {
  const candidates = search.links.map((url) => recordPages.get(url)).filter((record) => record && !record.error)
    .map((record) => ({ record, match: recordMatch(search.book, record) }))
    .filter((item) => item.match.accepted)
    .sort((left, right) => right.match.confidence - left.match.confidence);
  if (!candidates.length) {
    unmatched.push({
      id: search.book.id,
      title: search.book.title,
      author: search.book.author,
      searchUrl: search.searchUrl,
      reason: search.error ? "source_request_failed" : "no_confident_official_match",
    });
    continue;
  }
  const { record, match } = candidates[0];
  const existingOwner = record.isbn13 ? currentIsbnOwners.get(record.isbn13) : undefined;
  if (existingOwner && existingOwner !== search.book.id) {
    duplicateCandidates.push({
      id: search.book.id,
      possibleDuplicateId: existingOwner,
      title: search.book.title,
      author: search.book.author,
      isbn13: record.isbn13,
      sourceUrl: record.sourceUrl,
      match,
    });
    continue;
  }
  accepted.push({
    id: search.book.id,
    ...record,
    match,
    verifiedAt,
  });
}

const merged = new Map(existingOverrides.map((item) => [item.id, item]));
for (const item of accepted) merged.set(item.id, item);
await mkdir(dirname(reportPath), { recursive: true });
await Promise.all([
  writeFile(overridesPath, `${JSON.stringify([...merged.values()], null, 2)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: sourceName,
    inputPlaceholders: missing.length,
    searchedRecords: recordUrls.length,
    matchedThisRun: accepted.length,
    matchedTotal: merged.size,
    matchStrategies: Object.fromEntries(["exact_isbn", "title_author"].map((strategy) => [
      strategy,
      accepted.filter((item) => item.match.strategy === strategy).length,
    ])),
    fieldFill: Object.fromEntries(["publisher", "publicationYear", "pages", "seriesName", "isbn13", "language"].map((fieldName) => [
      fieldName,
      accepted.filter((item) => item[fieldName]).length,
    ])),
    accepted,
    duplicateCandidates,
    unmatched,
  }, null, 2)}\n`, "utf8"),
]);
console.log(JSON.stringify({
  inputPlaceholders: missing.length,
  searchedRecords: recordUrls.length,
  matched: accepted.length,
  duplicateCandidates: duplicateCandidates.length,
}, null, 2));
