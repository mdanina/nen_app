import assert from "node:assert/strict";
import test from "node:test";
import { classifyCatalogBook } from "./fiction-classifier.mjs";

function book(overrides = {}) {
  return {
    id: "ol-test",
    title: "Тестовая книга",
    genres: ["реалистическая проза"],
    bookFormats: [],
    sourceMetadata: { subjects: ["Juvenile fiction"] },
    ...overrides,
  };
}

test("настоящий атлас исключается", () => {
  const result = classifyCatalogBook(book({
    title: "Атлас России",
    genres: ["научно-популярная литература"],
    bookFormats: ["иллюстрированный нон-фикшн"],
    sourceMetadata: { subjects: ["Atlases", "Maps for children", "Juvenile literature"] },
  }));
  assert.equal(result.decision, "exclude");
  assert.equal(result.type, "educational_reference_or_atlas");
});

test("художественная книга со словом «атлас» не исключается автоматически", () => {
  const result = classifyCatalogBook(book({
    title: "Облачный атлас",
    genres: ["роман"],
    sourceMetadata: { subjects: ["Fiction", "Novels"] },
  }));
  assert.equal(result.decision, "keep");
});

test("художественная повесть с историческим subject сохраняется", () => {
  const result = classifyCatalogBook(book({
    title: "На заре Руси",
    genres: ["реалистическая проза"],
    bookFormats: ["иллюстрированный нон-фикшн"],
    sourceMetadata: { subjects: ["History", "Juvenile fiction"] },
  }));
  assert.notEqual(result.decision, "exclude");
});

test("библиография детской литературы исключается", () => {
  const result = classifyCatalogBook(book({
    title: "Новые детские книги",
    genres: ["научно-популярная литература"],
    sourceMetadata: { subjects: ["Children's literature, Russian", "Bibliography"] },
  }));
  assert.equal(result.decision, "exclude");
});

test("final catalog decisions exclude the six confirmed non-fiction or adult records", () => {
  const expected = new Map([
    ["ol-ol5130923w", "regional_geography_textbook"],
    ["ol-ol2300595w", "historical_educational_nonfiction"],
    ["ol-ol7337767w", "documentary_naturalist_notes"],
    ["ol-ol13749469w", "early_learning_educational_book"],
    ["ol-ol32427229w", "adult_literary_collection"],
    ["ol-ol4715673w", "historical_material_culture_nonfiction"],
  ]);

  for (const [id, type] of expected) {
    const result = classifyCatalogBook(book({ id }));
    assert.equal(result.decision, "exclude");
    assert.equal(result.type, type);
  }
});
