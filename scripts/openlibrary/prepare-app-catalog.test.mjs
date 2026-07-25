import assert from "node:assert/strict";
import test from "node:test";
import { exclusionReason, normalizeMatch } from "./prepare-app-catalog.mjs";

test("normalizes Cyrillic and library transliteration to comparable text", () => {
  assert.equal(normalizeMatch("Чучело"), "chuchelo");
  assert.equal(normalizeMatch("Chuchelo"), "chuchelo");
});

test("excludes high-confidence academic records", () => {
  assert.equal(exclusionReason({ title: "Detskai︠a︡ literatura v kontekste kulʹtury", subjects: [] })?.code, "literary_research");
  assert.equal(exclusionReason({ title: "Khudozhestvennoe slovo v vospitanii deteĭ", subjects: [] })?.code, "teaching_methodology");
  assert.equal(exclusionReason({ title: "Skazki dlia detei", subjects: ["Juvenile fiction"] }), null);
});
