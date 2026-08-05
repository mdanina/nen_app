import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const reportPath = resolve(root, "data/reports/book-cover-assignment-audit.json");
const correctionsPath = resolve(root, "data/source/cover-assignment-corrections.json");
const catalogPath = resolve(root, "data/generated/books.json");
const apply = process.argv.includes("--apply");
const workersCount = Math.max(1, Math.min(4, Number(process.env.COVER_OCR_WORKERS || 3)));

const technicalUrl = /(?:item[_-]?no[_-]?cover|no[_-]?cover|main[_-]?cover|placeholder|default[_-]?(?:book|cover|image)|logo(?:[-_.]|$)|favicon|blank[_-]?cover|noimage|no-image)/iu;
const stopWords = new Set(["книга", "сказка", "рассказы", "повесть", "роман", "том", "часть", "для", "про", "или", "the", "book"]);
const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
};
const saveJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const normalize = (value = "") => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
const tokens = (value) => normalize(value).split(" ").filter((token) => token.length >= 3 && !stopWords.has(token));
const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
};
const tokenMatches = (needle, haystack) => haystack.some((candidate) => {
  if (candidate === needle || candidate.includes(needle) || needle.includes(candidate)) return true;
  const limit = needle.length >= 8 ? 2 : needle.length >= 5 ? 1 : 0;
  return Math.abs(candidate.length - needle.length) <= limit && levenshtein(needle, candidate) <= limit;
});
const coverage = (needle, haystack) => {
  const wanted = tokens(needle);
  const seen = tokens(haystack);
  if (!wanted.length || !seen.length) return 0;
  return wanted.filter((token) => tokenMatches(token, seen)).length / wanted.length;
};
const titleVariants = (book) => [book.title, book.originalTitle, ...(book.alternativeTitles || []), ...(book.altTitles || [])].filter(Boolean);
const titleScore = (book, text) => Math.max(0, ...titleVariants(book).map((title) => coverage(title, text)));
const authorScore = (book, text) => Math.max(0, ...String(book.author || "").split(/[,;&]/u).map((author) => coverage(author, text)));
const sameWork = (left, right) => Math.max(...titleVariants(left).map((title) => Math.max(...titleVariants(right).map((other) => (coverage(title, other) + coverage(other, title)) / 2)))) >= 0.86 && (coverage(left.author, right.author) >= 0.6 || coverage(right.author, left.author) >= 0.6);
const collectionMarker = (book) => /(?:все истории|сборник|полное собрание)/iu.test(book.title);
const allowedSharedEdition = (books) => books.every((book, index) => {
  if (index === 0) return true;
  const first = books[0];
  if (sameWork(first, book)) return true;
  const sameSource = first.cover?.sourcePageUrl && first.cover.sourcePageUrl === book.cover?.sourcePageUrl;
  const sameAuthor = coverage(first.author, book.author) >= 0.6 || coverage(book.author, first.author) >= 0.6;
  const relatedTitle = coverage(first.title, book.title) >= 0.6 || coverage(book.title, first.title) >= 0.6;
  const collectionMismatch = collectionMarker(first) !== collectionMarker(book);
  return sameSource && sameAuthor && relatedTitle && !collectionMismatch;
});
const coverOf = (book) => book.cover?.url ? book.cover : book.coverUrl ? { kind: "external", url: book.coverUrl } : undefined;
const sha = (value) => createHash("sha256").update(value).digest("hex");
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
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await task(items[index], index);
    }
  }));
  return result;
}

async function cacheImages(urls) {
  const manifest = await readJson(manifestPath, {});
  let completed = 0;
  await mapPool(urls, 8, async (url) => {
    const key = sha(url);
    if (manifest[url]?.status === "downloaded") { completed += 1; return; }
    try {
      const response = await fetch(url, { headers: { "user-agent": "NEN book cover assignment audit/1.0" }, signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) throw new Error(`not an image: ${contentType}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 500) throw new Error(`image is too small: ${bytes.length} bytes`);
      const suffix = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : contentType.includes("gif") ? ".gif" : extname(new URL(url).pathname).match(/^\.(?:jpe?g|png|webp|gif)$/iu)?.[0] || ".jpg";
      const file = resolve(imageRoot, `${key}${suffix}`);
      await mkdir(imageRoot, { recursive: true });
      await writeFile(file, bytes);
      manifest[url] = { status: "downloaded", file, contentType, bytes: bytes.length, ...imageDimensions(Buffer.from(bytes)) };
    } catch (error) {
      manifest[url] = { status: "failed", error: String(error?.message || error) };
    }
    completed += 1;
    if (completed % 50 === 0) { await saveJson(manifestPath, manifest); console.log(`downloaded/checked ${completed}/${urls.length}`); }
  });
  await saveJson(manifestPath, manifest);
  for (const [url, item] of Object.entries(manifest)) {
    if (item.status !== "downloaded" || item.width) continue;
    try { Object.assign(item, imageDimensions(await readFile(item.file))); } catch {}
  }
  await saveJson(manifestPath, manifest);
  return manifest;
}

async function runOcr(urls, manifest) {
  const ocr = await readJson(ocrPath, {});
  const pending = urls.filter((url) => manifest[url]?.status === "downloaded" && !ocr[url]);
  if (!pending.length) return ocr;
  const workers = await Promise.all(Array.from({ length: workersCount }, async () => {
    const worker = await createWorker("rus", OEM.LSTM_ONLY, { langPath: russianData.langPath, cachePath: resolve(cacheRoot, "tessdata"), gzip: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
    return worker;
  }));
  let cursor = 0;
  let completed = urls.length - pending.length;
  await Promise.all(workers.map(async (worker) => {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      try {
        const result = await worker.recognize(manifest[url].file);
        ocr[url] = { status: "recognized", text: result.data.text.trim(), confidence: result.data.confidence };
      } catch (error) {
        ocr[url] = { status: "failed", text: "", error: String(error?.message || error) };
      }
      completed += 1;
      if (completed % 20 === 0) { await saveJson(ocrPath, ocr); console.log(`OCR ${completed}/${urls.length}`); }
    }
  }));
  await Promise.all(workers.map((worker) => worker.terminate()));
  await saveJson(ocrPath, ocr);
  return ocr;
}

async function improveSparseOcr(urls, manifest, ocr, repeatedUrls) {
  const pending = urls.filter((url) => manifest[url]?.status === "downloaded" && !ocr[url]?.sparseTried && ((!ocr[url]?.text && url.includes("n-e-n.ru")) || repeatedUrls.has(url)));
  if (!pending.length) return ocr;
  const worker = await createWorker("rus", OEM.LSTM_ONLY, { langPath: russianData.langPath, cachePath: resolve(cacheRoot, "tessdata"), gzip: true });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
  let completed = 0;
  for (const url of pending) {
    try {
      const result = await worker.recognize(manifest[url].file);
      ocr[url] = { ...ocr[url], sparseTried: true, sparseText: result.data.text.trim(), sparseConfidence: result.data.confidence };
    } catch (error) {
      ocr[url] = { ...ocr[url], sparseTried: true, sparseError: String(error?.message || error) };
    }
    completed += 1;
    if (completed % 10 === 0) { await saveJson(ocrPath, ocr); console.log(`sparse OCR ${completed}/${pending.length}`); }
  }
  await worker.terminate();
  await saveJson(ocrPath, ocr);
  return ocr;
}

function evaluate(catalog, urls, manifest, ocr) {
  const booksByUrl = new Map();
  for (const book of catalog) {
    const cover = coverOf(book);
    if (!cover?.url) continue;
    if (!booksByUrl.has(cover.url)) booksByUrl.set(cover.url, []);
    booksByUrl.get(cover.url).push(book);
  }
  const imageMatches = new Map();
  const bestImageByBook = new Map();
  const indexedBooks = catalog.map((book) => ({
    book,
    titleTokens: [...new Set(titleVariants(book).flatMap(tokens))],
    authorTokens: tokens(book.author),
  }));
  for (const url of urls) {
    const text = [ocr[url]?.text, ocr[url]?.sparseText].filter(Boolean).join("\n");
    const ocrTokens = tokens(text);
    const roughCandidates = indexedBooks.map((item) => {
      const titleHits = item.titleTokens.filter((token) => ocrTokens.includes(token)).length;
      const authorHits = item.authorTokens.filter((token) => ocrTokens.includes(token)).length;
      return { ...item, rough: titleHits * 3 + authorHits };
    }).filter((item) => item.rough > 0).sort((a, b) => b.rough - a.rough).slice(0, 60);
    for (const current of booksByUrl.get(url) || []) {
      if (!roughCandidates.some((item) => item.book.id === current.id)) roughCandidates.push(indexedBooks.find((item) => item.book.id === current.id));
    }
    const candidates = roughCandidates.filter(Boolean).map(({ book }) => {
      const title = titleScore(book, text);
      const author = authorScore(book, text);
      return { id: book.id, titleScore: title, authorScore: author, score: title * 0.84 + author * 0.16 };
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    const bestBook = best ? catalog.find((book) => book.id === best.id) : undefined;
    const exactTitle = bestBook && titleVariants(bestBook).some((title) => tokens(title).length >= 2 && normalize(text).includes(normalize(title)));
    const conciseExactTitle = exactTitle && ocrTokens.length <= 14;
    const confident = Boolean(best && best.titleScore >= 0.82 && best.score - (second?.score || 0) >= 0.1 && (best.authorScore >= 0.5 || conciseExactTitle));
    const match = { best, second, confident, margin: best ? best.score - (second?.score || 0) : 0 };
    imageMatches.set(url, match);
    if (confident && (!bestImageByBook.has(best.id) || best.score > bestImageByBook.get(best.id).score)) bestImageByBook.set(best.id, { url, score: best.score });
  }
  const invalid = new Map();
  const reassignments = [];
  const duplicateGroups = [];
  const isTechnicalImage = (url) => {
    const dimensions = manifest[url] || {};
    return technicalUrl.test(url) || (url.includes("n-e-n.ru") && dimensions.width > dimensions.height * 1.25) || /social-fb/iu.test(url);
  };
  for (const [url, books] of booksByUrl) {
    const technical = isTechnicalImage(url);
    if (technical) for (const book of books) invalid.set(book.id, { reason: "technical_image", url });
    if (books.length < 2) continue;
    const legitimate = allowedSharedEdition(books);
    const match = imageMatches.get(url);
    const duplicateMatchConfident = Boolean(match?.confident || (match?.best?.titleScore >= 0.6 && match?.best?.authorScore >= 0.8));
    const isbnOwners = books.filter((book) => book.isbn13 && coverOf(book)?.isbn13 === book.isbn13);
    const matchedOwner = duplicateMatchConfident ? books.find((book) => book.id === match.best.id) : undefined;
    const owner = (isbnOwners.length === 1 ? isbnOwners[0] : undefined) || matchedOwner;
    duplicateGroups.push({ url, bookIds: books.map((book) => book.id), titles: books.map((book) => book.title), classification: technical ? "technical_image" : legitimate ? "same_work" : owner ? "wrong_assignment" : "unconfirmed", ownerId: owner?.id, ocr: ocr[url], match });
    if (technical || legitimate) continue;
    if (owner) {
      for (const book of books) if (book.id !== owner.id) invalid.set(book.id, { reason: "duplicate_url_wrong_book", url, correctBookId: owner.id });
    } else {
      for (const book of books) invalid.set(book.id, { reason: "conflicting_duplicate_url_unconfirmed", url });
    }
  }
  for (const [url, books] of booksByUrl) {
    if (isTechnicalImage(url)) continue;
    if (!books.every((book) => book.cover?.sourcePageUrl?.includes("n-e-n.ru"))) continue;
    const match = imageMatches.get(url);
    if (!match?.confident) continue;
    const currentIds = new Set(books.map((book) => book.id));
    if (currentIds.has(match.best.id)) continue;
    const reciprocal = bestImageByBook.get(match.best.id)?.url === url;
    if (!reciprocal) continue;
    for (const book of books) invalid.set(book.id, { reason: "ocr_matches_different_book", url, correctBookId: match.best.id });
    const currentTarget = catalog.find((book) => book.id === match.best.id);
    const targetCover = coverOf(currentTarget);
    reassignments.push({ targetId: match.best.id, fromIds: books.map((book) => book.id), previousTargetUrl: targetCover?.url, cover: coverOf(books[0]), confidence: match.best.score, evidence: { ocrText: ocr[url]?.text, titleScore: match.best.titleScore, authorScore: match.best.authorScore, margin: match.margin } });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    applied: apply,
    summary: {
      cardsChecked: catalog.length,
      cardsWithCover: catalog.filter((book) => coverOf(book)?.url).length,
      uniqueCoverUrls: urls.length,
      imagesDownloaded: urls.filter((url) => manifest[url]?.status === "downloaded").length,
      downloadFailures: urls.filter((url) => manifest[url]?.status === "failed").length,
      imagesOcrProcessed: urls.filter((url) => ocr[url]?.status === "recognized").length,
      repeatedUrls: duplicateGroups.length,
      incorrectAssignments: invalid.size,
      coversReassigned: reassignments.length,
      technicalImagesRemoved: [...invalid.values()].filter((item) => item.reason === "technical_image").length,
      cardsReturnedToPlaceholder: [...invalid.keys()].filter((id) => !reassignments.some((item) => item.targetId === id)).length,
      duplicateAssignmentsEliminated: [...invalid.values()].filter((item) => item.reason.includes("duplicate") || item.reason.includes("conflicting")).length,
    },
    duplicateGroups,
    invalidAssignments: [...invalid.entries()].map(([id, value]) => ({ id, ...value })),
    reassignments,
    unconfirmedImages: urls.filter((url) => !imageMatches.get(url)?.confident).map((url) => ({ url, books: booksByUrl.get(url)?.map((book) => ({ id: book.id, title: book.title, author: book.author })) || [], ocr: ocr[url], match: imageMatches.get(url) })),
    downloadFailures: urls.filter((url) => manifest[url]?.status === "failed").map((url) => ({ url, error: manifest[url].error })),
  };
  return report;
}

const catalog = await readJson(catalogPath, []);
const urls = [...new Set(catalog.map((book) => coverOf(book)?.url).filter(Boolean))];
console.log(`catalog=${catalog.length}, coverUrls=${urls.length}, apply=${apply}`);
const manifest = await cacheImages(urls);
const repeatedUrls = new Set(urls.filter((url) => catalog.filter((book) => coverOf(book)?.url === url).length > 1));
let ocr = await runOcr(urls, manifest);
ocr = await improveSparseOcr(urls, manifest, ocr, repeatedUrls);
const report = evaluate(catalog, urls, manifest, ocr);
const appliedCorrections = await readJson(correctionsPath, undefined);
if (!apply && appliedCorrections?.invalidAssignments?.length) {
  report.appliedCorrections = {
    generatedAt: appliedCorrections.generatedAt,
    summary: {
      incorrectAssignmentsFound: appliedCorrections.invalidAssignments.length,
      coversReassigned: appliedCorrections.reassignments.length,
      technicalImagesRemoved: appliedCorrections.invalidAssignments.filter((item) => item.reason === "technical_image").length,
      duplicateAssignmentsEliminated: appliedCorrections.invalidAssignments.filter((item) => item.reason.includes("duplicate") || item.reason.includes("conflicting")).length,
      cardsReturnedToPlaceholder: appliedCorrections.invalidAssignments.length - appliedCorrections.reassignments.filter((item) => appliedCorrections.invalidAssignments.some((invalid) => invalid.id === item.targetId)).length,
    },
    invalidAssignments: appliedCorrections.invalidAssignments,
    reassignments: appliedCorrections.reassignments,
  };
}
await saveJson(reportPath, report);
if (apply) await saveJson(correctionsPath, {
  generatedAt: report.generatedAt,
  invalidAssignments: report.invalidAssignments,
  reassignments: report.reassignments,
});
console.log(JSON.stringify(report.summary, null, 2));
if (apply) console.log(`Wrote ${correctionsPath}`);
