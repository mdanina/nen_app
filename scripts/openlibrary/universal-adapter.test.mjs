import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runImportPipeline } from "../../packages/import-core/src/index.mjs";
import { OpenLibraryAdapter } from "./universal-adapter.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "data/import/openlibrary/fixtures/pilot-fragment.txt");
const productionPaths = ["data/source/catalog-full.json", "data/source/books-v2.json", "data/generated/books.json"].map((path) => resolve(root, path));
const hash = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

test("Open Library adapter produces the unified model without editorial or production writes", async () => {
  const before = await Promise.all(productionPaths.map(hash));
  const output = await mkdtemp(join(tmpdir(), "nen-universal-import-"));
  const result = await runImportPipeline({
    adapter: OpenLibraryAdapter,
    inputs: [fixture],
    output,
    retrievedAt: "2026-07-21T00:00:00.000Z",
    batchId: "test-batch",
  });
  assert.equal(result.validation.valid, true);
  assert.equal(result.authors.length, 3);
  assert.equal(result.works.length, 5);
  assert.equal(result.editions.length, 5);
  const raw = await OpenLibraryAdapter.read([fixture], { retrievedAt: "2026-07-21T00:00:00.000Z" });
  const sourceDescription = raw.records.find((record) => record.payload.description)?.payload.description.value;
  const importedDescription = result.works.find((work) => work.annotations.length)?.annotations[0].text;
  assert.equal(importedDescription, sourceDescription);
  assert.equal(result.works.flatMap((work) => work.covers).every((cover) => cover.locallyStored === false && cover.publicUse === "unknown"), true);
  assert.deepEqual(JSON.parse(await readFile(join(output, "editorial/records.json"), "utf8")), []);
  assert.equal(JSON.parse(await readFile(join(output, "manifest.json"), "utf8")).productionIntegration, false);
  const after = await Promise.all(productionPaths.map(hash));
  assert.deepEqual(after, before);
  await rm(output, { recursive: true, force: true });
});

