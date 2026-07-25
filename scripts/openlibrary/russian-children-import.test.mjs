import assert from "node:assert/strict";
import test from "node:test";
import { createCandidateCollector, editionCandidate } from "./russian-children-import.mjs";

const record = (overrides = {}) => ({ entityLevel: "edition", key: overrides.key ?? "/books/OL1M", rawLine: "raw", value: { title: "Детская книга", authors: [{ key: "/authors/OL1A" }], works: [{ key: "/works/OL1W" }], languages: [{ key: "/languages/rus" }], subjects: ["Детская литература"], ...overrides.value } });

test("accepts only Russian child editions with title, author and work", () => {
  assert.equal(editionCandidate(record(), "2026-07-22T00:00:00.000Z").accepted, true);
  assert.equal(editionCandidate(record({ value: { languages: [{ key: "/languages/eng" }] } }), "2026-07-22T00:00:00.000Z").reason, "not-russian");
  assert.equal(editionCandidate(record({ value: { subjects: ["Adult fiction"] } }), "2026-07-22T00:00:00.000Z").reason, "not-child");
  assert.equal(editionCandidate(record({ value: { authors: [] } }), "2026-07-22T00:00:00.000Z").reason, "missing-author");
});

test("merges editions by work and never uses ISBN as the book id", () => {
  const collector = createCandidateCollector();
  const first = editionCandidate(record(), "2026-07-22T00:00:00.000Z").value;
  const second = editionCandidate(record({ key: "/books/OL2M", value: { isbn_13: ["9782070541935"] } }), "2026-07-22T00:00:00.000Z").value;
  collector.add(first);
  collector.add(second);
  assert.equal(collector.books.size, 1);
  const book = [...collector.books.values()][0];
  assert.equal(book.editions.length, 2);
  assert.ok(book.id.startsWith("ol-work:"));
  assert.equal(book.id.includes("9782070541935"), false);
});

test("keeps distinct Open Library works as distinct cards", () => {
  const collector = createCandidateCollector();
  collector.add(editionCandidate(record(), "2026-07-22T00:00:00.000Z").value);
  collector.add(editionCandidate(record({ key: "/books/OL2M", value: { works: [{ key: "/works/OL2W" }] } }), "2026-07-22T00:00:00.000Z").value);
  assert.equal(collector.books.size, 2);
  assert.deepEqual([...collector.books.keys()].sort(), ["/works/OL1W", "/works/OL2W"]);
});
