import assert from "node:assert/strict";
import test from "node:test";
import { buildStagingBooks, canonicalTitleKey, cleanAuthor, cleanTitle, extractIsbns, isAuthorCreator, isTechnicalDescription, isValidIsbn, parseSruDublinCore, seededSample } from "./pipeline.mjs";

const xml = `<?xml version="1.0"?><srw:records xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<srw:record><srw:recordData><dc:title>Le livre / Alice Exemple</dc:title><dc:creator>Exemple, Alice (1980-....). Auteur du texte</dc:creator><dc:description>Texte intégral de présentation.</dc:description><dc:description>Collection : Jeunesse</dc:description><dc:subject>Amitié</dc:subject><dc:identifier>ISBN 9781234567890</dc:identifier><dc:language>fre</dc:language><dc:type>texte imprimé</dc:type></srw:recordData><srw:recordIdentifier>ark:/12148/cb000000001</srw:recordIdentifier></srw:record>
<srw:record><srw:recordData><dc:title>Le livre</dc:title><dc:creator>Exemple, Alice. Auteur du texte</dc:creator><dc:identifier>ISBN 123456789X</dc:identifier><dc:language>fre</dc:language><dc:type>printed text</dc:type></srw:recordData><srw:recordIdentifier>ark:/12148/cb000000002</srw:recordIdentifier></srw:record>
</srw:records>`;

test("parses Dublin Core and preserves descriptions exactly", () => {
  const records = parseSruDublinCore(xml);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].descriptions, ["Texte intégral de présentation.", "Collection : Jeunesse"]);
  assert.equal(records[0].ark, "ark:/12148/cb000000001");
});

test("normalizes display title and author without inventing content", () => {
  assert.equal(cleanTitle("Le livre / Alice Exemple"), "Le livre");
  assert.equal(cleanAuthor("Exemple, Alice (1980-....). Auteur du texte"), "Alice Exemple");
  assert.equal(isTechnicalDescription("Collection : Jeunesse"), true);
  assert.equal(isTechnicalDescription("Variante(s) de titre : Collection Martine"), true);
  assert.equal(isTechnicalDescription("[Exposition. Paris. 2020]"), true);
  assert.equal(isTechnicalDescription("Texte intégral de présentation."), false);
  assert.equal(isAuthorCreator("Exemple, Alice. Auteur du texte"), true);
  assert.equal(isAuthorCreator("Exemple, Bob. Illustrateur"), false);
});

test("splits different titles that BnF associates with one work", () => {
  const records = parseSruDublinCore(xml).map((record, index) => index === 1 ? { ...record, titles: ["Un autre livre"] } : record);
  const result = buildStagingBooks({
    manifestationsByWork: new Map([["http://data.bnf.fr/work/series", records.map((record) => record.ark)]]),
    recordsByArk: new Map(records.map((record) => [record.ark, record])),
    retrievedAt: "2026-07-22T00:00:00.000Z",
    maxBooks: 3000,
  });
  assert.deepEqual(result.books.map((book) => book.title).sort(), ["Le livre", "Un autre livre"]);
});

test("extracts ISBNs from source identifiers", () => {
  assert.deepEqual(extractIsbns(["ISBN 978-2-07-054193-5", "ISBN 978-1-234-56789-0", "EAN 9782203101296"]), ["9782070541935"]);
  assert.equal(isValidIsbn("9782070541935"), true);
  assert.equal(isValidIsbn("9781234567890"), false);
  assert.equal(canonicalTitleKey("Peter Pan (Nouv. présentation)"), canonicalTitleKey("Peter Pan"));
});

test("combines editions into one book and leaves editorial fields absent", () => {
  const records = parseSruDublinCore(xml);
  const result = buildStagingBooks({
    manifestationsByWork: new Map([["http://data.bnf.fr/work/1", ["ark:/12148/cb000000001", "ark:/12148/cb000000002"]]]),
    recordsByArk: new Map(records.map((record) => [record.ark, record])),
    retrievedAt: "2026-07-22T00:00:00.000Z",
    maxBooks: 3000,
  });
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].editions.length, 2);
  assert.equal(result.books[0].description, "Texte intégral de présentation.");
  assert.equal(result.books[0].descriptionProvenance.textUnmodified, true);
  assert.equal("age" in result.books[0], false);
  assert.equal("moods" in result.books[0], false);
  assert.equal("nenThemes" in result.books[0], false);
});

test("seeded sample is reproducible", () => {
  assert.deepEqual(seededSample([1, 2, 3, 4, 5], 3, 42), seededSample([1, 2, 3, 4, 5], 3, 42));
});
