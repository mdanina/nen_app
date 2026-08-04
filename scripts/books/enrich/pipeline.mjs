import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { EnrichmentCache } from "./cache.mjs";
import { TOOL_NAME, TOOL_VERSION, chooseBestCandidate, isCurrentEdition, objectiveSnapshot, validIsbn13 } from "./core.mjs";
import { mapLimit, verifyImage } from "./http.mjs";
import { createGoogleBooksSource } from "./sources/google-books.mjs";
import { createOfficialPublisherSource } from "./sources/official-publishers.mjs";
import { createOpenLibrarySource } from "./sources/open-library.mjs";
import { createNenEditorialSource } from "./sources/nen-editorial.mjs";
import { createLibraryCatalogSource } from "./sources/library-catalogs.mjs";
import { validateCatalog } from "./validate.mjs";
import { normalizePublisherName } from "./publisher-normalization.mjs";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function equalMaterial(left, right) {
  const omit = (value) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !["verifiedAt", "enrichment"].includes(key)));
  return JSON.stringify(omit(left)) === JSON.stringify(omit(right));
}

function reasonCounts(items) {
  return Object.fromEntries([...new Set(items.map((item) => item.reason))].sort().map((reason) => [reason, items.filter((item) => item.reason === reason).length]));
}

export async function runEnrichment(options = {}) {
  const root = options.root;
  const paths = {
    catalog: resolve(root, "data/generated/books.json"),
    metadata: resolve(root, "data/source/official-metadata-overrides.json"),
    covers: resolve(root, "data/source/official-cover-overrides.json"),
    report: resolve(root, "data/reports/books-enrichment.json"),
  };
  const config = {
    freshnessDays: 180,
    cacheDays: 30,
    concurrency: 3,
    sourceConcurrency: 6,
    sources: ["nen-editorial", "official-publishers", "google-books", "open-library", "library-catalogs"],
    ...await readJson(resolve(root, "data/source/books-enrichment-config.json"), {}),
    ...options,
  };
  const runAt = new Date().toISOString();
  const [catalog, metadataInput, coversInput] = await Promise.all([
    readJson(paths.catalog, []), readJson(paths.metadata, []), readJson(paths.covers, []),
  ]);
  const beforeById = new Map(catalog.map((book) => [book.id, objectiveSnapshot(book)]));
  const metadata = new Map(metadataInput.map((item) => [item.id, item]));
  const covers = new Map(coversInput.map((item) => [item.id, item]));
  const isbnOwners = new Map(catalog.filter((book) => validIsbn13(book.isbn13)).map((book) => [book.isbn13, book.id]));
  const cache = new EnrichmentCache(root, config.cacheDays);
  await cache.load();
  const builtInSources = [
    createNenEditorialSource({ root }),
    createOfficialPublisherSource({ cache, concurrency: config.sourceConcurrency, root, matchLevel: config.matchLevel ?? 1, publisherKeys: config.publisherKeys }),
    createGoogleBooksSource({ cache }),
    createOpenLibrarySource({ cache }),
    createLibraryCatalogSource({ cache, concurrency: config.sourceConcurrency }),
  ];
  const allSources = (options.sourceAdapters ?? builtInSources).filter((source) => config.sources.includes(source.key) || options.sourceAdapters);
  const imageVerifier = options.imageVerifier ?? verifyImage;
  const sourceFailures = [];
  const sourceErrorCounts = new Map();
  const disabledSources = new Set();
  for (const source of allSources) {
    try { await source.init?.(); }
    catch (error) { sourceFailures.push({ source: source.key, reason: "source_initialization_failed", error: String(error) }); }
  }

  const selectedById = config.bookId ? catalog.filter((book) => book.id === config.bookId) : catalog;
  const selected = config.missingCoverOnly ? selectedById.filter((book) => book.cover?.kind !== "external") : selectedById;
  const targets = [];
  const outcomes = [];
  const publisherNormalizations = [];
  for (const book of selected) {
    if (!config.force && isCurrentEdition(book, metadata.get(book.id), covers.get(book.id), config.freshnessDays)) {
      outcomes.push({ id: book.id, title: book.title, reason: "already_current" });
    } else targets.push(book);
  }
  const limitedTargets = Number.isInteger(config.limit) ? targets.slice(0, config.limit) : targets;
  const changes = [];
  let completed = 0;
  const finish = (outcome) => {
    outcomes.push(outcome);
    completed += 1;
    if (!config.quiet && (completed % 25 === 0 || completed === limitedTargets.length)) {
      console.log(`[books:enrich] обработано ${completed}/${limitedTargets.length}, обновлено ${changes.length}`);
    }
  };
  await mapLimit(limitedTargets, config.concurrency, async (book) => {
    try {
    const normalizedPublisher = normalizePublisherName(book.publisher);
    const searchBook = normalizedPublisher && normalizedPublisher !== book.publisher ? { ...book, publisher: normalizedPublisher } : book;
    if (normalizedPublisher && normalizedPublisher !== book.publisher) {
      const current = metadata.get(book.id) ?? { id: book.id };
      metadata.set(book.id, { ...current, publisher: normalizedPublisher, publisherNormalization: { from: book.publisher, ruleVersion: "1.0.0" } });
      publisherNormalizations.push({ id: book.id, from: book.publisher, to: normalizedPublisher });
    }
    const candidates = [];
    const errors = [];
    const checkedSources = [];
    for (const source of allSources) {
      if (disabledSources.has(source.key)) continue;
      try {
        const found = await source.search(searchBook);
        checkedSources.push(source.key);
        candidates.push(...found);
      }
      catch (error) {
        const count = (sourceErrorCounts.get(source.key) ?? 0) + 1;
        sourceErrorCounts.set(source.key, count);
        errors.push({ source: source.key, error: String(error) });
        if (count >= 3 && /HTTP 429|fetch failed|timeout|ECONN|ENOTFOUND/iu.test(String(error))) {
          disabledSources.add(source.key);
          sourceFailures.push({ source: source.key, reason: "source_disabled_after_repeated_errors", error: String(error) });
        }
      }
    }
    const officialSelection = chooseBestCandidate(book, candidates.filter((candidate) => candidate.officialPublisher && candidate.cover?.official));
    const selectedCandidate = officialSelection ?? chooseBestCandidate(book, candidates);
    if (!selectedCandidate) {
      finish({ id: book.id, title: book.title, reason: candidates.length ? "no_verified_work_match" : "no_candidates", errors });
      return;
    }
    const candidate = selectedCandidate.candidate;
    const sourceCoverageComplete = allSources.every((source) => source.coverageComplete?.() ?? true);
    const sourceSearchComplete = errors.length === 0 && checkedSources.length === allSources.length && sourceCoverageComplete;
    const oldMetadata = metadata.get(book.id);
    const oldCover = covers.get(book.id);
    const coverVerified = Boolean(candidate.cover?.official && candidate.cover.url && await imageVerifier(candidate.cover.url));
    const fullEditionReplacement = Boolean(candidate.officialPublisher && coverVerified && candidate.publisher && candidate.isbn13);
    const sameIsbn = Boolean(candidate.isbn13 && candidate.isbn13 === book.isbn13);
    const canAdoptWithoutCover = !book.isbn13 && book.cover?.kind !== "external";
    const officialCoverWithoutIsbn = Boolean((candidate.officialPublisher || candidate.trustedCoverSource) && coverVerified && candidate.sourceUrl && selectedCandidate.work.matches);
    if (!fullEditionReplacement && !sameIsbn && !canAdoptWithoutCover && !officialCoverWithoutIsbn) {
      finish({ id: book.id, title: book.title, reason: coverVerified ? "insufficient_edition_evidence" : "official_cover_not_verified", source: candidate.sourceKey });
      return;
    }
    if (candidate.isbn13 && isbnOwners.has(candidate.isbn13) && isbnOwners.get(candidate.isbn13) !== book.id) {
      finish({ id: book.id, title: book.title, reason: "isbn_conflict", isbn13: candidate.isbn13, owner: isbnOwners.get(candidate.isbn13) });
      return;
    }
    if (book.publicationYear && candidate.publicationYear && candidate.publicationYear < book.publicationYear && !sameIsbn) {
      finish({ id: book.id, title: book.title, reason: "older_than_current", source: candidate.sourceKey });
      return;
    }
    const replacement = fullEditionReplacement && candidate.isbn13 !== book.isbn13;
    const nextMetadata = {
      id: book.id,
      source: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      sourceRecordId: candidate.sourceRecordId,
      officialTitle: candidate.title,
      officialAuthors: candidate.authors,
      publisher: candidate.publisher ?? (replacement ? undefined : book.publisher),
      isbn13: candidate.isbn13 ?? (replacement ? undefined : book.isbn13),
      publicationYear: candidate.publicationYear ?? (replacement ? undefined : book.publicationYear),
      pages: candidate.pages ?? (replacement ? undefined : book.pages),
      seriesName: candidate.seriesName ?? (replacement ? undefined : book.seriesName),
      language: candidate.language ?? (replacement ? undefined : book.language),
      replaceEdition: replacement,
      match: {
        strategy: "work_title_author",
        confidence: candidate.confidence,
        titleScore: selectedCandidate.work.titleScore,
        authorMatch: selectedCandidate.work.authorMatch,
        selectedEditionYear: candidate.publicationYear,
      },
      verification: {
        trustedSource: Boolean(candidate.officialPublisher || candidate.trustedCoverSource || candidate.sourceKey === "google-books" || candidate.sourceKey === "open-library"),
        sourceKind: candidate.officialPublisher ? "official_publisher" : candidate.trustedLibrarySource ? "library_catalog" : candidate.trustedCoverSource ? "editorial_source" : "trusted_bibliographic",
        titleMatched: selectedCandidate.work.matches && selectedCandidate.work.titleScore >= 0.78,
        authorMatched: selectedCandidate.work.authorMatch && Boolean(candidate.authors?.length),
        authorEvidence: candidate.authorEvidence ?? "structured_data",
        isbnMatched: Boolean(candidate.isbn13 && validIsbn13(candidate.isbn13)),
        publisherMatched: Boolean(candidate.publisher),
        yearMatched: Number.isInteger(candidate.publicationYear),
        latestRussianEditionConfirmed: Boolean(candidate.isRussianEdition && candidate.publicationYear && sourceSearchComplete),
        sourceSearchComplete,
        checkedSources,
      },
      verifiedAt: runAt.slice(0, 10),
      enrichment: { tool: TOOL_NAME, version: TOOL_VERSION, runAt },
    };
    const nextCover = coverVerified ? {
      id: book.id,
      cover: {
        kind: "external",
        url: candidate.cover.url,
        rightsStatus: "external-display-only",
        sourceName: candidate.sourceName,
        sourcePageUrl: candidate.sourceUrl,
        isbn13: candidate.isbn13,
        temporary: true,
        attribution: candidate.cover.attribution ?? "Обложка предоставлена издательством.",
        verifiedAt: runAt.slice(0, 10),
      },
      match: { strategy: "work_title_author", confidence: candidate.confidence },
      verification: {
        imageVerified: true,
        sameEdition: Boolean(candidate.sourceUrl === nextMetadata.sourceUrl && (
          candidate.isbn13 ? candidate.isbn13 === nextMetadata.isbn13 : (candidate.officialPublisher && candidate.publisher) || candidate.trustedCoverSource
        )),
        titleMatched: selectedCandidate.work.matches,
        authorMatched: selectedCandidate.work.authorMatch && Boolean(candidate.authors?.length),
      },
    } : oldCover;
    const metadataChanged = !equalMaterial(oldMetadata, nextMetadata);
    const coverChanged = nextCover && JSON.stringify(oldCover?.cover) !== JSON.stringify(nextCover.cover);
    if (!metadataChanged && !coverChanged) {
      finish({ id: book.id, title: book.title, reason: "no_objective_improvement" });
      return;
    }
    metadata.set(book.id, nextMetadata);
    if (nextCover) covers.set(book.id, nextCover);
    if (candidate.isbn13) isbnOwners.set(candidate.isbn13, book.id);
    changes.push({
      id: book.id, title: book.title, source: candidate.sourceKey, sourceUrl: candidate.sourceUrl,
      isbnChanged: Boolean(candidate.isbn13 && candidate.isbn13 !== book.isbn13),
      coverChanged: Boolean(coverChanged),
      fields: ["isbn13", "publisher", "publicationYear", "pages", "seriesName", "language"].filter((field) => nextMetadata[field] !== oldMetadata?.[field]),
    });
    finish({ id: book.id, title: book.title, reason: "updated" });
    } catch (error) {
      finish({ id: book.id, title: book.title, reason: "book_processing_failed", error: String(error) });
    }
  });
  await cache.save();

  let validation = validateCatalog(catalog, beforeById);
  if (!config.dryRun) {
    await Promise.all([
      writeJsonAtomic(paths.metadata, [...metadata.values()]),
      writeJsonAtomic(paths.covers, [...covers.values()]),
    ]);
    if (config.build !== false) {
      const build = spawnSync(process.execPath, [resolve(root, "scripts/build-books-catalog.mjs")], { cwd: root, encoding: "utf8" });
      if (build.status !== 0) throw new Error(`Catalog build failed:\n${build.stdout}\n${build.stderr}`);
    }
    const builtCatalog = await readJson(paths.catalog, []);
    validation = validateCatalog(builtCatalog, beforeById);
    if (!validation.valid) throw new Error(`Catalog validation failed: ${JSON.stringify(validation.errors.slice(0, 20))}`);
  }
  const remainingCatalog = config.dryRun ? catalog : await readJson(paths.catalog, catalog);
  const report = {
    generatedAt: runAt,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    options: { force: Boolean(config.force), dryRun: Boolean(config.dryRun), limit: config.limit, bookId: config.bookId, missingCoverOnly: Boolean(config.missingCoverOnly), matchLevel: config.matchLevel },
    summary: {
      catalogSize: catalog.length,
      checked: selected.length,
      processed: limitedTargets.length,
      skippedAsCurrent: outcomes.filter((item) => item.reason === "already_current").length,
      updated: changes.length,
      isbnChanged: changes.filter((item) => item.isbnChanged).length,
      officialCoversFound: changes.filter((item) => item.coverChanged).length,
      publishersNormalized: publisherNormalizations.length,
      remainingWithoutExternalCover: remainingCatalog.filter((book) => book.cover?.kind !== "external").length,
    },
    failureReasons: reasonCounts(outcomes.filter((item) => !["updated", "already_current"].includes(item.reason))),
    sourceStatus: allSources.flatMap((source) => source.status ?? []),
    sourceFailures,
    changes,
    publisherNormalizations,
    outcomes,
    validation,
  };
  if (!config.dryRun) await writeJsonAtomic(paths.report, report);
  return report;
}
