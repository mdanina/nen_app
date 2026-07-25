import assert from "node:assert/strict";
import test from "node:test";
import {
  criticalBlockers,
  localizeAuthor,
  localizeTitle,
  secondPassClassification,
} from "./reevaluate-publish-ready.mjs";

test("existing classifier does not require optional mood, cover, ISBN or series", () => {
  const book = {
    title: "Skazki pro drakonov",
    author: "Vladimir Boiarinov",
    isbn13: null,
    cover: { kind: "placeholder", rightsStatus: "not-required" },
    sourceMetadata: {
      languages: ["ru"],
      subjects: ["Fairy tales", "Dragons -- Folklore -- Juvenile literature"],
      series: [],
      isbns: [],
      coverIds: [],
    },
  };
  const classification = secondPassClassification(book);
  assert.ok(classification.age);
  assert.ok(classification.genres.length);
  assert.ok(classification.themes.length);
  assert.deepEqual(classification.moods, []);
  assert.deepEqual(criticalBlockers(book, classification), ["stable_id"]);
});

test("localizes clear Russian library transliteration", () => {
  assert.equal(localizeTitle("Sinie listʹi︠a︡").value, "Синие листья");
  assert.equal(localizeTitle("Detskai︠a︡ literatura").value, "Детская литература");
  assert.equal(localizeAuthor("Dmitriĭ Emet͡s").value, "Дмитрий Емец");
});

test("does not invent a Russian title for a foreign-language title", () => {
  assert.equal(localizeTitle("Gulliver's Travels").status, "review");
  assert.equal(localizeAuthor("Jonathan Swift").status, "review");
});
