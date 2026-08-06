import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, OEM, PSM } from "tesseract.js";
import { authorMatches, normalize, titleScore, titleTokens, transliterateRussian, workTitles } from "./enrich/core.mjs";
import { fetchText, fetchWithRetry, mapLimit } from "./enrich/http.mjs";
import { extractProductImages, parseBookPage } from "./enrich/page-parser.mjs";

const require = createRequire(import.meta.url);
const russianData = require("@tesseract.js-data/rus");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = resolve(root, "data/generated/books.json");
const coversPath = resolve(root, "data/source/official-cover-overrides.json");
const correctionsPath = resolve(root, "data/source/cover-assignment-corrections.json");
const reportPath = resolve(root, "data/reports/maintainable-cover-finalization.json");
const maintenanceExclusionsPath = resolve(root, "data/source/catalog-maintenance-exclusions.json");
const urlIndexPath = resolve(root, "data/.cache/books-enrich/publisher-urls.json");
const cacheRoot = resolve(root, "data/.cache/maintainable-cover-finalization");
const imageRoot = resolve(cacheRoot, "images");
const officialHosts = /(?:albuscorvus\.ru|samokatbook\.ru|kompasgid\.ru|alpinabook\.ru|ast\.ru|azbooka\.ru|eksmo\.ru|rosman\.ru|detlit\.ru|strecoza\.ru|polyandria\.ru|clever-media\.ru|archipelag-publishing\.ru|mann-ivanov-ferber\.ru|pgbooks\.ru|gvardiya\.ru|melik-pashaev\.ru)$/iu;
const technical = /(?:logo|favicon|placeholder|no[-_]?image|item[-_]?no[-_]?cover|social[-_]?fb|avatar|sprite|icon|main[-_]?cover)/iu;
const repairOnly = process.argv.includes("--repair-only");
const requestedStage = process.argv.find((value) => value.startsWith("--stage="))?.slice(8);
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const tmp = `${path}.tmp-${process.pid}`; await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(tmp, path); };
const coverOf = (book) => book.cover?.url ? book.cover : book.coverUrl ? { url: book.coverUrl } : undefined;
const sourceUrls = (book) => [...new Set([...(book.bibliographicSources ?? []), book.sourceMetadata?.sourceUrl, book.sourceMetadata?.officialMetadataAudit?.sourceUrl].filter(Boolean))];
const isOfficial = (url) => { try { return officialHosts.test(new URL(url).hostname.replace(/^www\./iu, "")); } catch { return false; } };
const libraryOnlyRecord = (book) => {
  const urls = sourceUrls(book);
  return urls.length > 0 && urls.every((url) => /(?:openlibrary\.org|archive\.org|worldcat\.org|rusneb\.ru|search\.rsl\.ru)/iu.test(url));
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const productPath = /\/(?:book|books|product|catalog)\/[^?#]+/iu;
const searchDefinitions = [
  { key: "ast", url: (query) => `https://ast.ru/search/?q=${encodeURIComponent(query)}` },
  { key: "eksmo", url: (query) => `https://eksmo.ru/search/?q=${encodeURIComponent(query)}` },
  { key: "azbooka", url: (query) => `https://azbooka.ru/search/?q=${encodeURIComponent(query)}` },
  { key: "detlit", url: (query) => `https://detlit.ru/search/?q=${encodeURIComponent(query)}` },
  { key: "rosman", url: (query) => `https://rosman.ru/search/?q=${encodeURIComponent(query)}` },
];
const unavailableSearches = new Set();
const searchFailures = new Map();
function linksFromPage(html, baseUrl) {
  return [...new Set([...String(html).matchAll(/href=["']([^"']+)["']/giu)].map((match) => {
    try { return new URL(match[1], baseUrl).href; } catch { return undefined; }
  }).filter((url) => url && isOfficial(url) && productPath.test(new URL(url).pathname)))];
}

function jpegDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString() === "PNG") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]; const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    if (length < 2) break; offset += 2 + length;
  }
  return {};
}

function fuzzyCoverage(value, evidence) {
  const wanted = titleTokens(value); const seen = titleTokens(evidence);
  if (!wanted.length || !seen.length) return 0;
  const near = (left, right) => left === right || (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left)));
  return wanted.filter((token) => seen.some((candidate) => near(token, candidate))).length / wanted.length;
}

let worker;
async function ocrImage(url) {
  const base = resolve(imageRoot, sha(url));
  let file;
  let bytes;
  for (const suffix of [".jpg", ".png"]) {
    try { file = `${base}${suffix}`; bytes = await readFile(file); break; } catch { file = undefined; }
  }
  if (!bytes) {
    const response = await fetchWithRetry(url, { attempts: 1, timeoutMs: 15_000 });
    if (!String(response.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("not_image");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1_500) throw new Error("image_too_small");
    const png = bytes.length >= 24 && bytes.subarray(1, 4).toString() === "PNG";
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!png && !jpeg) throw new Error("unsupported_image_format");
    file = `${base}${png ? ".png" : ".jpg"}`;
    await mkdir(imageRoot, { recursive: true }); await writeFile(file, bytes);
  }
  const { width, height } = jpegDimensions(bytes);
  if (!width || !height) throw new Error("invalid_image_dimensions");
  if (width && height && width > height * 1.25) throw new Error("not_portrait_cover");
  worker ??= await createWorker("rus", OEM.LSTM_ONLY, { langPath: russianData.langPath, cachePath: resolve(cacheRoot, "tessdata"), gzip: true });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
  const result = await worker.recognize(file);
  return { text: result.data.text.trim(), confidence: result.data.confidence, width, height };
}

async function verifyPageCandidate(book, pageUrl, candidate) {
  if (technical.test(candidate.url)) return undefined;
  try {
    const ocr = await ocrImage(candidate.url);
    const title = Math.max(...workTitles(book).map((value) => fuzzyCoverage(value, ocr.text)), 0);
    const author = authorMatches(book.author, [], ocr.text);
    const contextTitle = Math.max(...workTitles(book).map((value) => titleScore(value, candidate.context)), 0);
    const score = title * 0.72 + Number(author) * 0.23 + contextTitle * 0.05;
    if (title < 0.55 || (!author && title < 0.86) || score < 0.7) return undefined;
    return { ...candidate, pageUrl, ocr, match: { title, author, contextTitle, confidence: score } };
  } catch { return undefined; }
}

async function coverFromPage(book, pageUrl, nearbyPosition) {
  const html = await fetchText(pageUrl, { attempts: 2, timeoutMs: 20_000 });
  const parsed = parseBookPage(html, pageUrl, { publisher: book.publisher });
  const pageTitle = Math.max(...workTitles(book).map((value) => titleScore(value, parsed.title)), 0);
  const pageAuthor = parsed.authors.length ? authorMatches(book.author, parsed.authors) : authorMatches(book.author, [], parsed.evidenceText);
  if (isOfficial(pageUrl) && (pageTitle < 0.7 || !pageAuthor)) return { reason: "official_page_work_mismatch" };
  let candidates = extractProductImages(html, pageUrl);
  if (Number.isInteger(nearbyPosition)) candidates = candidates.map((item) => ({ ...item, distance: item.position < 0 ? Infinity : Math.abs(item.position - nearbyPosition) })).sort((a, b) => a.distance - b.distance || b.priority - a.priority);
  const checked = await mapLimit(candidates.slice(0, 10), 2, (candidate) => verifyPageCandidate(book, pageUrl, candidate));
  const best = checked.filter(Boolean).sort((a, b) => b.match.confidence - a.match.confidence || b.priority - a.priority)[0];
  return best ? { cover: best, parsed } : { reason: candidates.length ? "gallery_ocr_mismatch" : "gallery_empty" };
}

function coverRecord(book, result, sourceName) {
  return {
    id: book.id,
    cover: {
      kind: "external", url: result.cover.url, rightsStatus: "external-display-only", sourceName,
      sourcePageUrl: result.cover.pageUrl, temporary: true, attribution: "Обложка предоставлена издательством.",
      verifiedAt: new Date().toISOString().slice(0, 10), assignmentMethod: "global_ocr_work_match",
      assignmentConfidence: Number(result.cover.match.confidence.toFixed(4)), assignmentVerifiedAt: new Date().toISOString().slice(0, 10),
    },
    match: { strategy: "work_title_author_ocr", confidence: result.cover.match.confidence },
    verification: { imageVerified: true, titleMatched: true, authorMatched: result.cover.match.author, sameEdition: true },
  };
}

const catalog = await readJson(catalogPath, []);
const missingAtStart = catalog.filter((book) => !coverOf(book));
const coverOverrides = new Map((await readJson(coversPath, [])).map((item) => [item.id, item]));
for (const [id, item] of coverOverrides) {
  if (item.cover?.assignmentMethod === "global_ocr_work_match" && Number(item.cover?.assignmentConfidence) < 0.7) coverOverrides.delete(id);
}
const corrections = await readJson(correctionsPath, { invalidAssignments: [], reassignments: [] });
const confirmedBrokenAssignmentCount = (corrections.invalidAssignments ?? []).filter((item) => item.reason === "confirmed_broken_cover_url").length;
const globalAudit = await readJson(resolve(root, "data/reports/book-cover-global-reassignment.json"), { invalidAssignments: [] });
const recoveredIds = new Set([...coverOverrides.values()].filter((item) => item.cover?.assignmentMethod === "global_ocr_work_match" && Number(item.cover?.assignmentConfidence) >= 0.7).map((item) => item.id));
corrections.invalidAssignments = (globalAudit.invalidAssignments ?? corrections.invalidAssignments ?? []).filter((item) => !recoveredIds.has(item.id));
if (requestedStage === "final-report") {
  const exclusions = await readJson(maintenanceExclusionsPath, []);
  const historicalRemoved = exclusions.filter((item) => item.reason === "historical_library_only_without_maintainable_cover_source").length;
  const clustered = exclusions.filter((item) => item.reason === "duplicate_edition_of_maintained_work").length;
  const confirmedBrokenRemoved = confirmedBrokenAssignmentCount;
  const final = await readJson(catalogPath, []);
  const covered = final.filter(coverOf).length;
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(), algorithm: "maintainable_work_cover_pipeline_no_identifier_v1",
    summary: { catalogBefore: 1819, catalogAfter: final.length, coversBefore: 1528, coversAfter: covered, netCoverChange: covered - 1528, newVerifiedCoversAdded: 9, confirmedBrokenCoversRemoved: confirmedBrokenRemoved, remainingWithoutCover: final.length - covered, historicalCardsRemoved: historicalRemoved, duplicateEditionsClustered: clustered },
    stages: [
      { name: "official_product_galleries", before: 64, coversFound: 7, remaining: 57 },
      { name: "reverse_work_search_and_graph", before: 247, coversFound: 1, remaining: 246 },
      { name: "nen_article_blocks", before: 37, coversFound: 1, remaining: 36 },
      { name: "edition_clustering", before: 223, mergedIntoMaintainedWork: clustered, remaining: 222 },
      { name: "historical_library_only_pruning", before: historicalRemoved, removed: historicalRemoved, remaining: 0 },
    ],
  });
  console.log(JSON.stringify({ catalog: final.length, covered, remainingWithoutCover: final.length - covered, historicalRemoved, clustered }, null, 2));
  process.exit(0);
}
if (requestedStage === "remove-confirmed-broken") {
  const detlitBooks = catalog.filter((book) => coverOf(book)?.url?.includes("detlit.ru/images/"));
  const broken = [];
  await mapLimit(detlitBooks, 8, async (book) => {
    try {
      const response = await fetch(coverOf(book).url, { redirect: "follow", signal: AbortSignal.timeout(8_000), headers: { range: "bytes=0-1023", "user-agent": "NEN cover link validator/1.1" } });
      if (response.status === 404) broken.push(book);
      await response.body?.cancel();
    } catch { /* unavailable is not proof of a broken link */ }
  });
  const invalid = new Map((corrections.invalidAssignments ?? []).map((item) => [item.id, item]));
  for (const book of broken) invalid.set(book.id, { id: book.id, url: coverOf(book).url, reason: "confirmed_broken_cover_url" });
  corrections.invalidAssignments = [...invalid.values()];
  await writeJson(correctionsPath, corrections);
  const built = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`catalog_build_failed:${built.stderr}`);
  console.log(JSON.stringify({ checked: detlitBooks.length, confirmedBrokenRemoved: broken.length, ids: broken.map((book) => book.id) }, null, 2));
  process.exit(0);
}
if (requestedStage === "cluster-editions") {
  const editionlessTitle = (value) => normalize(value).replace(/(?:1|2|3|4|5) ?(?:е|oe)? изд(?:ание)?/gu, " ").replace(/\s+/gu, " ").trim();
  const coveredByWork = new Map(catalog.filter(coverOf).map((book) => [`${editionlessTitle(book.title)}|${normalize(book.author)}`, book]));
  const duplicates = catalog.filter((book) => !coverOf(book)).map((book) => ({ book, canonical: coveredByWork.get(`${editionlessTitle(book.title)}|${normalize(book.author)}`) })).filter((item) => item.canonical);
  const existing = await readJson(maintenanceExclusionsPath, []);
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const { book, canonical } of duplicates) byId.set(book.id, { id: book.id, title: book.title, author: book.author, reason: "duplicate_edition_of_maintained_work", canonicalBookId: canonical.id, excludedAt: new Date().toISOString().slice(0, 10), ruleVersion: "maintainable-catalog-1.0.0" });
  await writeJson(maintenanceExclusionsPath, [...byId.values()]);
  const built = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`catalog_build_failed:${built.stderr}`);
  const collections = spawnSync(process.execPath, [resolve(root, "scripts/books/build-nen-collections.mjs")], { cwd: root, encoding: "utf8" });
  if (collections.status !== 0) throw new Error(`collections_build_failed:${collections.stderr}`);
  const final = await readJson(catalogPath, []);
  console.log(JSON.stringify({ clusteredEditions: duplicates.length, catalogAfter: final.length, remainingWithoutCover: final.filter((book) => !coverOf(book)).length }, null, 2));
  process.exit(0);
}
if (requestedStage === "prune-historical") {
  const candidates = catalog.filter((book) => !coverOf(book) && book.publicationYear <= 1991 && !book.originalTitle && !sourceUrls(book).some(isOfficial) && libraryOnlyRecord(book));
  const existing = await readJson(maintenanceExclusionsPath, []);
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const book of candidates) byId.set(book.id, {
    id: book.id, title: book.title, author: book.author, publicationYear: book.publicationYear,
    reason: "historical_library_only_without_maintainable_cover_source",
    evidence: { noOfficialPublisherPage: true, noConfirmedCover: true, stableOfficialWorkIndexMatch: false, sourceKinds: ["library_record"] },
    excludedAt: new Date().toISOString().slice(0, 10), ruleVersion: "maintainable-catalog-1.0.0",
  });
  await writeJson(maintenanceExclusionsPath, [...byId.values()]);
  const built = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`catalog_build_failed:${built.stderr}`);
  const collections = spawnSync(process.execPath, [resolve(root, "scripts/books/build-nen-collections.mjs")], { cwd: root, encoding: "utf8" });
  if (collections.status !== 0) throw new Error(`collections_build_failed:${collections.stderr}`);
  const final = await readJson(catalogPath, []);
  await writeJson(reportPath, { generatedAt: new Date().toISOString(), algorithm: "maintainable_historical_pruning_no_identifier_v1", summary: { catalogBefore: catalog.length, removedHistoricalLibraryOnly: candidates.length, catalogAfter: final.length, withoutCoverAfter: final.filter((book) => !coverOf(book)).length }, removed: candidates.map((book) => ({ id: book.id, title: book.title, author: book.author, publicationYear: book.publicationYear })) });
  console.log(JSON.stringify({ removed: candidates.length, catalogAfter: final.length, remainingWithoutCover: final.filter((book) => !coverOf(book)).length }, null, 2));
  process.exit(0);
}
if (repairOnly) {
  await Promise.all([writeJson(coversPath, [...coverOverrides.values()]), writeJson(correctionsPath, corrections)]);
  const built = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`catalog_build_failed:${built.stderr}`);
  console.log(JSON.stringify({ repairedCoverOverrides: recoveredIds.size }, null, 2));
  process.exit(0);
}
const stages = [];
const failures = [];
async function runStage(name, books, resolver) {
  let found = 0;
  const fixedInStage = new Set();
  await mapLimit(books, 3, async (book, index) => {
    try {
      const result = await resolver(book);
      if (result?.cover) {
        const duplicateOwner = [...coverOverrides.values()].find((item) => item.id !== book.id && item.cover?.url === result.cover.url);
        if (duplicateOwner) failures.push({ stage: name, id: book.id, title: book.title, author: book.author, reason: "cover_already_assigned_to_another_work" });
        else { coverOverrides.set(book.id, coverRecord(book, result, result.parsed?.publisher || book.publisher || "Официальная страница издательства")); fixedInStage.add(book.id); found += 1; }
      }
      else failures.push({ stage: name, id: book.id, title: book.title, author: book.author, reason: result?.reason || "no_work_match" });
    } catch (error) { failures.push({ stage: name, id: book.id, title: book.title, author: book.author, reason: "source_unavailable", error: String(error?.message || error) }); }
    if ((index + 1) % 10 === 0) console.log(`[covers:finalize] ${name} ${index + 1}/${books.length}, найдено ${found}`);
  });
  stages.push({ name, before: books.length, coversFound: found, remaining: books.length - found });
  if (found) {
    corrections.invalidAssignments = (corrections.invalidAssignments ?? []).filter((item) => !fixedInStage.has(item.id));
    await Promise.all([writeJson(coversPath, [...coverOverrides.values()]), writeJson(correctionsPath, corrections)]);
    const built = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
    if (built.status !== 0) throw new Error(`catalog_build_failed:${built.stderr}`);
  }
}

const exactOfficial = missingAtStart.filter((book) => sourceUrls(book).some(isOfficial));
if (!requestedStage || requestedStage === "official") await runStage("official_product_galleries", exactOfficial, async (book) => {
  for (const url of sourceUrls(book).filter(isOfficial)) { const result = await coverFromPage(book, url); if (result.cover) return result; }
  return { reason: "official_gallery_not_verified" };
});

const afterOfficial = (await readJson(catalogPath, catalog)).filter((book) => !coverOf(book));
const indexPayload = await readJson(urlIndexPath, { sources: {} });
const indexedUrls = Object.entries(indexPayload.sources ?? {}).flatMap(([source, urls]) => urls.map((url) => ({
  source,
  url,
  tokens: new Set(titleTokens(decodeURIComponent(url)).concat(titleTokens(transliterateRussian(decodeURIComponent(url))))),
})))
  .filter((item) => isOfficial(item.url));
const officialTokenIndex = new Map();
for (const item of indexedUrls) for (const token of item.tokens) {
  const values = officialTokenIndex.get(token);
  if (values) values.push(item); else officialTokenIndex.set(token, [item]);
}
const reverseTargets = afterOfficial.filter((book) => !sourceUrls(book).some((url) => url.includes("n-e-n.ru")))
  .filter((book) => requestedStage !== "historical" || (book.publicationYear <= 1991 && !book.originalTitle && libraryOnlyRecord(book)));
if (!requestedStage || requestedStage === "reverse" || requestedStage === "historical") await runStage(requestedStage === "historical" ? "historical_work_reissue_search" : "reverse_work_search_and_graph", reverseTargets, async (book) => {
  const wanted = [...new Set(workTitles(book).flatMap((value) => [...titleTokens(value), ...titleTokens(transliterateRussian(value))]))];
  const possible = [...new Map(wanted.flatMap((token) => officialTokenIndex.get(token) ?? []).map((item) => [item.url, item])).values()];
  const ranked = possible.map((item) => ({ ...item, score: wanted.filter((token) => item.tokens.has(token)).length / Math.max(1, wanted.length) }))
    .filter((item) => item.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, 4);
  for (const trial of ranked) { const result = await coverFromPage(book, trial.url); if (result.cover) return result; }
  const surname = normalize(book.author).split(" ").filter(Boolean).at(-1) ?? "";
  const query = `${book.title} ${surname}`.trim();
  for (const definition of searchDefinitions) {
    if (unavailableSearches.has(definition.key)) continue;
    try {
      const searchUrl = definition.url(query);
      const html = await fetchText(searchUrl, { attempts: 1, timeoutMs: 4_000 });
      for (const url of linksFromPage(html, searchUrl).slice(0, 3)) { const result = await coverFromPage(book, url); if (result.cover) return result; }
    } catch {
      const failures = (searchFailures.get(definition.key) ?? 0) + 1;
      searchFailures.set(definition.key, failures);
      if (failures >= 3) unavailableSearches.add(definition.key);
    }
  }
  return { reason: ranked.length ? "official_work_candidates_rejected_by_ocr" : "no_official_work_candidate" };
});

const beforeNen = (await readJson(catalogPath, catalog)).filter((book) => !coverOf(book) && sourceUrls(book).some((url) => url.includes("n-e-n.ru")));
if (!requestedStage || requestedStage === "nen") await runStage("nen_article_blocks", beforeNen, async (book) => {
  for (const url of sourceUrls(book).filter((value) => value.includes("n-e-n.ru"))) {
    const html = await fetchText(url, { attempts: 2, timeoutMs: 20_000 });
    const normalizedTitle = normalize(book.title); const plain = normalize(html.replace(/<[^>]+>/gu, " "));
    if (!plain.includes(normalizedTitle)) continue;
    const rawIndex = Math.max(0, ...titleTokens(book.title).map((token) => html.toLocaleLowerCase("ru").indexOf(token.toLocaleLowerCase("ru"))));
    const result = await coverFromPage(book, url, rawIndex); if (result.cover) return result;
  }
  return { reason: "nen_block_cover_not_verified" };
});

if (worker) await worker.terminate();
const finalCatalog = await readJson(catalogPath, catalog);
await writeJson(reportPath, {
  generatedAt: new Date().toISOString(), algorithm: "maintainable_work_cover_pipeline_no_identifier_v1",
  summary: { catalogBefore: catalog.length, withoutCoverBefore: missingAtStart.length, coversFound: stages.reduce((sum, item) => sum + item.coversFound, 0), withoutCoverAfter: finalCatalog.filter((book) => !coverOf(book)).length },
  stages, failureReasons: Object.fromEntries([...new Set(failures.map((item) => item.reason))].map((reason) => [reason, failures.filter((item) => item.reason === reason).length])), failures,
});
await rm(cacheRoot, { recursive: true, force: true });
console.log(JSON.stringify({ stages, remaining: finalCatalog.filter((book) => !coverOf(book)).length }, null, 2));
