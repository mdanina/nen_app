import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

test("все книжные подборки НЭН восстановлены полностью", async () => {
  const [source, coverage] = await Promise.all([
    readFile(resolve(root, "data/source/nen-book-collections.json"), "utf8").then(JSON.parse),
    readFile(resolve(root, "data/reports/nen-collections-coverage.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(coverage.collections.length, source.collections.length);
  for (const collection of coverage.collections) {
    assert.equal(collection.missing.length, 0, collection.slug);
    assert.equal(collection.matchedCount, collection.sourceTitleCount, collection.slug);
  }
});
