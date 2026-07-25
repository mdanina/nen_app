import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runMassImport } from "./mass-import.mjs";

const fixture = resolve("data/import/openlibrary/fixtures/pilot-fragment.txt");
const productionFiles = [
  resolve("data/source/catalog-full.json"),
  resolve("data/source/books-v2.json"),
  resolve("data/generated/books.json"),
];

const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const readJsonLines = async (path) => (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);

test("mass import merges editions into one staging book and remains incremental", async () => {
  const root = await mkdtemp(join(tmpdir(), "nen-openlibrary-"));
  const databasePath = join(root, "state", "catalog.sqlite");
  const firstOutput = join(root, "first");
  const secondOutput = join(root, "second");
  const before = await Promise.all(productionFiles.map(digest));

  try {
    const first = await runMassImport({
      inputs: [fixture],
      databasePath,
      output: firstOutput,
      dumpDate: "2026-07-01",
      retrievedAt: "2026-07-21T00:00:00.000Z",
      batchId: "test-first",
      batchSize: 3,
    });

    assert.equal(first.counters.processed, 13);
    assert.equal(first.counters.inserted, 13);
    assert.equal(first.counters.errors, 0);
    assert.equal(first.counts.childBooks, 3);

    const books = await readJsonLines(join(firstOutput, "books.jsonl"));
    const merged = books.find((book) => book.internal.workIds.includes("/works/OLPILOT1W"));
    assert.ok(merged);
    assert.deepEqual(merged.internal.workIds, ["/works/OLPILOT1W", "/works/OLPILOT3W"]);
    assert.deepEqual(merged.internal.editionIds, ["/books/OLPILOT1M", "/books/OLPILOT2M", "/books/OLPILOT4M"]);
    assert.equal(merged.age, null);
    assert.deepEqual(merged.themes, []);
    assert.deepEqual(merged.moods, []);
    assert.ok(merged.internal.sourceSubjects.includes("Juvenile fiction"));
    assert.equal(merged.internal.productionStatus, "staging-only");
    assert.equal(books.some((book) => book.internal.workIds.includes("/works/OLPILOT4W")), false);

    const annotations = await readJsonLines(join(firstOutput, "annotations.jsonl"));
    const fixtureRecord = (await readFile(fixture, "utf8")).split("\n").find((line) => line.includes("/works/OLPILOT1W"));
    const originalAnnotation = JSON.parse(fixtureRecord.split("\t").slice(4).join("\t")).description.value;
    assert.equal(annotations[0].text, originalAnnotation);
    assert.equal(annotations[0].public_use, "unknown");
    assert.equal(annotations[0].source, "openlibrary");

    const covers = await readJsonLines(join(firstOutput, "covers.jsonl"));
    assert.ok(covers.length > 0);
    assert.ok(covers.every((cover) => cover.locally_stored === 0));
    assert.ok(covers.every((cover) => cover.external_url.startsWith("https://covers.openlibrary.org/")));

    const second = await runMassImport({
      inputs: [fixture],
      databasePath,
      output: secondOutput,
      dumpDate: "2026-07-01",
      retrievedAt: "2026-07-21T01:00:00.000Z",
      batchId: "test-second",
      batchSize: 3,
    });
    assert.equal(second.counters.unchanged, 13);
    assert.equal(second.counters.inserted, 0);
    assert.equal(second.counters.updated, 0);
    assert.equal(second.reconciliation.affectedWorks, 0);
    assert.equal(second.counts.childBooks, 3);

    const after = await Promise.all(productionFiles.map(digest));
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
