import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TOOL_NAME, TOOL_VERSION, authorMatchesNearTitle, chooseBestCandidate, currentEditionStatus, sameWork, validIsbn13, validPages } from "./core.mjs";
import { runEnrichment } from "./pipeline.mjs";
import { validateCatalog } from "./validate.mjs";
import { normalizePublisherName } from "./publisher-normalization.mjs";

const baseBook = {
  id: "book-1", slug: "mumi-zima", title: "Волшебная зима", author: "Туве Янссон",
  shortDescription: "Описание", whyRecommended: "Рекомендация", ageMin: 7, ageMax: 12,
  readingMode: "both", genres: ["Сказки"], themes: ["Семья"], moods: [],
  sensitiveTopics: [], status: "published", publisher: "Старое издательство",
  publicationYear: 2005, isbn13: "9785389000001", pages: 160, language: "ru",
};

test("год и другие неправдоподобные значения не принимаются за число страниц", () => {
  assert.equal(validPages(2020), undefined);
  assert.equal(validPages(320), 320);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "books-enrich-"));
  await mkdir(join(root, "data/generated"), { recursive: true });
  await mkdir(join(root, "data/source"), { recursive: true });
  await writeFile(join(root, "data/generated/books.json"), JSON.stringify([baseBook]), "utf8");
  await writeFile(join(root, "data/source/official-metadata-overrides.json"), "[]", "utf8");
  await writeFile(join(root, "data/source/official-cover-overrides.json"), "[]", "utf8");
  await writeFile(join(root, "data/source/books-enrichment-config.json"), JSON.stringify({ sources: ["broken", "publisher"], concurrency: 1 }), "utf8");
  return root;
}

test("произведение сопоставляется по названию и автору, а не по старому ISBN", () => {
  const result = sameWork(baseBook, { title: "Волшебная зима", authors: ["Туве Янссон"], isbn13: "9785000000002" });
  assert.equal(result.matches, true);
});

test("отдельное произведение не подменяется сборником с другими текстами", () => {
  const result = sameWork(
    { title: "Красная Шапочка", author: "Шарль Перро" },
    { title: "Красная Шапочка и другие сказки", authors: ["Шарль Перро"] },
  );
  assert.equal(result.matches, false);
  assert.equal(result.collectionExpansion, true);
});

test("выбирается наиболее новое российское издание", () => {
  const selected = chooseBestCandidate(baseBook, [
    { title: baseBook.title, authors: [baseBook.author], publicationYear: 2021, isRussianEdition: true, officialPublisher: true, confidence: 0.99 },
    { title: baseBook.title, authors: [baseBook.author], publicationYear: 2025, isRussianEdition: true, officialPublisher: true, confidence: 0.95 },
    { title: baseBook.title, authors: [baseBook.author], publicationYear: 2026, isRussianEdition: false, officialPublisher: true, confidence: 0.99 },
  ]);
  assert.equal(selected.candidate.publicationYear, 2025);
});

test("невалидный ISBN не принимается", () => {
  assert.equal(validIsbn13("9785000000002"), false);
  assert.equal(validIsbn13("9785389272378"), true);
});

test("варианты издательств нормализуются без списка карточек-исключений", () => {
  assert.equal(normalizePublisherName("Астрель"), "АСТ");
  assert.equal(normalizePublisherName("Азбука"), "Азбука-Аттикус");
  assert.equal(normalizePublisherName("Махаон"), "Азбука-Аттикус");
  assert.equal(normalizePublisherName("Альпина"), "Альпина.Дети");
  assert.equal(normalizePublisherName("Манн, Иванов и Фербер"), "МИФ.Детство");
});

function verifiedEdition() {
  const book = { ...baseBook, publisher: "Новое издательство", publicationYear: 2025, isbn13: "9785389272378", pages: 192, language: "ru" };
  const metadata = {
    id: book.id, source: "Издательство", sourceUrl: "https://publisher.example/book", sourceRecordId: "/book",
    officialTitle: book.title, officialAuthors: [book.author], publisher: book.publisher, publicationYear: book.publicationYear,
    isbn13: book.isbn13, pages: book.pages, language: book.language, verifiedAt: "2026-08-03",
    enrichment: { tool: TOOL_NAME, version: TOOL_VERSION },
    verification: {
      trustedSource: true, sourceKind: "official_publisher", titleMatched: true, authorMatched: true,
      isbnMatched: true, publisherMatched: true, yearMatched: true, latestRussianEditionConfirmed: true,
      sourceSearchComplete: true, checkedSources: ["official-publishers", "google-books", "open-library"],
    },
  };
  const cover = {
    id: book.id,
    cover: { kind: "external", url: "https://publisher.example/cover.jpg", sourcePageUrl: metadata.sourceUrl, isbn13: book.isbn13, verifiedAt: "2026-08-03" },
    verification: { imageVerified: true, sameEdition: true, titleMatched: true, authorMatched: true },
  };
  return { book, metadata, cover };
}

test("already_current требует полного пакета доказательств того же издания", () => {
  const { book, metadata, cover } = verifiedEdition();
  assert.equal(currentEditionStatus(book, metadata, cover, 180, new Date("2026-08-03")).current, true);
});

test("страница другого автора не считается актуальным изданием", () => {
  const { book, metadata, cover } = verifiedEdition();
  metadata.officialAuthors = ["Лев Толстой"];
  const result = currentEditionStatus(book, metadata, cover, 180, new Date("2026-08-03"));
  assert.equal(result.current, false);
  assert.ok(result.reasons.includes("author_mismatch"));
});

test("автор в посторонней рекомендации на странице не подтверждает автора издания", () => {
  const unrelated = `Басни Лев Толстой ${"описание ".repeat(250)} Другие книги: Сергей Михалков`;
  assert.equal(authorMatchesNearTitle("Сергей Михалков", "Басни Лев Толстой", unrelated), false);
  assert.equal(authorMatchesNearTitle("Лев Толстой", "Басни Лев Толстой", unrelated), true);
});

test("обложка другого ISBN не считается обложкой проверенного издания", () => {
  const { book, metadata, cover } = verifiedEdition();
  cover.cover.isbn13 = "9785171512385";
  const result = currentEditionStatus(book, metadata, cover, 180, new Date("2026-08-03"));
  assert.equal(result.current, false);
  assert.ok(result.reasons.includes("cover_edition_mismatch"));
});

test("ISBN, издательство и год должны совпадать с одним проверенным изданием", () => {
  const { book, metadata, cover } = verifiedEdition();
  const changed = { ...book, isbn13: "9785171512385", publisher: "Другое издательство", publicationYear: 2024 };
  const result = currentEditionStatus(changed, metadata, cover, 180, new Date("2026-08-03"));
  assert.equal(result.current, false);
  assert.ok(result.reasons.includes("isbn_mismatch"));
  assert.ok(result.reasons.includes("publisher_mismatch"));
  assert.ok(result.reasons.includes("publication_year_mismatch"));
});

test("без завершённого поиска более нового российского издания карточка проверяется повторно", () => {
  const { book, metadata, cover } = verifiedEdition();
  metadata.verification.latestRussianEditionConfirmed = false;
  const result = currentEditionStatus(book, metadata, cover, 180, new Date("2026-08-03"));
  assert.equal(result.current, false);
  assert.ok(result.reasons.includes("newer_russian_edition_not_ruled_out"));
});

test("заполненные поля и HTTPS-обложка без доказательств больше не дают already_current", () => {
  const { book, metadata, cover } = verifiedEdition();
  delete metadata.verification;
  delete cover.verification;
  const result = currentEditionStatus(book, metadata, cover, 180, new Date("2026-08-03"));
  assert.equal(result.current, false);
  assert.ok(result.reasons.includes("missing_current_tool_verification"));
  assert.ok(result.reasons.includes("cover_unverified"));
});

test("ошибка первого источника не блокирует обновление из следующего и повторный запуск идемпотентен", async () => {
  const root = await fixture();
  const sources = [
    { key: "broken", async search() { throw new Error("unavailable"); } },
    { key: "publisher", async search() { return [{
      sourceKey: "publisher", sourceName: "Издательство", sourceUrl: "https://publisher.example/book",
      sourceRecordId: "/book", sourcePriority: 100, officialPublisher: true,
      title: baseBook.title, authors: [baseBook.author], publisher: "Новое издательство",
      publicationYear: 2025, isbn13: "9785389272378", pages: 192, seriesName: "Муми-тролли",
      language: "ru", isRussianEdition: true, confidence: 0.99,
      cover: { official: true, url: "https://publisher.example/cover.jpg" },
    }]; } },
  ];
  const first = await runEnrichment({ root, sourceAdapters: sources, imageVerifier: async () => true, force: true, build: false });
  assert.equal(first.summary.updated, 1);
  assert.equal(first.summary.isbnChanged, 1);
  assert.equal(first.summary.officialCoversFound, 1);
  const metadata = JSON.parse(await readFile(join(root, "data/source/official-metadata-overrides.json"), "utf8"));
  assert.equal(metadata[0].publisher, "Новое издательство");
  assert.equal(metadata[0].enrichment.tool, "books:enrich");
  const second = await runEnrichment({ root, sourceAdapters: sources, imageVerifier: async () => true, build: false });
  assert.equal(second.summary.updated, 0);
  assert.equal(second.summary.skippedAsCurrent, 0);
  assert.equal(second.summary.updated, 0);
});

test("поиск не останавливается на первом официальном издании и сохраняет доказательство полного покрытия", async () => {
  const root = await fixture();
  let secondSourceCalled = false;
  const candidate = (sourceKey, publicationYear, isbn13) => ({
    sourceKey, sourceName: `Издательство ${sourceKey}`, sourceUrl: `https://${sourceKey}.example/book`,
    sourceRecordId: "/book", sourcePriority: 100, officialPublisher: true,
    title: baseBook.title, authors: [baseBook.author], publisher: `Издательство ${sourceKey}`,
    publicationYear, isbn13, pages: 192, language: "ru", isRussianEdition: true, confidence: 0.99,
    cover: { official: true, url: `https://${sourceKey}.example/cover.jpg` },
  });
  const sources = [
    { key: "older", coverageComplete: () => true, async search() { return [candidate("older", 2024, "9785171512385")]; } },
    { key: "newer", coverageComplete: () => true, async search() { secondSourceCalled = true; return [candidate("newer", 2026, "9785389272378")]; } },
  ];
  await runEnrichment({ root, sourceAdapters: sources, imageVerifier: async () => true, force: true, build: false });
  const metadata = JSON.parse(await readFile(join(root, "data/source/official-metadata-overrides.json"), "utf8"));
  assert.equal(secondSourceCalled, true);
  assert.equal(metadata[0].publicationYear, 2026);
  assert.equal(metadata[0].verification.latestRussianEditionConfirmed, true);
  assert.equal(metadata[0].verification.sourceSearchComplete, true);
});

test("официальная обложка принимается без ISBN при подтверждённых произведении, авторе и издательстве", async () => {
  const root = await fixture();
  const source = {
    key: "publisher", coverageComplete: () => true,
    async search() { return [{
      sourceKey: "publisher", sourceName: "Издательство", sourceUrl: "https://publisher.example/book",
      sourceRecordId: "/book", sourcePriority: 100, officialPublisher: true,
      title: baseBook.title, authors: [baseBook.author], publisher: "Издательство",
      publicationYear: 2026, pages: 192, language: "ru", isRussianEdition: true, confidence: 0.99,
      cover: { official: true, url: "https://publisher.example/cover.jpg" },
    }]; },
  };
  const result = await runEnrichment({ root, sourceAdapters: [source], imageVerifier: async () => true, force: true, missingCoverOnly: true, build: false });
  assert.equal(result.summary.processed, 1);
  assert.equal(result.summary.officialCoversFound, 1);
  const covers = JSON.parse(await readFile(join(root, "data/source/official-cover-overrides.json"), "utf8"));
  assert.equal(covers[0].cover.url, "https://publisher.example/cover.jpg");
  assert.equal(covers[0].cover.isbn13, undefined);
});

test("валидация обнаруживает дубли и изменение редакционных полей", () => {
  const before = new Map([[baseBook.id, {
    id: baseBook.id, slug: baseBook.slug, title: baseBook.title, author: baseBook.author,
    shortDescription: baseBook.shortDescription, fullDescription: undefined,
    whyRecommended: baseBook.whyRecommended, ageMin: 7, ageMax: 12, readingMode: "both",
    genres: ["Сказки"], themes: ["Семья"], moods: [], status: "published",
  }]]);
  const changed = [{ ...baseBook, whyRecommended: "Изменено" }, { ...baseBook }];
  const result = validateCatalog(changed, before);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.reason === "protected_field_changed"));
  assert.ok(result.errors.some((error) => error.reason === "duplicate"));
});
