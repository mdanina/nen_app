import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { EnrichmentCache } from "./cache.mjs";
import { mapLimit, verifyImage } from "./http.mjs";
import { createGoogleBooksSource } from "./sources/google-books.mjs";
import { createInternetArchiveSource } from "./sources/internet-archive.mjs";
import { createLibraryCatalogSource } from "./sources/library-catalogs.mjs";
import { createNenEditorialSource } from "./sources/nen-editorial.mjs";
import { createOfficialPublisherSource } from "./sources/official-publishers.mjs";
import { createOpenLibrarySource } from "./sources/open-library.mjs";
import { createWebDiscoverySource } from "./sources/web-discovery.mjs";
import { canonicalWork, rankWorkCoverCandidates, workCoverRecord } from "./work-cover-core.mjs";
import { sameWork } from "./core.mjs";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function countReasons(items) {
  return Object.fromEntries([...new Set(items.map((item) => item.reason))].sort().map((reason) => [reason, items.filter((item) => item.reason === reason).length]));
}

export async function runWorkCoverEnrichment({ root, concurrency = 3, sourceConcurrency = 6, limit, dryRun = false, imageVerifier = verifyImage, sourceAdapters } = {}) {
  const catalogPath = resolve(root, "data/generated/books.json");
  const coversPath = resolve(root, "data/source/official-cover-overrides.json");
  const correctionsPath = resolve(root, "data/source/cover-assignment-corrections.json");
  const reportPath = resolve(root, "data/reports/work-cover-enrichment.json");
  const catalog = await readJson(catalogPath, []);
  const coversInput = await readJson(coversPath, []);
  const corrections = await readJson(correctionsPath, { invalidAssignments: [] });
  const invalidAssignments = new Set((corrections.invalidAssignments || []).map((item) => `${item.id}|${item.url}`));
  const covers = new Map(coversInput.map((item) => [item.id, item]));
  const cache = new EnrichmentCache(root, 30);
  await cache.load();
  const sources = sourceAdapters ?? [
    createNenEditorialSource({ root, workCoverMode: true }),
    createOfficialPublisherSource({ cache, concurrency: sourceConcurrency, root, matchLevel: 3, workCoverMode: true }),
    createGoogleBooksSource({ cache, workCoverMode: true }),
    createOpenLibrarySource({ cache, workCoverMode: true }),
    createInternetArchiveSource({ cache }),
    createLibraryCatalogSource({ cache, concurrency: sourceConcurrency, workCoverMode: true }),
    createWebDiscoverySource({ cache, concurrency: sourceConcurrency, workCoverMode: true }),
  ];
  const sourceFailures = [];
  for (const source of sources) {
    try { await source.init?.(); }
    catch (error) { sourceFailures.push({ source: source.key, reason: "source_initialization_failed", error: String(error) }); }
  }
  const occupiedUrls = new Map(catalog.filter((book) => book.cover?.kind === "external" && book.cover.url).map((book) => [book.cover.url, book.id]));
  const catalogById = new Map(catalog.map((book) => [book.id, book]));
  const missing = catalog.filter((book) => book.cover?.kind !== "external");
  const targets = Number.isInteger(limit) ? missing.slice(0, limit) : missing;
  const outcomes = [];
  const changes = [];
  let completed = 0;
  await mapLimit(targets, concurrency, async (sourceBook) => {
    const book = canonicalWork(sourceBook);
    const candidates = [];
    const errors = [];
    const sourceResults = await Promise.all(sources.map(async (source) => {
      try { return { source: source.key, candidates: await source.search(book) }; }
      catch (error) { return { source: source.key, error: String(error?.message || error) }; }
    }));
    for (const result of sourceResults) {
      if (result.error) errors.push({ source: result.source, error: result.error });
      else candidates.push(...result.candidates);
    }
    const ranked = rankWorkCoverCandidates(book, candidates);
    let accepted;
    let duplicateCandidates = 0;
    let unavailableCandidates = 0;
    const candidateDecisions = [];
    for (const selection of ranked) {
      const knownOfficialPages = new Set([
        book.sourceMetadata?.officialMetadataAudit?.sourceUrl,
        book.sourceMetadata?.sourceUrl,
        ...(book.bibliographicSources ?? []),
      ].filter(Boolean));
      const verifiedOfficialCandidate = selection.candidate.officialPublisher && knownOfficialPages.has(selection.candidate.sourceUrl);
      if (invalidAssignments.has(`${book.id}|${selection.candidate.cover.url}`) && !verifiedOfficialCandidate) {
        candidateDecisions.push({ source: selection.candidate.sourceKey, sourcePageUrl: selection.candidate.sourceUrl, coverUrl: selection.candidate.cover.url, decision: "prior_invalid_assignment" });
        continue;
      }
      const owner = occupiedUrls.get(selection.candidate.cover.url);
      const ownerBook = owner ? catalogById.get(owner) : undefined;
      const sharedCanonicalWork = ownerBook ? sameWork(book, { title: ownerBook.title, authors: [ownerBook.author], evidenceText: `${ownerBook.title} ${ownerBook.author}` }).matches : false;
      if (owner && owner !== book.id && !sharedCanonicalWork) { duplicateCandidates += 1; candidateDecisions.push({ source: selection.candidate.sourceKey, sourcePageUrl: selection.candidate.sourceUrl, coverUrl: selection.candidate.cover.url, decision: "cover_already_owned", owner }); continue; }
      if (!await imageVerifier(selection.candidate.cover.url)) { unavailableCandidates += 1; candidateDecisions.push({ source: selection.candidate.sourceKey, sourcePageUrl: selection.candidate.sourceUrl, coverUrl: selection.candidate.cover.url, decision: "image_unavailable" }); continue; }
      accepted = selection;
      candidateDecisions.push({ source: selection.candidate.sourceKey, sourcePageUrl: selection.candidate.sourceUrl, coverUrl: selection.candidate.cover.url, decision: "accepted" });
      break;
    }
    if (accepted) {
      const record = workCoverRecord(book, accepted, new Date().toISOString().slice(0, 10));
      covers.set(book.id, record);
      occupiedUrls.set(record.cover.url, book.id);
      changes.push({ id: book.id, title: book.title, author: book.author, source: accepted.candidate.sourceKey, sourcePageUrl: accepted.candidate.sourceUrl, coverUrl: accepted.candidate.cover.url });
      outcomes.push({ id: book.id, title: book.title, reason: "cover_added" });
    } else {
      const reason = ranked.length === 0
        ? candidates.length ? "work_or_author_not_confirmed" : errors.length === sources.length ? "all_sources_unavailable" : "no_official_work_candidate"
        : duplicateCandidates === ranked.length ? "cover_belongs_to_existing_catalog_work"
          : unavailableCandidates > 0 ? "candidate_images_unavailable" : "no_usable_official_cover";
      outcomes.push({
        id: book.id, title: book.title, author: book.author, reason,
        checkedSources: sources.map((source) => source.key), errors,
        candidatesFound: candidates.length,
        eligibleCandidates: ranked.length,
        candidateDecisions,
        rejectedWorkCandidates: ranked.length ? [] : candidates.slice(0, 10).map((candidate) => ({
          source: candidate.sourceKey,
          sourcePageUrl: candidate.sourceUrl,
          coverUrl: candidate.cover?.url,
          candidateTitle: candidate.title,
          candidateAuthors: candidate.authors,
          workMatch: sameWork(book, candidate),
        })),
      });
    }
    completed += 1;
    if (completed % 20 === 0 || completed === targets.length) console.log(`[books:covers:work] обработано ${completed}/${targets.length}, добавлено ${changes.length}`);
  });
  await cache.save();
  if (!dryRun) {
    await writeJsonAtomic(coversPath, [...covers.values()]);
    const build = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
    if (build.status !== 0) throw new Error(`Catalog build failed:\n${build.stdout}\n${build.stderr}`);
  }
  const finalCatalog = dryRun ? catalog : await readJson(catalogPath, catalog);
  const appliedChanges = changes.filter((item) => finalCatalog.some((book) => book.id === item.id && book.cover?.url === item.coverUrl));
  const report = {
    generatedAt: new Date().toISOString(),
    algorithm: "canonical_work_official_cover_v1",
    summary: {
      checked: targets.length,
      coversAdded: appliedChanges.length,
      remainingWithoutCover: finalCatalog.filter((book) => book.cover?.kind !== "external").length,
    },
    remainingReasons: countReasons(outcomes.filter((item) => item.reason !== "cover_added")),
    sourceFailures,
    changes: appliedChanges,
    remaining: outcomes.filter((item) => item.reason !== "cover_added"),
  };
  if (!dryRun) await writeJsonAtomic(reportPath, report);
  return report;
}
