import assert from "node:assert/strict";
import test from "node:test";
import { assessFinalContent, enrichClassification } from "./finalize-app-catalog.mjs";

test("excludes an explicit study of children's literature", () => {
  const result = assessFinalContent({
    title: "История и критика детской литературы",
    sourceMetadata: { subjects: ["Children's literature -- History and criticism"] },
  });
  assert.equal(result.status, "excluded");
});

test("keeps a narrow but explicitly child-oriented nonfiction book", () => {
  const book = {
    title: "Самолёты",
    sourceMetadata: { languages: ["ru"], subjects: ["Airplanes", "Aeronautics", "Juvenile literature"] },
  };
  assert.equal(assessFinalContent(book).status, "keep");
  const classification = enrichClassification(book);
  assert.equal(classification.genres[0].value, "научно-популярная литература");
  assert.ok(classification.themes.some((item) => item.value === "техника"));
  assert.ok(classification.age);
});

test("uses broad safe app categories when child metadata is sparse", () => {
  const classification = enrichClassification({
    title: "Детская книга",
    sourceMetadata: { languages: ["ru"], subjects: [] },
  });
  assert.equal(classification.genres[0].value, "научно-популярная литература");
  assert.equal(classification.genres[0].method, "broad_safe_genre");
  assert.equal(classification.themes[0].value, "взросление");
  assert.equal(classification.themes[0].method, "broad_safe_theme");
});
