import assert from "node:assert/strict";
import test from "node:test";
import { annotationRecord, coverReference, defineAdapter, sourcedValue, validateEntity } from "./index.mjs";

const descriptor = {
  id: "test-source", displayName: "Test", homepage: "https://example.test",
  license: { code: "unknown", name: "Unknown", metadataReuse: "unknown", annotationReuse: "unknown", coverReuse: "unknown", attributionRequired: "unknown" },
};

test("adapter contract is source-neutral", () => {
  const adapter = defineAdapter({ descriptor, read: async () => ({ records: [], errors: [] }), normalize: (record) => record });
  assert.equal(adapter.descriptor.id, "test-source");
});

test("every imported field retains raw and normalized provenance", () => {
  const field = sourcedValue({ descriptor, sourceRecordId: "record-1", entityLevel: "author", retrievedAt: "2026-07-21T00:00:00.000Z", rawValue: "  Name ", normalizedValue: "Name" });
  assert.equal(field.provenance[0].rawValue, "  Name ");
  assert.equal(field.provenance[0].normalizedValue, "Name");
  const missing = sourcedValue({ descriptor, sourceRecordId: "record-1", entityLevel: "author", retrievedAt: "2026-07-21T00:00:00.000Z", rawValue: undefined, normalizedValue: null });
  assert.equal(missing.provenance[0].rawValue, null);
});

test("annotation text remains exact and public use stays unknown", () => {
  const annotation = annotationRecord({ descriptor, sourceRecordId: "record-1", entityLevel: "work", entityId: "work-1", retrievedAt: "2026-07-21T00:00:00.000Z", text: " Text\nunchanged " });
  assert.equal(annotation.text, " Text\nunchanged ");
  assert.equal(annotation.textWasModified, false);
  assert.equal(annotation.publicUse, "unknown");
});

test("cover reference never stores a local image", () => {
  const cover = coverReference({ descriptor, sourceRecordId: "record-1", entityLevel: "edition", entityId: "edition-1", retrievedAt: "2026-07-21T00:00:00.000Z", sourceCoverId: "42", url: "https://example.test/42.jpg" });
  assert.equal(cover.locallyStored, false);
});

test("validation rejects annotations or covers that violate import policy", () => {
  const entity = {
    id: "author-1", entityLevel: "author", identifiers: [{ source: "test-source", entityLevel: "author", value: "1", sourceRecordId: "1" }],
    preferredName: sourcedValue({ descriptor, sourceRecordId: "1", entityLevel: "author", retrievedAt: "2026-07-21T00:00:00.000Z", rawValue: "Name", normalizedValue: "Name" }),
    alternateNames: sourcedValue({ descriptor, sourceRecordId: "1", entityLevel: "author", retrievedAt: "2026-07-21T00:00:00.000Z", rawValue: [], normalizedValue: [] }),
    verificationStatus: "unreviewed",
  };
  assert.deepEqual(validateEntity(entity), []);
});
