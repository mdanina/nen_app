import test from "node:test";
import assert from "node:assert/strict";
import { buildBookRecommendation, isGeneratedRecommendation } from "./book-recommendation.mjs";

const base = {
  id: "grammar-check",
  ageMin: 13,
  ageMax: 15,
  readingMode: "independent",
  genres: ["реалистическая проза"],
  themes: ["семья", "природа"],
};

test("распознаёт обе прежние версии автотекста", () => {
  assert.equal(isGeneratedRecommendation("Подойдёт читателям 7–9 лет, которым интересна тема «семья». Подойдёт и для самостоятельного, и для совместного чтения."), true);
  assert.equal(isGeneratedRecommendation("Подойдёт читателям 7–9 лет, которым нравятся сказка и книги про семья и природа."), true);
  assert.equal(isGeneratedRecommendation("Редакционная рекомендация о конкретной книге."), false);
});

test("склоняет жанры и темы в рекомендации", () => {
  const values = Array.from({ length: 30 }, (_, index) => buildBookRecommendation({ ...base, id: `grammar-${index}` }, { force: true }));
  assert.ok(values.some((value) => value.includes("реалистическую прозу")));
  assert.ok(values.some((value) => value.includes("о семье и природе")));
  assert.ok(values.some((value) => value.includes("темы семьи и природы")));
  assert.ok(values.every((value) => !value.includes("про семья") && !value.includes("нравятся реалистическая проза")));
  assert.ok(new Set(values).size >= 3);
});

test("грамотно использует новые тематические фильтры", () => {
  const values = Array.from({ length: 30 }, (_, index) => buildBookRecommendation({
    ...base,
    id: `new-themes-${index}`,
    themes: ["братья и сёстры", "первая любовь", "эмоции"],
  }, { force: true }));
  assert.ok(values.some((value) => value.includes("о братьях и сёстрах, первой любви и эмоциях")));
  assert.ok(values.some((value) => value.includes("темы братьев и сестёр, первой любви и эмоций")));
  assert.ok(values.every((value) => !value.includes("о братья и сёстры")));
});

test("не заменяет редакционный текст", () => {
  const editorial = "Редакционная рекомендация о конкретной книге.";
  assert.equal(buildBookRecommendation({ ...base, whyRecommended: editorial }), editorial);
});
