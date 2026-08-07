import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWork, rankWorkCoverCandidates, workCoverRecord } from "./work-cover-core.mjs";

const book = {
  id: "book-1",
  title: "Дом, в котором…",
  originalTitle: "The Gray House",
  alternativeTitles: ["Дом, в котором"],
  author: "Мариам Петросян",
  publisher: "Старое издательство",
  publicationYear: 2009,
};

function candidate(overrides = {}) {
  return {
    title: "Дом, в котором",
    authors: ["Мариам Петросян"],
    sourceKey: "publisher",
    sourceName: "Издательство",
    sourceUrl: "https://publisher.example/books/gray-house",
    sourcePriority: 100,
    officialPublisher: true,
    confidence: 0.95,
    cover: { official: true, url: "https://publisher.example/images/gray-house.jpg" },
    ...overrides,
  };
}

test("обложка выбирается по каноническому произведению и автору", () => {
  const ranked = rankWorkCoverCandidates(canonicalWork(book), [candidate({ publisher: "Другое издательство", publicationYear: 2025 })]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].candidate.cover.url, "https://publisher.example/images/gray-house.jpg");
});

test("обложка другого автора не принимается", () => {
  const ranked = rankWorkCoverCandidates(canonicalWork(book), [candidate({ authors: ["Другой автор"] })]);
  assert.equal(ranked.length, 0);
});

test("мерч с названием произведения не считается книжной обложкой", () => {
  const ranked = rankWorkCoverCandidates(canonicalWork(book), [candidate({
    title: "Блокнот А5 «Дом, в котором...»",
    sourceUrl: "https://publisher.example/books/bloknot-a5-dom-v-kotorom/",
  })]);
  assert.equal(ranked.length, 0);
});

test("официальная страница имеет приоритет перед библиографическим источником", () => {
  const library = candidate({ sourceKey: "catalog", sourcePriority: 40, officialPublisher: false, trustedCoverSource: true, cover: { official: true, url: "https://catalog.example/gray-house.jpg" } });
  const ranked = rankWorkCoverCandidates(canonicalWork(book), [library, candidate()]);
  assert.equal(ranked[0].candidate.sourceKey, "publisher");
});

test("запись обложки не содержит библиографических ограничений издания", () => {
  const selection = rankWorkCoverCandidates(canonicalWork(book), [candidate()])[0];
  const record = workCoverRecord(book, selection, "2026-08-06");
  assert.equal(record.cover.assignmentMethod, "canonical_work_official_cover");
  assert.equal(record.verification.editionIndependent, true);
  assert.deepEqual(Object.keys(record.cover).sort(), ["assignmentConfidence", "assignmentMethod", "attribution", "kind", "rightsStatus", "sourceName", "sourcePageUrl", "temporary", "url", "verifiedAt"].sort());
});
