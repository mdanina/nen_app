import { createHash } from "node:crypto";

export const ENTITY_LEVELS = new Set(["author", "work", "edition"]);
export const VERIFICATION_STATUSES = new Set(["unreviewed", "machine-validated", "manually-verified", "rejected"]);

export function internalSourceId(source, entityLevel, sourceRecordId) {
  const digest = createHash("sha256").update(`${source}:${entityLevel}:${sourceRecordId}`).digest("hex").slice(0, 24);
  return `nen-import:${entityLevel}:${digest}`;
}

export function sourceIdentifier(source, entityLevel, sourceRecordId) {
  return { source, entityLevel, value: sourceRecordId, sourceRecordId };
}

export function sourcedValue({ descriptor, sourceRecordId, entityLevel, retrievedAt, rawValue, normalizedValue, verificationStatus = "unreviewed" }) {
  return {
    value: normalizedValue,
    provenance: [{
      source: descriptor.id,
      sourceRecordId,
      retrievedAt,
      license: descriptor.license,
      entityLevel,
      rawValue: rawValue === undefined ? null : rawValue,
      normalizedValue: normalizedValue === undefined ? null : normalizedValue,
      verificationStatus,
    }],
  };
}

export function annotationRecord({ descriptor, sourceRecordId, entityLevel, entityId, retrievedAt, text, origin = null, publicUse = "unknown" }) {
  return {
    id: internalSourceId(descriptor.id, "annotation", `${sourceRecordId}:${entityLevel}`),
    entityLevel,
    entityId,
    text,
    source: descriptor.id,
    sourceRecordId,
    retrievedAt,
    licenseStatus: descriptor.license,
    origin,
    publicUse,
    verificationStatus: "unreviewed",
    textWasModified: false,
  };
}

export function coverReference({ descriptor, sourceRecordId, entityLevel, entityId, retrievedAt, sourceCoverId, url, origin = null, publicUse = "unknown" }) {
  return {
    id: internalSourceId(descriptor.id, "cover", `${sourceRecordId}:${sourceCoverId ?? url ?? "unknown"}`),
    entityLevel,
    entityId,
    source: descriptor.id,
    sourceRecordId,
    sourceCoverId: sourceCoverId === undefined ? undefined : String(sourceCoverId),
    url,
    retrievedAt,
    licenseStatus: descriptor.license,
    origin,
    publicUse,
    locallyStored: false,
  };
}

export function bibliographicCandidate(work, editions) {
  return {
    id: `book-candidate:${work.id}`,
    workId: work.id,
    editionIds: editions.filter((edition) => edition.workRefs.value.includes(work.id)).map((edition) => edition.id),
    bibliographicStatus: "candidate",
    editorialRecordId: null,
    productionStatus: "not-connected",
  };
}
