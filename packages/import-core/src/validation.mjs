import { ENTITY_LEVELS, VERIFICATION_STATUSES } from "./model.mjs";

function issue(entity, field, message) { return { entityId: entity?.id ?? null, entityLevel: entity?.entityLevel ?? null, field, message }; }

function validateSourcedValue(entity, field, issues) {
  const sourced = entity[field];
  if (!sourced || !Array.isArray(sourced.provenance) || sourced.provenance.length === 0) {
    issues.push(issue(entity, field, "Every imported field must have provenance"));
    return;
  }
  for (const provenance of sourced.provenance) {
    for (const required of ["source", "sourceRecordId", "retrievedAt", "license", "entityLevel", "verificationStatus"]) {
      if (provenance[required] === undefined || provenance[required] === null) issues.push(issue(entity, `${field}.provenance.${required}`, "Missing provenance value"));
    }
    if (!("rawValue" in provenance) || !("normalizedValue" in provenance)) issues.push(issue(entity, `${field}.provenance`, "Raw and normalized values are required"));
  }
}

export function validateEntity(entity) {
  const issues = [];
  if (!entity?.id) issues.push(issue(entity, "id", "Internal id is required"));
  if (!ENTITY_LEVELS.has(entity?.entityLevel)) issues.push(issue(entity, "entityLevel", "Unsupported entity level"));
  if (!VERIFICATION_STATUSES.has(entity?.verificationStatus)) issues.push(issue(entity, "verificationStatus", "Unsupported verification status"));
  if (!Array.isArray(entity?.identifiers) || entity.identifiers.length === 0) issues.push(issue(entity, "identifiers", "At least one source identifier is required"));
  const fields = entity?.entityLevel === "author"
    ? ["preferredName", "alternateNames"]
    : entity?.entityLevel === "work"
      ? ["title", "originalTitle", "authorRefs", "importedSubjects"]
      : ["workRefs", "title", "authorRefs", "isbns", "publishers", "languages", "publicationYear", "pages", "translationOf"];
  for (const field of fields) validateSourcedValue(entity, field, issues);
  for (const annotation of entity?.annotations ?? []) {
    if (annotation.textWasModified !== false) issues.push(issue(entity, "annotations.textWasModified", "Imported annotation text must remain unchanged"));
    if (!annotation.source || !annotation.sourceRecordId || !annotation.retrievedAt || !annotation.licenseStatus || !annotation.publicUse) issues.push(issue(entity, "annotations", "Annotation provenance is incomplete"));
  }
  for (const cover of entity?.covers ?? []) {
    if (cover.locallyStored !== false) issues.push(issue(entity, "covers.locallyStored", "Import pipeline must not store cover files"));
    if (!cover.source || !cover.sourceRecordId || !cover.retrievedAt || !cover.licenseStatus) issues.push(issue(entity, "covers", "Cover provenance is incomplete"));
  }
  return issues;
}

export function validateBatch(entities) {
  const issues = entities.flatMap(validateEntity);
  return { valid: issues.length === 0, issues };
}

