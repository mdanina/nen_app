import { normalize, objectiveSnapshot, validIsbn13 } from "./core.mjs";

export function validateCatalog(catalog, beforeById = new Map()) {
  const errors = [];
  const ids = new Set();
  const slugs = new Set();
  const isbns = new Set();
  const works = new Set();
  for (const book of catalog) {
    for (const field of ["id", "slug", "title", "author", "shortDescription", "whyRecommended"]) {
      if (typeof book[field] !== "string" || !book[field].trim()) errors.push({ id: book.id, field, reason: "required_field_missing" });
    }
    if (ids.has(book.id)) errors.push({ id: book.id, field: "id", reason: "duplicate" });
    if (slugs.has(book.slug)) errors.push({ id: book.id, field: "slug", reason: "duplicate" });
    ids.add(book.id); slugs.add(book.slug);
    if (book.isbn13) {
      if (!validIsbn13(book.isbn13)) errors.push({ id: book.id, field: "isbn13", reason: "invalid" });
      if (isbns.has(book.isbn13)) errors.push({ id: book.id, field: "isbn13", reason: "duplicate" });
      isbns.add(book.isbn13);
    }
    const work = `${normalize(book.title)}|${normalize(book.author)}`;
    if (works.has(work)) errors.push({ id: book.id, field: "title_author", reason: "duplicate" });
    works.add(work);
    if (book.cover?.kind === "external") {
      if (!book.cover.url?.startsWith("https://")) errors.push({ id: book.id, field: "cover.url", reason: "unsafe_url" });
      if (!book.cover.sourcePageUrl?.startsWith("https://")) errors.push({ id: book.id, field: "cover.sourcePageUrl", reason: "unsafe_url" });
      if (book.cover.isbn13 !== book.isbn13) errors.push({ id: book.id, field: "cover.isbn13", reason: "edition_mismatch" });
    }
    const before = beforeById.get(book.id);
    if (before && JSON.stringify(objectiveSnapshot(book)) !== JSON.stringify(before)) {
      errors.push({ id: book.id, field: "editorial", reason: "protected_field_changed" });
    }
  }
  for (const id of beforeById.keys()) if (!ids.has(id)) errors.push({ id, field: "catalog", reason: "book_removed" });
  return { valid: errors.length === 0, errors };
}

