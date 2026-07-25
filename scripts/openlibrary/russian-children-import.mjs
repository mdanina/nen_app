import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
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

export const OPEN_LIBRARY_LICENSE = {
  code: "openlibrary-rights-not-asserted",
  documentation: "https://openlibrary.org/developers/licensing",
  metadataReuse: "unknown-third-party-rights-may-remain",
  annotationReuse: "unknown",
};

const USER_AGENT = "NEN-Books-Import/0.2 (staging; official dump stream)";
const EDITIONS_URL = "https://openlibrary.org/data/ol_dump_editions_latest.txt.gz";
const AUTHORS_URL = "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz";
const WORKS_URL = "https://openlibrary.org/data/ol_dump_works_latest.txt.gz";
const array = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const ref = (value) => typeof value === "string" ? value : value?.key;
const unique = (values) => [...new Set(values.filter(Boolean))];
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const exactDescription = (value) => typeof value === "string" ? value : typeof value?.value === "string" ? value.value : null;
const cleanText = (value) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() || null : null;
const childPrefilter = /juvenile (?:fiction|literature)|children(?:'s)? (?:stories|literature|books)|picture books?|young adult (?:fiction|literature)|fiction for children|\u0434\u0435\u0442\u0441\u043a|\u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0434\u043b\u044f \u0434\u0435\u0442\u0435\u0439|\u043a\u043d\u0438\u0433\u0438 \u0434\u043b\u044f \u0434\u0435\u0442\u0435\u0439|\u043f\u043e\u0434\u0440\u043e\u0441\u0442\u043a\u043e\u0432\u0430\u044f \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430/iu;
const russianPrefilter = /\/languages\/(?:rus|ru)(?:"|\/)/iu;

function descriptionProvenance(description, entityLevel, sourceRecordId, retrievedAt) {
  return description ? {
    source: `openlibrary-${entityLevel}s-dump`,
    sourceRecordId,
    retrievedAt,
    license: OPEN_LIBRARY_LICENSE,
    origin: "Open Library record; upstream origin unknown",
    publicUseStatus: "blocked-pending-rights-review",
    textUnmodified: true,
  } : null;
}

export function editionCandidate(record, retrievedAt) {
  if (!record || record.entityLevel !== "edition") return { accepted: false, reason: "not-edition" };
  const title = normalizeTitle(record.value.title);
  if (!title.display || !title.match) return { accepted: false, reason: "missing-title" };
  const authorIds = unique(array(record.value.authors).map(ref));
  if (!authorIds.length) return { accepted: false, reason: "missing-author" };
  const workIds = unique(array(record.value.works).map(ref));
  if (!workIds.length) return { accepted: false, reason: "missing-work" };
  const languages = unique(array(record.value.languages).map(normalizeLanguage));
  if (!languages.includes("ru")) return { accepted: false, reason: "not-russian" };
  const subjects = unique(array(record.value.subjects).map(cleanText));
  if (!subjects.some(isChildSubject)) return { accepted: false, reason: "not-child" };
  const isbns = unique([...array(record.value.isbn_10), ...array(record.value.isbn_13)]
    .map(normalizeIsbn).filter((value) => value.valid).map((value) => value.normalized));
  const coverIds = unique(array(record.value.covers).filter(Number.isFinite));
  return { accepted: true, value: {
    id: record.key,
    title: title.display,
    titleMatch: title.match,
    authorIds,
    workIds,
    languages,
    subjects,
    isbns,
    publishers: unique(array(record.value.publishers).map(cleanText)),
    publicationYear: normalizePublicationYear(record.value.publish_date) ?? null,
    pages: Number.isInteger(record.value.number_of_pages) && record.value.number_of_pages > 0 ? record.value.number_of_pages : null,
    description: exactDescription(record.value.description),
    coverIds,
    series: unique(array(record.value.series).map(cleanText)),
    revision: record.revision,
    lastModified: record.lastModified,
    source: "openlibrary-editions-dump",
    retrievedAt,
    license: OPEN_LIBRARY_LICENSE,
  }};
}

export function createCandidateCollector() {
  const books = new Map();
  let editionsCombined = 0;
  let multiWorkEditionLinks = 0;

  const add = (edition) => {
    let added = false;
    if (edition.workIds.length > 1) multiWorkEditionLinks += edition.workIds.length - 1;
    for (const workId of edition.workIds) {
      let book = books.get(workId);
      if (!book) {
        book = { id: `ol-work:${sha(workId).slice(0, 24)}`, workId, title: edition.title, titleMatch: edition.titleMatch, authorIds: [], subjects: [], isbns: [], editions: [] };
        books.set(workId, book);
      }
      if (book.editions.some((item) => item.id === edition.id)) continue;
      if (book.editions.length) editionsCombined += 1;
      book.editions.push(edition);
      book.authorIds = unique([...book.authorIds, ...edition.authorIds]);
      book.subjects = unique([...book.subjects, ...edition.subjects]);
      book.isbns = unique([...book.isbns, ...edition.isbns]);
      added = true;
    }
    return added;
  };

  return { books, add, stats: () => ({ editionsCombined, multiWorkEditionLinks }) };
}

async function streamRemoteGzip(url, onLine) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const source = Readable.fromWeb(response.body);
  const gunzip = createGunzip();
  let idleTimer;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error("Open Library stream idle for 120 seconds")), 120_000);
  };
  resetIdleTimer();
  source.on("data", resetIdleTimer);
  source.on("error", (error) => gunzip.destroy(error));
  source.pipe(gunzip);
  const reader = createInterface({ input: gunzip, crlfDelay: Infinity });
  let lines = 0;
  let stoppedEarly = false;
  try {
    for await (const line of reader) {
      lines += 1;
      if (await onLine(line, lines)) { stoppedEarly = true; break; }
    }
  } catch (error) {
    error.streamLines = lines;
    throw error;
  } finally {
    clearTimeout(idleTimer);
    reader.close();
    controller.abort();
    source.destroy();
    gunzip.destroy();
  }
  return { requestedUrl: url, resolvedUrl: response.url, lines, stoppedEarly };
}

async function streamRemoteGzipWithRetry(url, onLine, label, maxRetries = 12) {
  let completedLines = 0;
  let networkLines = 0;
  let attempts = 0;
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const result = await streamRemoteGzip(url, async (line, lineNumber) => {
        if (lineNumber <= completedLines) return false;
        return onLine(line, lineNumber);
      });
      networkLines += result.lines;
      return { ...result, lines: result.lines, networkLines, attempts, resumedFromLine: completedLines };
    } catch (error) {
      const reached = Number(error.streamLines) || 0;
      networkLines += reached;
      if (reached > completedLines) completedLines = reached;
      if (attempts > maxRetries) throw error;
      console.error(`[Open Library] ${label} connection interrupted at line ${completedLines}; retry ${attempts}/${maxRetries}`);
    }
  }
  throw new Error(`${label} retry limit exhausted`);
}

async function writeLine(stream, value) {
  if (!stream.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function closeStream(stream) {
  stream.end();
  await once(stream, "finish");
}

function seededSample(values, count, seed) {
  let state = Number(seed) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((a, b) => a.order - b.order).slice(0, count).map(({ value }) => value);
}

async function readJsonLines(path, onValue) {
  try {
    const reader = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of reader) if (line.trim()) onValue(JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function workDetails(record) {
  const value = record.value;
  return {
    workId: record.key,
    title: normalizeTitle(value.title).display ?? null,
    originalTitle: cleanText(value.original_title),
    alternativeTitles: unique([...array(value.alternate_titles), ...array(value.other_titles)].map(cleanText)),
    description: exactDescription(value.description),
    subjects: unique(array(value.subjects).map(cleanText)),
    subjectPeople: unique(array(value.subject_people).map(cleanText)),
    subjectPlaces: unique(array(value.subject_places).map(cleanText)),
    subjectTimes: unique(array(value.subject_times).map(cleanText)),
    firstPublishYear: normalizePublicationYear(value.first_publish_date) ?? null,
    coverIds: unique(array(value.covers).filter(Number.isFinite)),
    series: unique(array(value.series).map(cleanText)),
    links: array(value.links).filter((item) => item && typeof item === "object"),
    revision: record.revision,
    lastModified: record.lastModified,
  };
}

function editionScore(edition) {
  return [edition.description, edition.publicationYear, edition.pages, edition.publishers.length, edition.isbns.length, edition.coverIds.length, edition.series.length]
    .reduce((score, value) => score + (Array.isArray(value) ? Math.min(value.length, 2) : value ? 1 : 0), 0);
}

function completeness(card) {
  const fields = [card.title, card.authors.length, card.description, card.subjects.length, card.firstPublicationYear, card.publishers.length, card.isbns.length, card.coverIds.length];
  const filled = fields.filter(Boolean).length;
  return filled === fields.length ? "complete" : filled >= 5 ? "substantial" : "minimal";
}

function buildCard(book, authorNames, work, retrievedAt) {
  const editions = [...book.editions].sort((left, right) => editionScore(right) - editionScore(left));
  const primary = editions[0];
  const authors = book.authorIds.map((id) => authorNames.get(id)).filter(Boolean);
  const description = work?.description ?? primary.description ?? null;
  const coverIds = unique([...(work?.coverIds ?? []), ...editions.flatMap((edition) => edition.coverIds)]);
  const subjects = unique([...(work?.subjects ?? []), ...book.subjects]);
  const firstPublicationYear = work?.firstPublishYear ?? editions.map((edition) => edition.publicationYear).filter(Boolean).sort()[0] ?? null;
  const card = {
    id: book.id,
    workId: book.workId,
    title: work?.title ?? book.title,
    originalTitle: work?.originalTitle ?? null,
    alternativeTitles: work?.alternativeTitles ?? [],
    authors,
    authorIds: book.authorIds,
    authorStatus: authors.length ? "resolved" : "author_unresolved",
    description,
    descriptionProvenance: descriptionProvenance(description, work?.description ? "work" : "edition", work?.description ? book.workId : primary.id, retrievedAt),
    subjects,
    subjectPeople: work?.subjectPeople ?? [],
    subjectPlaces: work?.subjectPlaces ?? [],
    subjectTimes: work?.subjectTimes ?? [],
    languages: unique(editions.flatMap((edition) => edition.languages)),
    firstPublicationYear,
    publishers: unique(editions.flatMap((edition) => edition.publishers)),
    isbns: unique(editions.flatMap((edition) => edition.isbns)),
    editionIds: editions.map((edition) => edition.id),
    primaryEditionId: primary.id,
    editionCount: editions.length,
    coverIds,
    coverUrl: coverIds[0] ? `https://covers.openlibrary.org/b/id/${coverIds[0]}-L.jpg` : null,
    coverProvenance: coverIds[0] ? { source: "openlibrary", sourceRecordId: work?.coverIds?.includes(coverIds[0]) ? book.workId : primary.id, retrievedAt, license: OPEN_LIBRARY_LICENSE, publicUseStatus: "blocked-pending-rights-review" } : null,
    series: unique([...(work?.series ?? []), ...editions.flatMap((edition) => edition.series)]),
    sourceLinks: work?.links ?? [],
    sourceRevision: work?.revision ?? null,
    sourceLastModified: work?.lastModified ?? null,
    completenessStatus: null,
    source: "openlibrary",
    retrievedAt,
    license: OPEN_LIBRARY_LICENSE,
    productionStatus: "staging-only",
    nen: { age: null, reading_mode: null, length: null, genres: [], themes: [], moods: [], nen_description: null, recommendation_reasons: [] },
  };
  card.completenessStatus = completeness(card);
  return card;
}

export async function runRussianChildrenImport({ output, stage = "all", seed = 20260722, retrievedAt = new Date().toISOString(), editionsUrl = EDITIONS_URL, authorsUrl = AUTHORS_URL, worksUrl = WORKS_URL }) {
  if (!["all", "editions", "authors", "works"].includes(stage)) throw new Error(`Unknown import stage: ${stage}`);
  const root = output;
  await mkdir(`${root}/raw`, { recursive: true });
  const collector = createCandidateCollector();
  const exclusions = { prefilter_not_russian_or_child: 0, parse_error: 0, missing_title: 0, missing_author: 0, missing_work: 0, not_russian: 0, not_child: 0 };
  let acceptedEditionRows = 0;

  await readJsonLines(`${root}/editions.jsonl`, (edition) => { if (collector.add(edition)) acceptedEditionRows += 1; });
  if (acceptedEditionRows) console.error(`[Open Library] resumed with ${acceptedEditionRows} saved editions and ${collector.books.size} works`);
  let editionsStream = null;
  if (stage === "all" || stage === "editions") {
    const editionsOutput = createWriteStream(`${root}/editions.jsonl`, { encoding: "utf8", flags: "a" });
    const acceptedRawOutput = createWriteStream(`${root}/raw/accepted-editions.txt`, { encoding: "utf8", flags: "a" });
    editionsStream = await streamRemoteGzipWithRetry(editionsUrl, async (line, lineNumber) => {
      if (lineNumber % 1_000_000 === 0) console.error(`[Open Library] editions lines: ${lineNumber}; saved editions: ${acceptedEditionRows}; works: ${collector.books.size}`);
      if (!russianPrefilter.test(line) || !childPrefilter.test(line)) { exclusions.prefilter_not_russian_or_child += 1; return false; }
      try {
        const parsed = parseDumpLine(line, lineNumber, "official-editions-dump");
        const result = editionCandidate(parsed, retrievedAt);
        if (!result.accepted) { const key = result.reason.replaceAll("-", "_"); exclusions[key] = (exclusions[key] ?? 0) + 1; return false; }
        if (collector.add(result.value)) {
          acceptedEditionRows += 1;
          await writeLine(editionsOutput, result.value);
          await writeLine(acceptedRawOutput, line);
          if (collector.books.size % 100 === 0) console.error(`[Open Library] works: ${collector.books.size}; dump lines: ${lineNumber}`);
        }
        return false;
      } catch { exclusions.parse_error += 1; return false; }
    }, "editions");
    await Promise.all([closeStream(editionsOutput), closeStream(acceptedRawOutput)]);
    await writeFile(`${root}/editions-complete.json`, JSON.stringify({ completedAt: new Date().toISOString(), editionsStream, acceptedEditionRows, uniqueWorks: collector.books.size, exclusions }, null, 2) + "\n", "utf8");
  }
  if (!collector.books.size) throw new Error("Official editions dump produced no matching books");
  if (stage === "editions") return { stage, counts: { acceptedEditionRows, uniqueWorks: collector.books.size }, editionsStream, exclusions };

  const neededAuthorIds = new Set([...collector.books.values()].flatMap((book) => book.authorIds));
  const authorNames = new Map();
  let authorsStream = null;
  if (stage === "works") {
    await readJsonLines(`${root}/authors.jsonl`, (author) => { if (author.name) authorNames.set(author.id, author.name); });
  } else {
    const authorsOutput = createWriteStream(`${root}/authors.jsonl`, { encoding: "utf8" });
    authorsStream = await streamRemoteGzipWithRetry(authorsUrl, async (line, lineNumber) => {
      const firstTab = line.indexOf("\t");
      const secondTab = line.indexOf("\t", firstTab + 1);
      const key = firstTab >= 0 && secondTab > firstTab ? line.slice(firstTab + 1, secondTab) : "";
      if (!neededAuthorIds.has(key)) return false;
      try {
        const parsed = parseDumpLine(line, lineNumber, "official-authors-dump");
        const name = normalizeAuthorName(parsed.value.name).display;
        if (!name) return false;
        authorNames.set(key, name);
        await writeLine(authorsOutput, { id: key, name, alternateNames: unique(array(parsed.value.alternate_names).map(cleanText)), revision: parsed.revision, lastModified: parsed.lastModified, source: "openlibrary-authors-dump", retrievedAt, license: OPEN_LIBRARY_LICENSE });
        return authorNames.size >= neededAuthorIds.size;
      } catch { return false; }
    }, "authors");
    await closeStream(authorsOutput);
  }

  const unresolvedAuthors = [...neededAuthorIds].filter((id) => !authorNames.has(id)).map((id) => ({ id, status: "author_unresolved", source: "openlibrary-authors-dump", retrievedAt }));
  await writeFile(`${root}/unresolved-authors.jsonl`, unresolvedAuthors.map(JSON.stringify).join("\n") + (unresolvedAuthors.length ? "\n" : ""), "utf8");
  if (stage === "authors") {
    const result = { stage, counts: { neededAuthors: neededAuthorIds.size, resolvedAuthors: authorNames.size, unresolvedAuthors: unresolvedAuthors.length } };
    await writeFile(`${root}/authors-complete.json`, JSON.stringify(result, null, 2) + "\n", "utf8");
    return result;
  }

  const neededWorkIds = new Set(collector.books.keys());
  const works = new Map();
  await readJsonLines(`${root}/works.jsonl`, (work) => works.set(work.workId, work));
  const worksOutput = createWriteStream(`${root}/works.jsonl`, { encoding: "utf8", flags: "a" });
  const worksStream = await streamRemoteGzipWithRetry(worksUrl, async (line, lineNumber) => {
    const firstTab = line.indexOf("\t");
    const secondTab = line.indexOf("\t", firstTab + 1);
    const key = firstTab >= 0 && secondTab > firstTab ? line.slice(firstTab + 1, secondTab) : "";
    if (!neededWorkIds.has(key)) return false;
    try {
      const parsed = parseDumpLine(line, lineNumber, "official-works-dump");
      if (!works.has(key)) {
        const work = workDetails(parsed);
        works.set(key, work);
        await writeLine(worksOutput, work);
      }
      return works.size >= neededWorkIds.size;
    } catch { return false; }
  }, "works");
  await closeStream(worksOutput);

  const cards = [...collector.books.values()].map((book) => buildCard(book, authorNames, works.get(book.workId), retrievedAt));
  const sample = seededSample(cards, Math.min(30, cards.length), seed);
  const intermediate = cards.map((card) => ({
    schemaVersion: 2,
    id: card.id,
    slug: null,
    status: "staging",
    identificationStatus: card.authorStatus === "resolved" ? "identified" : "needs-review",
    title: card.title,
    originalTitle: card.originalTitle,
    authors: card.authors,
    isbn13: card.isbns.find((isbn) => isbn.length === 13) ?? null,
    publisher: card.publishers[0] ?? null,
    publicationYear: card.firstPublicationYear,
    pages: null,
    ageMin: null,
    ageMax: null,
    readingMode: null,
    lengthCategory: null,
    genres: [],
    themes: [],
    lifeSituations: [],
    emotionalStates: [],
    moods: [],
    shortDescription: null,
    whyRecommended: null,
    sourceImportId: card.id,
  }));
  const report = {
    source: "Open Library official monthly dumps",
    retrievedAt,
    license: OPEN_LIBRARY_LICENSE,
    productionIntegration: false,
    streams: { editions: editionsStream, authors: authorsStream, works: worksStream },
    counts: {
      stagingBooks: cards.length,
      editionsInStaging: acceptedEditionRows,
      editionsCombined: Math.max(0, acceptedEditionRows - cards.length),
      resolvedAuthors: authorNames.size,
      unresolvedAuthors: unresolvedAuthors.length,
      resolvedWorks: works.size,
      unresolvedWorks: neededWorkIds.size - works.size,
      booksWithDescription: cards.filter((card) => card.description).length,
      booksWithCover: cards.filter((card) => card.coverIds.length).length,
      booksWithIsbn: cards.filter((card) => card.isbns.length).length,
      ...collector.stats(),
    },
    exclusions,
  };
  await Promise.all([
    writeFile(`${root}/books.jsonl`, cards.map(JSON.stringify).join("\n") + "\n", "utf8"),
    writeFile(`${root}/summary.json`, JSON.stringify(report, null, 2) + "\n", "utf8"),
    writeFile(`${root}/sample-30.json`, JSON.stringify(sample, null, 2) + "\n", "utf8"),
    writeFile(`${root}/books-app-staging.json`, JSON.stringify(intermediate, null, 2) + "\n", "utf8"),
  ]);
  return report;
}
