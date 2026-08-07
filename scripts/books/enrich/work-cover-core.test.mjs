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

test("verified official title is a canonical work alias", () => {
  const work = canonicalWork({
    id: "gordon",
    title: "Комиссар Гордон. Первый случай",
    author: "Ульф Нильсон",
    sourceMetadata: {
      officialMetadataAudit: {
        officialTitle: "Комиссар Гордон. Первое дело",
        sourceUrl: "https://samokatbook.ru/book/komissar-gordon-pervoe-delo/",
      },
    },
  });
  assert.deepEqual(work.alternativeTitles, ["Комиссар Гордон. Первое дело"]);
  assert.deepEqual(work.sourceMetadata.alternativeTitles, ["Комиссар Гордон. Первое дело"]);
});

test("canonical work matches a transliterated foreign author surname", () => {
  const foreignWork = canonicalWork({ id: "corduroy", title: "Кордурой", originalTitle: "Corduroy", author: "Дон Фриман" });
  const ranked = rankWorkCoverCandidates(foreignWork, [candidate({
    title: "Corduroy",
    authors: ["Don Freeman"],
    sourceUrl: "https://www.penguinrandomhouse.com/books/748913/corduroy-by-don-freeman/",
    cover: { official: true, url: "https://images.penguinrandomhouse.com/cover/9780451470799" },
  })]);
  assert.equal(ranked.length, 1);
});

test("foreign author matching tolerates established transliterations and generation suffixes", () => {
  const cases = [
    ["Эзра Джек Китс", "Ezra Jack Keats"],
    ["Роальд Даль", "Roald Dahl"],
    ["Рейнбоу Рауэлл", "Rainbow Rowell"],
    ["Билл Мартин — младший", "Bill Martin Jr."],
    ["Вернер Хольцварт", "Werner Holzwarth"],
  ];
  for (const [author, officialAuthor] of cases) {
    const work = canonicalWork({ id: author, title: "Exact work", author });
    assert.equal(rankWorkCoverCandidates(work, [candidate({ title: "Exact work", authors: [officialAuthor] })]).length, 1, `${author} -> ${officialAuthor}`);
  }
});

test("canonical work tolerates a one-letter translation spelling variant", () => {
  const work = canonicalWork({ id: "madeline", title: "Мейделин Финн и собака из приюта", author: "Лиза Папп" });
  const ranked = rankWorkCoverCandidates(work, [candidate({ title: "Мэйделин Финн и собака из приюта", authors: ["Лиза Папп"] })]);
  assert.equal(ranked.length, 1);
});

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
