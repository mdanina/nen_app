import { createHash } from "node:crypto";

export const TOOL_NAME = "books:enrich";
export const TOOL_VERSION = "1.1.1";

export function normalize(value = "") {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ru")
    .replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

const russianLatin = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia" };
export function transliterateRussian(value = "") {
  return [...normalize(value)].map((letter) => russianLatin[letter] ?? letter).join("").replace(/\s+/gu, " ").trim();
}

export function titleTokens(value = "") {
  return normalize(value).split(" ").filter((token) => token.length >= 3);
}

export function workTitles(book = {}) {
  const supplied = [
    book.title,
    book.originalTitle,
    ...(book.alternativeTitles ?? []),
    ...(book.sourceMetadata?.alternativeTitles ?? []),
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  const compactAliases = supplied.flatMap((title) => {
    const aliases = [];
    const firstListedWork = title.split(/\s*;\s*/u)[0]?.trim();
    const leadingWork = title.split(/\s*,\s*(?:о|или)\s+/iu)[0]?.trim();
    const withoutCollectionTail = title.replace(/\s+(?:и\s+)?друг(?:ие|ая|ой)\s+(?:истории|сказки|рассказы|произведения).*$/iu, "").trim();
    for (const alias of [firstListedWork, leadingWork, withoutCollectionTail]) {
      if (alias && alias !== title && titleTokens(alias).length >= 2) aliases.push(alias);
    }
    return aliases;
  });
  const titles = [...new Set([...supplied, ...compactAliases])];
  return [...new Set([...titles, ...titles.map(transliterateRussian)])];
}

export function titleScore(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.96;
  const leftSet = new Set(titleTokens(a));
  const rightSet = new Set(titleTokens(b));
  const oneEditApart = (first, second) => {
    if (first === second) return true;
    if (Math.min(first.length, second.length) < 3 || Math.abs(first.length - second.length) > 1) return false;
    let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let i = 1; i <= first.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= second.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(first[i - 1] !== second[j - 1]));
      previous = current;
    }
    return previous[second.length] <= 1;
  };
  const common = [...leftSet].filter((token) => [...rightSet].some((candidate) => oneEditApart(token, candidate))).length;
  return common / Math.max(1, leftSet.size);
}

export function authorSurnames(value = "") {
  return String(value).split(/\s*;\s*/u).map((name) => {
    const suffixes = new Set(["младшии", "старшии", "junior", "senior"]);
    const parts = normalize(name).split(" ").filter((token) => token.length >= 3 && !suffixes.has(token));
    return parts.at(-1);
  }).filter(Boolean);
}

export function authorMatches(bookAuthor, candidateAuthors = [], evidence = "") {
  const haystack = normalize([...candidateAuthors, evidence].join(" "));
  const latinHaystack = transliterateRussian(haystack);
  const surnames = authorSurnames(bookAuthor);
  const candidateSurnames = authorSurnames(candidateAuthors.join(";"));
  const signature = (value) => transliterateRussian(value)
    .replace(/shch|zh|kh|ch|sh|ts/gu, (part) => ({ shch: "s", zh: "s", kh: "h", ch: "c", sh: "s", ts: "c" })[part])
    .replace(/th/gu, "t").replace(/[zc]/gu, "s").replace(/w/gu, "v").replace(/[aeiouy]/gu, "").replace(/(.)\1+/gu, "$1");
  const nearSignature = (left, right) => {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.abs(left.length - right.length) > 1) return false;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(left[i - 1] !== right[j - 1]));
      previous = current;
    }
    const distance = previous[right.length];
    if (left.length <= 2 || right.length <= 2) return left[0] === right[0] && distance <= 1;
    return distance <= Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.25));
  };
  return surnames.length > 0 && surnames.every((surname) => {
    if (haystack.includes(surname) || latinHaystack.includes(transliterateRussian(surname))) return true;
    const wanted = signature(surname);
    return wanted.length >= 2 && candidateSurnames.some((candidate) => nearSignature(wanted, signature(candidate)));
  });
}

export function workAuthorMatches(bookAuthor, candidateAuthors = [], evidence = "") {
  const contributors = String(bookAuthor ?? "").split(/\s*;\s*/u).filter(Boolean);
  if (contributors.length <= 1) return authorMatches(bookAuthor, candidateAuthors, evidence);
  return contributors.some((contributor) => authorMatches(contributor, candidateAuthors, evidence));
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
  const authorMatch = workAuthorMatches(book.author, candidate.authors, candidate.evidenceText);
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
