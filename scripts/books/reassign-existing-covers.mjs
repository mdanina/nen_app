import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, OEM, PSM } from "tesseract.js";

const require = createRequire(import.meta.url);
const russianData = require("@tesseract.js-data/rus");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cacheRoot = resolve(root, "data/.cache/book-cover-audit");
const imageRoot = resolve(cacheRoot, "images");
const manifestPath = resolve(cacheRoot, "manifest.json");
const ocrPath = resolve(cacheRoot, "ocr.json");
const catalogPath = resolve(root, "data/generated/books.json");
const correctionsPath = resolve(root, "data/source/cover-assignment-corrections.json");
const reportPath = resolve(root, "data/reports/book-cover-global-reassignment.json");
const apply = process.argv.includes("--apply");
const cleanup = process.argv.includes("--cleanup");
const preserveCorrectionsOnly = process.argv.includes("--preserve-corrections-only");
const poolRef = process.argv.find((arg) => arg.startsWith("--pool-ref="))?.slice(11) || "HEAD^";
const workersCount = Math.max(1, Math.min(4, Number(process.env.COVER_OCR_WORKERS || 3)));

const technicalUrl = /(?:item[_-]?no[_-]?cover|no[_-]?cover|main[_-]?cover|placeholder|default[_-]?(?:book|cover|image)|logo(?:[-_.]|$)|favicon|blank[_-]?cover|noimage|no-image)/iu;
const genericTitles = /^(?:сказки|рассказы|повести|стихи|загадки|приключения|избранное|сборник)$/iu;
const stopWords = new Set(["книга", "сказка", "рассказы", "повесть", "роман", "том", "часть", "для", "про", "или", "the", "book"]);
const coverOf = (book) => book.cover?.url ? book.cover : book.coverUrl ? { kind: "external", url: book.coverUrl } : undefined;
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
const saveJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const normalize = (value = "") => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
const tokens = (value) => normalize(value).split(" ").filter((token) => token.length >= 3 && !stopWords.has(token));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const editionDescriptorPattern = /(?:\([^)]*(?:обложк|издани|формат)[^)]*\)|(?:книжки[- ](?:картонки|картинки)|мягкая обложка|тв[её]рдая обложка|графический роман|подарочное издание))/giu;
const workTitle = (value) => String(value || "").replace(editionDescriptorPattern, " ").replace(/\s*[.:;–—-]\s*(?=[.:;–—-]|$)/gu, " ").replace(/\s+/g, " ").trim();
const primaryTitleVariants = (book) => [...new Set([book.title, workTitle(book.title)].filter(Boolean))];
const alternativeTitleVariants = (book) => [book.originalTitle, ...(book.alternativeTitles || []), ...(book.altTitles || [])].filter(Boolean);
const titleVariants = (book) => [...primaryTitleVariants(book), ...alternativeTitleVariants(book)];
const authorVariants = (book) => [book.author, ...(book.authors || [])].flatMap((value) => String(value || "").split(/[,;&]/u)).filter(Boolean);
const seriesVariants = (book) => [book.seriesName, book.series].flat().filter(Boolean);

function levenshtein(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
function tokenMatches(needle, haystack) {
  return haystack.some((candidate) => {
    if (candidate === needle) return true;
    const shorter = Math.min(needle.length, candidate.length);
    const longer = Math.max(needle.length, candidate.length);
    if (shorter >= 5 && shorter / longer >= 0.75 && (candidate.includes(needle) || needle.includes(candidate))) return true;
    const limit = needle.length >= 7 ? 1 : 0;
    return Math.abs(candidate.length - needle.length) <= limit && levenshtein(needle, candidate) <= limit;
  });
}
function coverage(needle, haystack) {
  const wanted = tokens(needle);
  const seen = tokens(haystack);
  if (!wanted.length || !seen.length) return 0;
  return wanted.filter((token) => tokenMatches(token, seen)).length / wanted.length;
}
function bestVariantScore(variants, text) {
  let result = { score: 0, variant: undefined, exact: false, tokenCount: 0 };
  const normalizedText = normalize(text);
  for (const variant of variants) {
    const score = coverage(variant, text);
    const tokenCount = tokens(variant).length;
    const exact = tokenCount > 0 && normalizedText.includes(normalize(variant));
    if (score > result.score || (score === result.score && exact && !result.exact)) result = { score, variant, exact, tokenCount };
  }
  return result;
}
function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString() === "PNG") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 10 && bytes.subarray(0, 3).toString("ascii") === "GIF") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return {};
}
async function mapPool(items, concurrency, task) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) { const index = cursor++; await task(items[index], index); }
  }));
}
function readCatalogAtRef(ref) {
  const result = spawnSync("git", ["show", `${ref}:data/generated/books.json`], { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Cannot read cover pool from ${ref}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
function readJsonAtRef(ref, path, fallback) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  return result.status === 0 ? JSON.parse(result.stdout) : fallback;
}
async function cacheImages(urls) {
  const manifest = await readJson(manifestPath, {});
  let completed = 0;
  await mapPool(urls, 8, async (url) => {
    if (manifest[url]?.status === "downloaded") { completed += 1; return; }
    try {
      const response = await fetch(url, { headers: { "user-agent": "NEN existing-cover OCR audit/2.0" }, signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) throw new Error(`not an image: ${contentType}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 500) throw new Error(`image is too small: ${bytes.length} bytes`);
      const suffix = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : contentType.includes("gif") ? ".gif" : extname(new URL(url).pathname).match(/^\.(?:jpe?g|png|webp|gif)$/iu)?.[0] || ".jpg";
      const file = resolve(imageRoot, `${sha(url)}${suffix}`);
      await mkdir(imageRoot, { recursive: true });
      await writeFile(file, bytes);
      manifest[url] = { status: "downloaded", file, contentType, bytes: bytes.length, ...imageDimensions(bytes) };
    } catch (error) { manifest[url] = { status: "failed", error: String(error?.message || error) }; }
    completed += 1;
    if (completed % 50 === 0) { await saveJson(manifestPath, manifest); console.log(`download ${completed}/${urls.length}`); }
  });
  for (const [url, item] of Object.entries(manifest)) {
    if (item.status !== "downloaded" || item.width) continue;
    try { Object.assign(item, imageDimensions(await readFile(item.file))); } catch {}
  }
  await saveJson(manifestPath, manifest);
  return manifest;
}
async function runOcr(urls, manifest) {
  const ocr = await readJson(ocrPath, {});
  const pending = urls.filter((url) => manifest[url]?.status === "downloaded" && !ocr[url]?.text && !ocr[url]?.failedFinal);
  if (!pending.length) return ocr;
  const workers = await Promise.all(Array.from({ length: workersCount }, async () => {
    const worker = await createWorker("rus", OEM.LSTM_ONLY, { langPath: russianData.langPath, cachePath: resolve(cacheRoot, "tessdata"), gzip: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    return worker;
  }));
  let cursor = 0;
  let completed = 0;
  await Promise.all(workers.map(async (worker) => {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      try {
        const result = await worker.recognize(manifest[url].file);
        ocr[url] = { status: "recognized", text: result.data.text.trim(), confidence: result.data.confidence, failedFinal: !result.data.text.trim() };
      } catch (error) { ocr[url] = { status: "failed", text: "", error: String(error?.message || error), failedFinal: true }; }
      completed += 1;
      if (completed % 20 === 0) { await saveJson(ocrPath, ocr); console.log(`OCR ${completed}/${pending.length}`); }
    }
  }));
  await Promise.all(workers.map((worker) => worker.terminate()));
  await saveJson(ocrPath, ocr);
  return ocr;
}

function isTechnicalImage(url, item) {
  if (technicalUrl.test(url) || /social-fb/iu.test(url)) return "technical_url";
  if (url.includes("n-e-n.ru") && item?.width > item?.height * 1.25) return "article_preview";
  return undefined;
}
function isPromotionalMention(text, title) {
  const normalizedText = normalize(text);
  const normalizedTitle = normalize(title);
  const index = normalizedText.indexOf(normalizedTitle);
  if (index < 0) return false;
  const context = normalizedText.slice(Math.max(0, index - 45), Math.min(normalizedText.length, index + normalizedTitle.length + 120));
  return /(?:от автора|автор бестселлера|бестселлер|серия|по мотивам|любим(?:ыи|ая) персона\s*ж)/u.test(context);
}
function scoreCandidate(indexed, text, priorBooks, cover) {
  const primaryTitle = bestVariantScore(indexed.primaryTitles, text);
  const alternativeTitle = bestVariantScore(indexed.alternativeTitles, text);
  const useAlternative = alternativeTitle.score * 0.88 > primaryTitle.score;
  const title = useAlternative ? { ...alternativeTitle, source: "alternative" } : { ...primaryTitle, source: "primary" };
  const weightedTitleScore = useAlternative ? alternativeTitle.score * 0.88 : primaryTitle.score;
  const author = bestVariantScore(indexed.authors, text);
  const series = bestVariantScore(indexed.series, text);
  const priorSeriesMention = priorBooks.some((book) => seriesVariants(book).some((value) => normalize(value) === normalize(title.variant)));
  const promotionalBanner = /(?:от автора|автор)\s+(?:бестселлера|книги|серии)/u.test(normalize(text));
  const isPriorBook = priorBooks.some((book) => book.id === indexed.book.id);
  const promotional = title.variant && (isPromotionalMention(text, title.variant) || priorSeriesMention || (!isPriorBook && promotionalBanner));
  const generic = genericTitles.test(normalize(title.variant));
  const wordCount = tokens(text).length;
  const score = weightedTitleScore * 0.7 + author.score * 0.28 + series.score * 0.02 - (promotional ? 0.35 : 0) - (generic ? 0.2 : 0);
  return { bookId: indexed.book.id, score, title, primaryTitle, alternativeTitle, author, series, promotional, generic, wordCount };
}
function confirmsPrior(candidate) {
  if (!candidate || candidate.promotional || candidate.generic) return false;
  return (
    candidate.title.score >= 0.45 ||
    (candidate.title.score >= 0.25 && candidate.author.score >= 0.5) ||
    (candidate.title.score >= 0.95 && candidate.title.exact)
  );
}
function confirmsReassignment(candidate, prior, alternative) {
  if (!candidate || candidate.promotional || candidate.generic) return false;
  const marginFromPrior = candidate.score - (prior?.score || 0);
  const marginFromAlternative = candidate.score - (alternative?.score || 0);
  const strongTitleAuthor = candidate.title.score >= 0.85 && candidate.author.score >= 0.75 && candidate.title.tokenCount >= 2;
  const exactTitleAuthor = candidate.title.exact && candidate.title.tokenCount >= 2 && candidate.author.score >= 0.5;
  const unambiguousTitle = candidate.title.exact && candidate.title.score >= 0.95 && candidate.title.tokenCount >= 3;
  return (strongTitleAuthor || exactTitleAuthor || unambiguousTitle) && marginFromPrior >= 0.08 && marginFromAlternative >= 0.06;
}

function isEligibleGlobalMatch(candidate) {
  if (!candidate || candidate.promotional || candidate.generic) return false;
  return (
    (candidate.title.score >= 0.85 && candidate.author.score >= 0.75 && candidate.title.tokenCount >= 2) ||
    (candidate.title.exact && candidate.title.tokenCount >= 2 && candidate.author.score >= 0.5) ||
    (candidate.title.exact && candidate.title.score >= 0.95 && candidate.title.tokenCount >= 3)
  );
}

function sameCatalogWork(left, right) {
  if (!left || !right) return false;
  const leftAuthors = authorVariants(left).flatMap(tokens);
  const rightAuthors = authorVariants(right).flatMap(tokens);
  const sharedAuthor = leftAuthors.some((token) => rightAuthors.includes(token));
  if (!sharedAuthor) return false;
  return titleVariants(left).some((leftTitle) => titleVariants(right).some((rightTitle) => {
    const leftTokens = tokens(leftTitle);
    const rightTokens = tokens(rightTitle);
    const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
    return shared >= 2 && Math.max(coverage(leftTitle, rightTitle), coverage(rightTitle, leftTitle)) >= 0.5;
  }));
}
function assignGlobally(images) {
  const edges = images.flatMap((image) => image.candidates.map((candidate) => ({ image, candidate }))).sort((left, right) => right.candidate.score - left.candidate.score);
  const imageAssignment = new Map();
  const bookAssignment = new Map();
  for (const edge of edges) {
    if (imageAssignment.has(edge.image.url) || bookAssignment.has(edge.candidate.bookId)) continue;
    imageAssignment.set(edge.image.url, edge.candidate);
    bookAssignment.set(edge.candidate.bookId, { url: edge.image.url, candidate: edge.candidate });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const image of images.filter((item) => !imageAssignment.has(item.url))) {
      for (const candidate of image.candidates) {
        const occupied = bookAssignment.get(candidate.bookId);
        if (!occupied) {
          imageAssignment.set(image.url, candidate);
          bookAssignment.set(candidate.bookId, { url: image.url, candidate });
          changed = true;
          break;
        }
        const replacement = images.find((item) => item.url === occupied.url)?.candidates.find((item) => !bookAssignment.has(item.bookId));
        if (replacement && candidate.score + replacement.score > occupied.candidate.score + 0.04) {
          imageAssignment.set(image.url, candidate);
          bookAssignment.set(candidate.bookId, { url: image.url, candidate });
          imageAssignment.set(occupied.url, replacement);
          bookAssignment.set(replacement.bookId, { url: occupied.url, candidate: replacement });
          changed = true;
          break;
        }
      }
    }
  }
  return { imageAssignment, bookAssignment };
}
function findCycles(moves) {
  const next = new Map(moves.filter((move) => move.fromId && move.fromId !== move.toId).map((move) => [move.fromId, move.toId]));
  const cycles = [];
  const globallySeen = new Set();
  for (const start of next.keys()) {
    if (globallySeen.has(start)) continue;
    const path = [];
    const positions = new Map();
    let current = start;
    while (current && !globallySeen.has(current)) {
      if (positions.has(current)) { cycles.push(path.slice(positions.get(current))); break; }
      positions.set(current, path.length); path.push(current); current = next.get(current);
    }
    path.forEach((id) => globallySeen.add(id));
  }
  return cycles;
}

const catalog = await readJson(catalogPath, []);
const poolCatalog = readCatalogAtRef(poolRef);
const priorCorrections = readJsonAtRef(poolRef, "data/source/cover-assignment-corrections.json", { invalidAssignments: [], reassignments: [] });
if (preserveCorrectionsOnly) {
  const currentCorrections = await readJson(correctionsPath, { invalidAssignments: [], reassignments: [] });
  const invalidAssignments = [...(priorCorrections.invalidAssignments || []), ...(currentCorrections.invalidAssignments || [])]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id && candidate.url === item.url) === index);
  await saveJson(correctionsPath, { ...currentCorrections, invalidAssignments });
  console.log(JSON.stringify({ preservedInvalidAssignments: invalidAssignments.length }, null, 2));
  process.exit(0);
}
const poolByUrl = new Map();
for (const book of poolCatalog) {
  const cover = coverOf(book);
  if (!cover?.url) continue;
  if (!poolByUrl.has(cover.url)) poolByUrl.set(cover.url, { url: cover.url, cover, priorBooks: [] });
  poolByUrl.get(cover.url).priorBooks.push(book);
}
const urls = [...poolByUrl.keys()];
console.log(`catalog=${catalog.length}, poolRef=${poolRef}, images=${urls.length}, apply=${apply}`);
const manifest = await cacheImages(urls);
const ocr = await runOcr(urls, manifest);
const indexedBooks = catalog.map((book) => ({
  book,
  primaryTitles: primaryTitleVariants(book),
  alternativeTitles: alternativeTitleVariants(book),
  authors: authorVariants(book),
  series: seriesVariants(book),
  roughTokens: [...new Set([...titleVariants(book).flatMap(tokens), ...authorVariants(book).flatMap(tokens)])],
}));
const images = [];
const rejected = [];
for (const pool of poolByUrl.values()) {
  const technicalReason = isTechnicalImage(pool.url, manifest[pool.url]);
  if (technicalReason) { rejected.push({ url: pool.url, reason: technicalReason, priorBookIds: pool.priorBooks.map((book) => book.id) }); continue; }
  if (manifest[pool.url]?.status !== "downloaded") { rejected.push({ url: pool.url, reason: "download_failed", error: manifest[pool.url]?.error, priorBookIds: pool.priorBooks.map((book) => book.id) }); continue; }
  const urlText = decodeURIComponent(new URL(pool.url).pathname).replace(/[_.-]+/gu, " ");
  const text = [ocr[pool.url]?.text, ocr[pool.url]?.sparseText, urlText].filter(Boolean).join("\n").trim();
  if (!text) { rejected.push({ url: pool.url, reason: "ocr_empty", priorBookIds: pool.priorBooks.map((book) => book.id) }); continue; }
  const ocrTokens = tokens(text);
  const rough = indexedBooks.map((item) => ({ item, hits: item.roughTokens.filter((token) => tokenMatches(token, ocrTokens)).length })).filter((entry) => entry.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 120).map((entry) => entry.item);
  for (const prior of pool.priorBooks) if (!rough.some((item) => item.book.id === prior.id)) rough.push(indexedBooks.find((item) => item.book.id === prior.id));
  const scored = rough.filter(Boolean).map((item) => scoreCandidate(item, text, pool.priorBooks, pool.cover)).sort((a, b) => b.score - a.score);
  const priorIds = new Set(pool.priorBooks.map((book) => book.id));
  const priorCandidates = scored.filter((candidate) => priorIds.has(candidate.bookId));
  const externalCandidates = scored.filter((candidate) => !priorIds.has(candidate.bookId));
  const bestPrior = priorCandidates[0];
  const bestExternal = externalCandidates[0];
  const secondExternal = externalCandidates[1];
  const bestPriorBook = indexedBooks.find((item) => item.book.id === bestPrior?.bookId)?.book;
  const bestExternalBook = indexedBooks.find((item) => item.book.id === bestExternal?.bookId)?.book;
  const equivalentWork = sameCatalogWork(bestPriorBook, bestExternalBook);
  const keepPrior = confirmsPrior(bestPrior) && (equivalentWork || !bestExternal || bestExternal.score - bestPrior.score < 0.18 || bestExternal.generic || bestExternal.promotional || bestExternal.author.score < bestPrior.author.score);
  const moveExternal = !equivalentWork && confirmsReassignment(bestExternal, bestPrior, secondExternal);
  const explicitMismatch = isEligibleGlobalMatch(bestExternal) && !isEligibleGlobalMatch(bestPrior) && bestExternal.score - (bestPrior?.score || 0) >= 0.08;
  const primary = moveExternal ? bestExternal : keepPrior ? bestPrior : undefined;
  const candidates = primary ? [primary] : [];
  if (!primary) {
    rejected.push({ url: pool.url, reason: explicitMismatch ? "explicit_mismatch_ambiguous_target" : "low_confidence_match", priorBookIds: pool.priorBooks.map((book) => book.id), preferredPriorId: bestPrior?.bookId, ocr: { text, confidence: ocr[pool.url]?.confidence }, bestPrior, bestExternal, secondExternal });
    continue;
  }
  images.push({ ...pool, text, ocrConfidence: ocr[pool.url]?.confidence, candidates });
}
const { imageAssignment, bookAssignment } = assignGlobally(images);
const originalByBook = new Map(poolCatalog.map((book) => [book.id, coverOf(book)]));
const moves = [];
for (const image of images) {
  const assigned = imageAssignment.get(image.url);
  if (!assigned) { rejected.push({ url: image.url, reason: "global_assignment_conflict", priorBookIds: image.priorBooks.map((book) => book.id) }); continue; }
  const fromBook = image.priorBooks.length === 1 ? image.priorBooks[0] : image.priorBooks.find((book) => book.id === assigned.bookId) || image.priorBooks[0];
  moves.push({ url: image.url, fromId: fromBook?.id, toId: assigned.bookId, changed: !image.priorBooks.some((book) => book.id === assigned.bookId), score: assigned.score, evidence: assigned, ocrText: image.text });
}
const finalCoverByBook = new Map();
for (const [bookId, assignment] of bookAssignment) {
  const pool = poolByUrl.get(assignment.url);
  const moved = !pool.priorBooks.some((book) => book.id === bookId);
  finalCoverByBook.set(bookId, {
    ...pool.cover,
    ...(moved ? {
      assignmentMethod: "global_ocr_work_match",
      assignmentConfidence: Number(assignment.candidate.score.toFixed(4)),
      assignmentVerifiedAt: new Date().toISOString().slice(0, 10),
    } : {}),
  });
}
const retainedUnconfirmed = [];
for (const item of rejected.filter((entry) => !["technical_url", "article_preview", "explicit_mismatch_ambiguous_target"].includes(entry.reason))) {
  const pool = poolByUrl.get(item.url);
  if (!pool) continue;
  const preferred = item.preferredPriorId ? pool.priorBooks.find((book) => book.id === item.preferredPriorId) : undefined;
  const target = [preferred, ...pool.priorBooks].filter(Boolean).find((book) => !finalCoverByBook.has(book.id));
  if (!target) continue;
  finalCoverByBook.set(target.id, { ...pool.cover });
  retainedUnconfirmed.push({ url: item.url, bookId: target.id, reason: item.reason });
}
const invalidAssignments = [];
const reassignments = [];
for (const book of poolCatalog) {
  const original = coverOf(book);
  if (!original?.url) continue;
  const final = finalCoverByBook.get(book.id);
  if (!final || final.url !== original.url) {
    const technical = rejected.some((item) => item.url === original.url && ["technical_url", "article_preview"].includes(item.reason));
    const selectedForOtherBook = [...finalCoverByBook.entries()].some(([bookId, cover]) => bookId !== book.id && cover.url === original.url);
    invalidAssignments.push({ id: book.id, url: original.url, reason: technical ? "technical_image" : selectedForOtherBook ? "duplicate_or_wrong_assignment" : final ? "globally_reassigned" : "not_confirmed_by_global_ocr" });
  }
}
for (const [bookId, cover] of finalCoverByBook) {
  if (originalByBook.get(bookId)?.url === cover.url) continue;
  const move = moves.find((item) => item.toId === bookId && item.url === cover.url);
  reassignments.push({ targetId: bookId, fromIds: poolByUrl.get(cover.url).priorBooks.map((book) => book.id), cover, confidence: move?.score, evidence: move?.evidence, ocrText: move?.ocrText });
}
const reasonCounts = rejected.reduce((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] || 0) + 1 }), {});
const cycles = findCycles(moves);
const finalUrls = [...finalCoverByBook.values()].map((cover) => cover.url);
const currentCoverUrls = new Set(catalog.map(coverOf).filter(Boolean).map((cover) => cover.url));
const previouslyRemovedUrls = new Set(urls.filter((url) => !currentCoverUrls.has(url)));
const returnedPreviouslyRemovedCovers = [...new Set(finalUrls.filter((url) => previouslyRemovedUrls.has(url)))].length;
const previouslyRemovedReasonCounts = rejected
  .filter((item) => previouslyRemovedUrls.has(item.url))
  .reduce((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] || 0) + 1 }), {});
const report = {
  generatedAt: new Date().toISOString(),
  algorithm: "global_cover_to_book_assignment_ocr_work_v2",
  poolRef,
  summary: {
    catalogBooks: catalog.length,
    existingImagesInPool: urls.length,
    imagesDownloaded: urls.filter((url) => manifest[url]?.status === "downloaded").length,
    imagesRecognizedByOcr: urls.filter((url) => Boolean([ocr[url]?.text, ocr[url]?.sparseText].filter(Boolean).join(" ").trim())).length,
    confirmedGlobalAssignments: bookAssignment.size,
    incorrectExistingAssignments: invalidAssignments.filter((item) => item.reason !== "not_confirmed_by_global_ocr").length,
    coversAutomaticallyMoved: reassignments.length,
    previouslyRemovedCoversEvaluated: previouslyRemovedUrls.size,
    returnedPreviouslyRemovedCovers,
    previouslyRemovedCoversRejected: previouslyRemovedUrls.size - returnedPreviouslyRemovedCovers,
    technicalImagesRemoved: rejected.filter((item) => ["technical_url", "article_preview"].includes(item.reason)).length,
    booksWithoutAnyCover: catalog.length - finalCoverByBook.size,
    booksWithoutOcrConfirmedCover: catalog.length - bookAssignment.size,
    retainedUnconfirmedAssignments: retainedUnconfirmed.length,
    duplicateUrlsAfterAssignment: finalUrls.length - new Set(finalUrls).size,
    assignmentCyclesResolved: cycles.length,
  },
  rejectedReasonCounts: reasonCounts,
  previouslyRemovedReasonCounts,
  retainedUnconfirmed,
  moves: moves.filter((move) => move.changed),
  cycles,
  invalidAssignments,
  reassignments,
  rejected,
};
await saveJson(reportPath, report);
if (apply) {
  const preservedInvalidAssignments = priorCorrections.invalidAssignments || [];
  const combinedInvalidAssignments = [...preservedInvalidAssignments, ...invalidAssignments].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id && candidate.url === item.url) === index);
  await saveJson(correctionsPath, { generatedAt: report.generatedAt, algorithm: report.algorithm, invalidAssignments: combinedInvalidAssignments, reassignments });
}
console.log(JSON.stringify(report.summary, null, 2));
console.log(JSON.stringify(reasonCounts, null, 2));
if (cleanup) {
  const expected = resolve(root, "data/.cache/book-cover-audit");
  if (cacheRoot !== expected || !cacheRoot.startsWith(resolve(root, "data/.cache"))) throw new Error(`Refusing to remove unexpected cache path: ${cacheRoot}`);
  await rm(cacheRoot, { recursive: true, force: true });
  console.log(`Removed temporary OCR cache: ${cacheRoot}`);
}
