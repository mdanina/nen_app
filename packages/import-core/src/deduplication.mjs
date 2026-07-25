function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function groups(values, key) {
  const result = new Map();
  for (const value of values) {
    const identity = key(value);
    if (!identity) continue;
    const group = result.get(identity) ?? [];
    group.push(value);
    result.set(identity, group);
  }
  return [...result.entries()].filter(([, group]) => group.length > 1);
}

export function findMatchCandidates({ authors, works, editions }) {
  const authorNames = new Map(authors.map((author) => [author.id, normalizedText(author.preferredName.value)]));
  const exactSourceRecords = groups([...authors, ...works, ...editions], (entity) => entity.identifiers.map((id) => `${id.source}:${id.entityLevel}:${id.value}`).sort().join("|"));
  const sharedIsbn = groups(editions.flatMap((edition) => edition.isbns.value.filter((isbn) => isbn.valid).map((isbn) => ({ isbn: isbn.value, editionId: edition.id }))), (entry) => entry.isbn);
  const probableWorks = groups(works, (work) => {
    const authorsKey = work.authorRefs.value.map((id) => authorNames.get(id) ?? id).sort().join("|");
    const title = normalizedText(work.title.value);
    return title ? `${title}|${authorsKey}` : null;
  });
  const editionsByWork = new Map();
  for (const edition of editions) for (const workId of edition.workRefs.value) {
    const group = editionsByWork.get(workId) ?? [];
    group.push(edition);
    editionsByWork.set(workId, group);
  }
  return {
    policy: "report-only-no-automatic-merge",
    exactSourceRecordDuplicates: exactSourceRecords.map(([signature, entities]) => ({ signature, entityIds: entities.map((entity) => entity.id) })),
    sharedIsbnCandidates: sharedIsbn.map(([isbn, entries]) => ({ isbn, editionIds: entries.map((entry) => entry.editionId), action: "manual-review" })),
    probableWorkDuplicates: probableWorks.map(([signature, records]) => ({ signature, workIds: records.map((record) => record.id), action: "manual-review" })),
    multipleEditions: [...editionsByWork.entries()].filter(([, records]) => records.length > 1).map(([workId, records]) => ({ workId, editionIds: records.map((record) => record.id), classification: "different-editions-or-reissues" })),
    explicitTranslations: editions.filter((edition) => edition.translationOf.value).map((edition) => ({ editionId: edition.id, translationOf: edition.translationOf.value })),
  };
}

