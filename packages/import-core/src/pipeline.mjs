import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bibliographicCandidate } from "./model.mjs";
import { validateBatch } from "./validation.mjs";
import { findMatchCandidates } from "./deduplication.mjs";

async function json(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

export async function runImportPipeline({ adapter, inputs, output, retrievedAt, batchId }) {
  if (!adapter?.descriptor?.id) throw new Error("A defined source adapter is required");
  if (!inputs?.length) throw new Error("At least one input is required");
  if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) throw new Error("A valid retrievedAt timestamp is required");
  const target = resolve(output);
  const directories = Object.fromEntries(["raw", "normalized", "validated", "deduplication", "unified", "editorial", "reports"].map((name) => [name, join(target, name)]));
  await Promise.all(Object.values(directories).map((directory) => mkdir(directory, { recursive: true })));
  const loaded = await adapter.read(inputs, { retrievedAt });
  const entities = loaded.records.map((record) => adapter.normalize(record));
  const authors = entities.filter((entity) => entity.entityLevel === "author");
  const works = entities.filter((entity) => entity.entityLevel === "work");
  const editions = entities.filter((entity) => entity.entityLevel === "edition");
  const validation = validateBatch(entities);
  const deduplication = findMatchCandidates({ authors, works, editions });
  const candidates = works.map((work) => bibliographicCandidate(work, editions));

  await writeFile(join(directories.raw, "records.jsonl"), loaded.records.map((record) => JSON.stringify(record)).join("\n") + (loaded.records.length ? "\n" : ""), "utf8");
  await Promise.all([
    json(join(directories.normalized, "authors.json"), authors),
    json(join(directories.normalized, "works.json"), works),
    json(join(directories.normalized, "editions.json"), editions),
    json(join(directories.validated, "validation.json"), validation),
    json(join(directories.deduplication, "match-candidates.json"), deduplication),
    json(join(directories.unified, "book-candidates.json"), candidates),
    json(join(directories.editorial, "records.json"), []),
    json(join(directories.reports, "summary.json"), {
      batchId,
      source: adapter.descriptor,
      retrievedAt,
      rawRecords: loaded.records.length,
      readErrors: loaded.errors.length,
      entities: { authors: authors.length, works: works.length, editions: editions.length },
      annotations: entities.reduce((count, entity) => count + (entity.annotations?.length ?? 0), 0),
      covers: entities.reduce((count, entity) => count + (entity.covers?.length ?? 0), 0),
      validationIssues: validation.issues.length,
      candidates: candidates.length,
      productionIntegration: { enabled: false, target: null },
    }),
    json(join(directories.reports, "read-errors.json"), loaded.errors),
  ]);
  await json(join(target, "manifest.json"), {
    schemaVersion: 1,
    batchId,
    adapter: adapter.descriptor.id,
    retrievedAt,
    stages: ["raw", "normalized", "validated", "deduplication", "unified", "editorial"],
    productionIntegration: false,
  });
  return { authors, works, editions, candidates, validation, deduplication, readErrors: loaded.errors };
}

