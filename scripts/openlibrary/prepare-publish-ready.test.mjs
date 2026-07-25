import assert from "node:assert/strict";
import test from "node:test";
import {
  assessExcludedTopic,
  assessSensitiveReview,
  assessSuitability,
  classifyAge,
  deduplicateDrafts,
  matchOfficialRegistry,
  normalizeMatch,
} from "./prepare-publish-ready.mjs";

const draft = (overrides = {}) => ({
  id: "ol-test",
  slug: "test",
  title: "Skazki pro drakonov",
  author: "Test Author",
  isbn13: "9781234567897",
  sourceMetadata: {
    workId: "/works/OL1W",
    workIds: ["/works/OL1W"],
    isbns: ["9781234567897"],
    subjects: ["Fairy tales", "Dragons -- Folklore -- Juvenile literature"],
    sourceDescription: null,
    ...overrides.sourceMetadata,
  },
  ...overrides,
});

test("normalizes Cyrillic and library transliteration consistently", () => {
  assert.equal(normalizeMatch("Чучело"), "chuchelo");
  assert.equal(normalizeMatch("Chuchelo"), "chuchelo");
});

test("requires explicit child-audience evidence", () => {
  assert.equal(assessSuitability(draft()).status, "suitable");
  assert.equal(assessSuitability(draft({ sourceMetadata: { subjects: ["Fiction"] } })).status, "incomplete");
});

test("excludes academic records only with strong evidence", () => {
  const result = assessSuitability(draft({
    title: "Istoriia detskoi literatury",
    sourceMetadata: { subjects: ["Children's literature -- History and criticism", "Bibliography"] },
  }));
  assert.equal(result.status, "excluded");
  assert.ok(result.confidence >= 0.9);
});

test("does not exclude an explicitly humorous children's exercise book as a textbook", () => {
  const result = assessSuitability(draft({
    title: "Zadachnik po fizike",
    sourceMetadata: { subjects: ["Physics", "Problems, exercises", "Juvenile literature"], sourceDescription: "A book of funny physics experiments." },
  }));
  assert.equal(result.status, "suitable");
});

test("routes a single excluded-topic signal to review and multiple fields to exclusion", () => {
  assert.equal(assessExcludedTopic(draft({ sourceMetadata: { subjects: ["Gay youth -- Fiction", "Juvenile fiction"] } })).status, "review");
  assert.equal(assessExcludedTopic(draft({ title: "Gay youth stories", sourceMetadata: { subjects: ["Gay youth -- Fiction", "Juvenile fiction"] } })).status, "excluded");
});

test("routes high-confidence sensitive topics to editorial review", () => {
  assert.equal(assessSensitiveReview(draft({ sourceMetadata: { subjects: ["Suicide -- Juvenile fiction", "Young Adult"] } })).status, "review");
  assert.equal(assessSensitiveReview(draft()).status, "clear");
});

test("age classification uses explicit source audience signals", () => {
  assert.deepEqual(classifyAge(draft({ sourceMetadata: { subjects: ["Board books", "Juvenile literature"] } })).value, [0, 3]);
  assert.deepEqual(classifyAge(draft({ sourceMetadata: { subjects: ["Young Adult", "Fiction"] } })).value, [12, 17]);
});

test("official registry requires an exact full-name match", () => {
  const registry = { verified: true, physicalPersons: [{ officialName: "Иван Иванов", aliases: ["Ivan Ivanov"] }] };
  assert.equal(matchOfficialRegistry("Ivan Ivanov", registry).status, "match");
  assert.equal(matchOfficialRegistry("Пётр Иванов", registry).status, "clear");
});

test("an unavailable official registry is reported without a false match", () => {
  assert.equal(matchOfficialRegistry("Any Author", null).status, "unavailable");
});

test("deduplication preserves editorial record and merges imported editions", () => {
  const production = [{ id: "existing", title: "Skazki", author: "Test Author", isbn13: "9780000000002", sourceMetadata: {} }];
  const first = draft({ id: "one", title: "Skazki", isbn13: "9780000000002" });
  const second = draft({ id: "two", title: "Other", isbn13: "9781111111113", sourceMetadata: { workId: "/works/OL2W", workIds: ["/works/OL2W"], isbns: ["9781111111113"], subjects: ["Juvenile fiction"] } });
  const third = draft({ id: "three", title: "Other", isbn13: "9781111111113", sourceMetadata: { workId: "/works/OL3W", workIds: ["/works/OL3W"], isbns: ["9781111111113"], subjects: ["Juvenile fiction"] } });
  const result = deduplicateDrafts([first, second, third], production);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.duplicates.filter((item) => item.type === "existing_editorial").length, 1);
  assert.equal(result.duplicates.filter((item) => item.type === "imported_merge").length, 1);
});

test("deduplication merges high-confidence title variants with the same author", () => {
  const first = draft({ id: "one", title: "Istoriia Rossii v rasskazakh dlia detei", author: "A. O. Ishimova", isbn13: null, sourceMetadata: { workId: "/works/OL10W", workIds: ["/works/OL10W"], isbns: [], subjects: ["Juvenile literature"] } });
  const second = draft({ id: "two", title: "Istoriia Rossii v razskazakh dlia detei", author: "Aleksandra Ishimova", isbn13: null, sourceMetadata: { workId: "/works/OL11W", workIds: ["/works/OL11W"], isbns: [], subjects: ["Juvenile literature"] } });
  const result = deduplicateDrafts([first, second], []);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.duplicates[0].method, "fuzzy_title_author");
});
