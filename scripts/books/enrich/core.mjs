import { createHash } from "node:crypto";

export const TOOL_NAME = "books:enrich";
export const TOOL_VERSION = "1.1.1";

export function normalize(value = "") {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ru")
    .replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

export function titleTokens(value = "") {
  return normalize(value).split(" ").filter((token) => token.length >= 3);
}

export function workTitles(book = {}) {
  return [...new Set([
    book.title,
    book.originalTitle,
    ...(book.alternativeTitles ?? []),
    ...(book.sourceMetadata?.alternativeTitles ?? []),
  ].map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function titleScore(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.96;
  const leftSet = new Set(titleTokens(a));
  const rightSet = new Set(titleTokens(b));
  const common = [...leftSet].filter((token) => rightSet.has(token)).length;
  return common / Math.max(1, leftSet.size);
}

export function authorSurnames(value = "") {
  return String(value).split(/\s*;\s*/u).map((name) => {
    const parts = normalize(name).split(" ").filter((token) => token.length >= 3);
    return parts.at(-1);
  }).filter(Boolean);
}

export function authorMatches(bookAuthor, candidateAuthors = [], evidence = "") {
  const haystack = normalize([...candidateAuthors, evidence].join(" "));
  const surnames = authorSurnames(bookAuthor);
  return surnames.length > 0 && surnames.every((surname) => haystack.includes(surname));
}

export function authorMatchesNearTitle(bookAuthor, sourceTitle, evidence = "") {
  const haystack = normalize(evidence);
  const title = normalize(sourceTitle);
  const titleIndex = title ? haystack.indexOf(title) : -1;
  if (titleIndex < 0) return false;
  const nearby = haystack.slice(Math.max(0, titleIndex - 500), titleIndex + title.length + 1_500);
  return authorMatches(bookAuthor, [], nearby);
}

export function validIsbn13(value) {
  const isbn = String(value ?? "").replace(/\D/gu, "");
  if (!/^97[89]\d{10}$/u.test(isbn)) return false;
  const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

export function normalizedIsbn(value) {
  const isbn = String(value ?? "").replace(/\D/gu, "");
  return validIsbn13(isbn) ? isbn : undefined;
}

export function validYear(value, now = new Date()) {
  const year = Number(String(value ?? "").match(/(?:19|20)\d{2}/u)?.[0]);
  return Number.isInteger(year) && year >= 1900 && year <= now.getFullYear() + 1 ? year : undefined;
}

export function validPages(value) {
  const pages = Number(String(value ?? "").match(/\d{1,4}/u)?.[0]);
  return Number.isInteger(pages) && pages >= 4 && pages <= 2000 ? pages : undefined;
}

export function normalizeLanguage(value) {
  const language = normalize(Array.isArray(value) ? value[0] : value);
  if (/^(?:ru|rus|russian|рус|русский)$/u.test(language)) return "ru";
  if (/^(?:en|eng|english|английский)$/u.test(language)) return "en";
  return language || undefined;
}

export function sameWork(book, candidate) {
  const score = Math.max(...workTitles(book).map((title) => titleScore(title, candidate.title)), 0);
  const authorMatch = authorMatches(book.author, candidate.authors, candidate.evidenceText);
  const bookTitle = normalize(book.title);
  const candidateTitle = normalize(candidate.title);
  const collectionExpansion = /(?:^| )(?:и другие|все|сборник)(?: |$)/u.test(candidateTitle)
    && !/(?:^| )(?:и другие|все|сборник)(?: |$)/u.test(bookTitle);
  return { matches: score >= 0.78 && authorMatch && !collectionExpansion, titleScore: score, authorMatch, collectionExpansion };
}

export function candidateCompleteness(candidate) {
  return [candidate.isbn13, candidate.publisher, candidate.publicationYear, candidate.pages, candidate.seriesName, candidate.language, candidate.cover?.url]
    .filter((value) => value !== undefined && value !== "").length;
}

export function chooseBestCandidate(book, candidates) {
  return candidates.map((candidate) => ({ candidate, work: sameWork(book, candidate) }))
    .filter(({ candidate, work }) => work.matches && (candidate.confidence ?? 0) >= 0.86)
    .sort((left, right) => (
      Number(Boolean(right.candidate.isRussianEdition)) - Number(Boolean(left.candidate.isRussianEdition))
      || (right.candidate.publicationYear ?? 0) - (left.candidate.publicationYear ?? 0)
      || Number(Boolean(right.candidate.officialPublisher)) - Number(Boolean(left.candidate.officialPublisher))
      || candidateCompleteness(right.candidate) - candidateCompleteness(left.candidate)
      || (right.candidate.sourcePriority ?? 0) - (left.candidate.sourcePriority ?? 0)
      || (right.candidate.confidence ?? 0) - (left.candidate.confidence ?? 0)
    ))[0];
}

export function stableKey(...parts) {
  return createHash("sha256").update(parts.map(normalize).join("|")).digest("hex").slice(0, 24);
}

export function daysSince(value, now = new Date()) {
  const date = new Date(value ?? 0);
  return Number.isFinite(date.getTime()) ? (now.getTime() - date.getTime()) / 86_400_000 : Infinity;
}

export function publisherMatches(left, right) {
  const clean = (value) => normalize(value)
    .replace(/\b(?:издательство|издательская|группа|издательский|дом)\b/gu, " ")
    .replace(/\s+/gu, " ").trim();
  const a = clean(left);
  const b = clean(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export function legacyCurrentEditionStatus(book, metadataOverride, coverOverride, freshnessDays, now = new Date()) {
  if (metadataOverride?.enrichment?.tool === TOOL_NAME && daysSince(metadataOverride.verifiedAt, now) <= freshnessDays) return true;
  const recentEnough = Number.isInteger(book.publicationYear) && book.publicationYear >= now.getFullYear() - 5;
  const complete = Boolean(book.publisher && validIsbn13(book.isbn13) && validPages(book.pages) && book.language);
  const cover = coverOverride?.cover ?? book.cover;
  const verifiedCover = Boolean(cover?.kind === "external" && cover.url?.startsWith("https://") && cover.sourcePageUrl?.startsWith("https://"));
  return recentEnough && complete && verifiedCover;
}

export function currentEditionStatus(book, metadataOverride, coverOverride, freshnessDays, now = new Date()) {
  const reasons = [];
  if (!metadataOverride) {
    reasons.push("missing_verified_metadata");
    if (!coverOverride?.verification) reasons.push("missing_verified_cover");
    return { current: false, reasons };
  }
  const verification = metadataOverride?.verification;
  const cover = coverOverride?.cover;
  const coverVerification = coverOverride?.verification;
  const work = metadataOverride ? sameWork(book, {
    title: metadataOverride.officialTitle,
    authors: metadataOverride.officialAuthors,
  }) : { matches: false, titleScore: 0, authorMatch: false };

  if (metadataOverride?.enrichment?.tool !== TOOL_NAME || metadataOverride?.enrichment?.version !== TOOL_VERSION || !verification) reasons.push("missing_current_tool_verification");
  if (daysSince(metadataOverride?.verifiedAt, now) > freshnessDays) reasons.push("verification_expired");
  if (!metadataOverride?.sourceUrl?.startsWith("https://") || !metadataOverride?.sourceRecordId) reasons.push("source_record_unverified");
  if (verification && (!verification.trustedSource || !["official_publisher", "trusted_bibliographic", "editorial_source", "library_catalog"].includes(verification.sourceKind))) reasons.push("source_not_trusted");
  if (work.titleScore < 0.78 || work.collectionExpansion || (verification && !verification.titleMatched)) reasons.push("work_title_mismatch");
  if (!work.authorMatch || !metadataOverride?.officialAuthors?.length || (verification && !verification.authorMatched)) reasons.push("author_mismatch");
  if (!validIsbn13(book.isbn13) || metadataOverride?.isbn13 !== book.isbn13 || (verification && !verification.isbnMatched)) reasons.push("isbn_mismatch");
  if (!publisherMatches(book.publisher, metadataOverride?.publisher) || (verification && !verification.publisherMatched)) reasons.push("publisher_mismatch");
  if (!Number.isInteger(book.publicationYear) || metadataOverride?.publicationYear !== book.publicationYear || (verification && !verification.yearMatched)) reasons.push("publication_year_mismatch");
  if (!verification?.latestRussianEditionConfirmed || !verification?.sourceSearchComplete) reasons.push("newer_russian_edition_not_ruled_out");
  if (metadataOverride?.pages !== undefined && metadataOverride.pages !== book.pages) reasons.push("pages_mismatch");
  if (metadataOverride?.language && metadataOverride.language !== book.language) reasons.push("language_mismatch");
  if (!cover || cover.kind !== "external" || !cover.url?.startsWith("https://") || !cover.sourcePageUrl?.startsWith("https://") || !coverVerification?.imageVerified) reasons.push("cover_unverified");
  if (cover?.isbn13 !== metadataOverride?.isbn13 || cover?.sourcePageUrl !== metadataOverride?.sourceUrl || !coverVerification?.sameEdition) reasons.push("cover_edition_mismatch");
  if (coverVerification && (!coverVerification.titleMatched || !coverVerification.authorMatched)) reasons.push("cover_work_mismatch");
  if (daysSince(cover?.verifiedAt, now) > freshnessDays) reasons.push("cover_verification_expired");

  return { current: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function isCurrentEdition(book, metadataOverride, coverOverride, freshnessDays, now = new Date()) {
  return currentEditionStatus(book, metadataOverride, coverOverride, freshnessDays, now).current;
}

export function objectiveSnapshot(book) {
  return {
    id: book.id, slug: book.slug, title: book.title, author: book.author,
    shortDescription: book.shortDescription, fullDescription: book.fullDescription,
    whyRecommended: book.whyRecommended, ageMin: book.ageMin, ageMax: book.ageMax,
    readingMode: book.readingMode, genres: book.genres, themes: book.themes,
    moods: book.moods, status: book.status,
  };
}
