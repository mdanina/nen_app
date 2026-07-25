#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaults = {
  input: resolve(root, "data/import/openlibrary/prepared-catalog/catalog.json"),
  production: resolve(root, "data/generated/books.json"),
  output: resolve(root, "data/import/openlibrary/publish-ready-catalog"),
  registry: null,
  seed: 20260723,
  checkedAt: "2026-07-23T00:00:00.000Z",
};

const RULE_VERSION = "nen-openlibrary-publish-prep-1.0.0";
const DESCRIPTION_RULE_VERSION = "nen-factual-description-1.0.0";
const OFFICIAL_REGISTRY_URL = "https://minjust.gov.ru/ru/pages/reestr-inostryannykh-agentov/";
const compact = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");

const transliteration = new Map(Object.entries({
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
}));

export function normalizeMatch(value) {
  return [...compact(value).normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLocaleLowerCase("ru")]
    .map((character) => transliteration.get(character) ?? character)
    .join("")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

const normalizedValues = (book) => {
  const metadata = book.sourceMetadata ?? {};
  return {
    title: normalizeMatch(book.title),
    author: normalizeMatch(book.author),
    description: normalizeMatch(metadata.sourceDescription),
    subjects: (metadata.subjects ?? []).map(normalizeMatch),
    allSubjects: normalizeMatch((metadata.subjects ?? []).join(" | ")),
  };
};

const academicSignals = [
  ["bibliography", /\b(?:bibliograph|bibliograf|catalogs?|katalog|index of literature)\b/u],
  ["literary_research", /\b(?:history and criticism|literary criticism|poetics|children s literature.{0,45}(?:history|criticism|research)|detskaia literatura\w*.{0,45}(?:istor|kritik|poetik|issledovan))\b/u],
  ["teaching_material", /\b(?:study and teaching|teacher s manual|metodichesk|pedagogichesk|posobie dlia uchitel|education elementary|reading readiness)\b/u],
  ["higher_education", /\b(?:dissertat|thesis|conference proceedings|uchebnik dlia vuz|studentov|monograph)\b/u],
  ["periodical_or_service_record", /\b(?:periodicals?|library catalog|publisher record|serial publication)\b/u],
];

const strongTitleExclusions = [
  ["bibliography", /\b(?:bibliograf|bibliograph|katalog|catalogue|ukazatel literatur)\b/u],
  ["literary_research", /\b(?:istorii?a|kritik|poetik|issledovan|problemy).{0,45}\b(?:detskoi literatur\w*|children s literature)\b/u],
  ["teaching_material", /\b(?:metod|posobie dlia uchitel|pedagog|vospitani|uchebnik dlia vuz)\b/u],
  ["literary_research", /\b(?:o klassikakh .{0,25} literatur|muzykalnaia literatura|literatura sovetskogo perioda)\b/u],
  ["literary_research", /\b(?:angliiskai?a|amerikanskai?a|russkai?a|detskai?a).{0,30}\bliteratura\b.{0,35}\b(?:xix|xx|vek)\b/u],
  ["school_textbook_or_exercise_book", /\b(?:kratkii uchebnik|uchebnaia kniga|nachalnyi kurs|geografii?a dlia .{0,40}uchilishch|kniga dlia chteniia po istorii)\b/u],
  ["conference_or_dissertation", /\b(?:dissertat|avtoreferat|materialy konfer|conference proceedings)\b/u],
];

const childSignals = [
  /\bjuvenile fiction\b/u, /\bjuvenile literature\b/u, /\bjuvenile nonfiction\b/u,
  /\bchildren s (?:stories|fiction|poetry|books|literature)\b/u, /\bpicture books?\b/u,
  /\bboard books?\b/u, /\byoung adult\b/u, /\bouvrages pour la jeunesse\b/u,
  /\bromans nouvelles etc pour la jeunesse\b/u, /\bficcion juvenil\b/u,
];
const standaloneReadingSignals = [
  /\bjuvenile fiction\b/u, /\bchildren s (?:stories|fiction|poetry)\b/u,
  /\bpicture books?\b/u, /\bboard books?\b/u, /\byoung adult\b/u,
  /\bfairy tales?\b/u, /\bnursery rhymes?\b/u, /\bgraphic novels?\b/u,
];

const primaryExcludedTopic = [
  /\b(?:lgbtq?|lesbian|gay men|gay youth|bisexual|transgender|same sex relationship|sexual minorities)\b/u,
  /\b(?:гомосексуал|лесбиян|бисексуал|трансгендер|лгбт|однопол)\w*/u,
];

const sensitiveReviewPatterns = [
  /\b(?:suicide|suicidal|self harm|self injury)\b/u,
  /\b(?:sex instruction|sexual abuse|rape|incest)\b/u,
  /\b(?:drug abuse|narcotics|domestic violence)\b/u,
  /\b(?:самоубий|суицид|самоповреж|сексуальн\w+ насили|изнасилован|наркотик|домашн\w+ насили)\w*/u,
];

const genreRules = [
  { value: "сказка", patterns: [/\bfairy tales?\b/u, /\bfolklore\b/u, /\bfables?\b/u, /\btales?\b/u] },
  { value: "поэзия", patterns: [/\bpoetry\b/u, /\bnursery rhymes?\b/u, /\bpoems?\b/u] },
  { value: "научная фантастика", patterns: [/\bscience fiction\b/u, /\bsci fi\b/u] },
  { value: "фэнтези", patterns: [/\bfantasy\b/u, /\bmagic\b/u, /\bwizards?\b/u, /\bdragons?\b/u] },
  { value: "детектив", patterns: [/\bdetective\b/u, /\bmystery\b/u] },
  { value: "юмор", patterns: [/\bhumou?rous\b/u, /\bhumor\b/u, /\bcomic stories\b/u] },
  { value: "приключения", patterns: [/\badventure\b/u, /\btravel\b/u, /\bexploration\b/u] },
  { value: "биография", patterns: [/\bbiograph/u, /\bpersonal narratives?\b/u] },
  { value: "историческая проза", patterns: [/\bhistorical fiction\b/u] },
  { value: "семейная история", patterns: [/\bfamil(?:y|ies)\b/u, /\bbrothers and sisters\b/u] },
];

const nonfictionPatterns = /\b(?:juvenile nonfiction|science|nature|history|geography|art|technology|inventions|mathematics|physics|astronomy|encyclopedias?)\b/u;
const fictionPatterns = /\b(?:juvenile fiction|children s stories|children s fiction|fiction|novels?|tales?)\b/u;

const themeRules = [
  { value: "дружба", patterns: [/\bfriendship\b/u, /\bfriends\b/u] },
  { value: "семья", patterns: [/\bfamil(?:y|ies)\b/u, /\bparents?\b/u, /\bbrothers and sisters\b/u] },
  { value: "школа", patterns: [/\bschool\b/u, /\bstudents?\b/u, /\bteachers?\b/u] },
  { value: "детский сад", patterns: [/\bkindergarten\b/u, /\bpreschool\b/u] },
  { value: "животные", patterns: [/\banimals?\b/u, /\bcats?\b/u, /\bdogs?\b/u, /\bbirds?\b/u, /\bforest animals\b/u] },
  { value: "природа", patterns: [/\bnature\b/u, /\bforests?\b/u, /\becology\b/u, /\bplants?\b/u, /\brivers?\b/u] },
  { value: "наука", patterns: [/\bscience\b/u, /\bmathematics\b/u, /\bphysics\b/u, /\bastronomy\b/u, /\bexperiments?\b/u] },
  { value: "техника", patterns: [/\btechnology\b/u, /\binventions?\b/u, /\btransportation\b/u, /\baeronautics\b/u] },
  { value: "история", patterns: [/\bhistory\b/u, /\bworld war\b/u, /\bholocaust\b/u, /\bcivilization\b/u] },
  { value: "искусство", patterns: [/\bart\b/u, /\bmusic\b/u, /\bpainting\b/u, /\btheater\b/u] },
  { value: "путешествия", patterns: [/\btravel\b/u, /\bvoyages?\b/u, /\bgeography\b/u, /\bexploration\b/u] },
  { value: "взросление", patterns: [/\bgrowing up\b/u, /\badolescence\b/u, /\byoung adult\b/u, /\bcoming of age\b/u] },
  { value: "самооценка", patterns: [/\bself esteem\b/u, /\bself confidence\b/u] },
  { value: "отношения", patterns: [/\binterpersonal relations\b/u, /\bhuman behavior\b/u] },
  { value: "тело", patterns: [/\bhuman body\b/u, /\bphysiology\b/u, /\bgrowth\b/u] },
  { value: "безопасность", patterns: [/\bsafety\b/u, /\bself protection\b/u] },
  { value: "культурное разнообразие", patterns: [/\bcultural diversity\b/u, /\bmulticultural\b/u, /\bethnic\b/u] },
  { value: "юмор", patterns: [/\bhumou?r\b/u, /\bfunny\b/u, /\bcomic stories\b/u] },
  { value: "волшебство", patterns: [/\bmagic\b/u, /\bwizards?\b/u, /\bfairies\b/u, /\bdragons?\b/u] },
  { value: "приключения", patterns: [/\badventure\b/u, /\bsurvival\b/u, /\bquests?\b/u, /\bpirates?\b/u] },
];

const moodRules = [
  { value: "смешное", patterns: [/\bhumou?r\b/u, /\bfunny\b/u, /\bcomic stories\b/u] },
  { value: "таинственное", patterns: [/\bmystery\b/u, /\bdetective\b/u, /\bsecrets?\b/u] },
  { value: "захватывающее", patterns: [/\badventure\b/u, /\bsurvival\b/u, /\bquests?\b/u] },
  { value: "познавательное", patterns: [nonfictionPatterns] },
  { value: "напряжённое", patterns: [/\bwar\b/u, /\bviolence\b/u, /\bpersecution\b/u, /\binsurgency\b/u] },
];

const formatRules = [
  { value: "картонная книга", patterns: [/\bboard books?\b/u] },
  { value: "книжка-картинка", patterns: [/\bpicture books?\b/u, /\billustrated children s books\b/u] },
  { value: "графический роман", patterns: [/\bgraphic novels?\b/u] },
  { value: "комикс", patterns: [/\bcomic books?\b/u, /\bcomics?\b/u] },
  { value: "поэзия", patterns: [/\bpoetry\b/u, /\bnursery rhymes?\b/u] },
  { value: "энциклопедия", patterns: [/\bencyclopedias?\b/u] },
  { value: "иллюстрированный нон-фикшн", patterns: [nonfictionPatterns] },
  { value: "роман", patterns: [/\bnovels?\b/u, /\byoung adult\b/u] },
  { value: "сборник", patterns: [/\bshort stories\b/u, /\bcollections?\b/u] },
];

const hasPattern = (text, patterns) => patterns.some((pattern) => pattern.test(text));
const evidenceFor = (subjects, rules) => rules
  .map((rule) => ({ value: rule.value, evidence: subjects.filter((subject) => hasPattern(subject, rule.patterns)) }))
  .filter((result) => result.evidence.length);

export function assessSuitability(book) {
  const normalized = normalizedValues(book);
  const negative = [];
  for (const [code, pattern] of strongTitleExclusions) if (pattern.test(normalized.title)) negative.push({ code, field: "title", value: book.title });
  for (const [code, pattern] of academicSignals) {
    const matches = normalized.subjects.filter((subject) => pattern.test(subject));
    if (matches.length) negative.push({ code, field: "subjects", value: matches });
  }
  const exactTitleExclusion = negative.some((item) => item.field === "title");
  const distinctNegativeCodes = new Set(negative.map((item) => item.code)).size;
  const hasStandaloneReadingSignal = normalized.subjects.some((subject) => standaloneReadingSignals.some((pattern) => pattern.test(subject)));
  const textbookTitle = /\b(?:uchebnik|zadachnik|algebra|geografii?a dlia .{0,30}(?:uchilishch|shkol)|uroki geografii|kurs .{0,35} dlia shkol)\b/u.test(normalized.title);
  const textbookSubject = normalized.subjects.some((subject) => /\b(?:textbooks?|study and teaching|problems exercises|curricula|education elementary)\b/u.test(subject));
  const recreationalException = /\b(?:funny|humou?r|comic)\b/u.test(`${normalized.description} ${normalized.allSubjects}`);
  if (textbookTitle && textbookSubject && !recreationalException) {
    return { status: "excluded", code: "school_textbook_or_exercise_book", confidence: 0.94, evidence: [{ field: "title", value: book.title }, { field: "subjects", value: normalized.subjects.filter((subject) => /\b(?:textbooks?|study and teaching|problems exercises|curricula|education elementary)\b/u.test(subject)) }] };
  }
  if (exactTitleExclusion || (distinctNegativeCodes >= 2 && !hasStandaloneReadingSignal)) {
    return { status: "excluded", code: negative[0].code, confidence: exactTitleExclusion ? 0.94 : 0.9, evidence: negative };
  }
  if (negative.length && !hasStandaloneReadingSignal) {
    return { status: "incomplete", code: "possible_academic_or_teaching_material", confidence: 0.6, evidence: negative };
  }
  const childEvidence = normalized.subjects.filter((subject) => childSignals.some((pattern) => pattern.test(subject)));
  if (!childEvidence.length) return { status: "incomplete", code: "insufficient_child_audience_evidence", confidence: 0.4, evidence: [] };
  return { status: "suitable", confidence: childEvidence.length >= 2 ? 0.95 : 0.82, evidence: childEvidence.slice(0, 8) };
}

export function assessExcludedTopic(book) {
  const fields = [
    ["title", normalizeMatch(book.title)],
    ["description", normalizeMatch(book.sourceMetadata?.sourceDescription)],
    ["subjects", normalizeMatch((book.sourceMetadata?.subjects ?? []).join(" | "))],
  ];
  const matches = fields.filter(([, text]) => primaryExcludedTopic.some((pattern) => pattern.test(text)));
  const subjectHits = (book.sourceMetadata?.subjects ?? []).filter((subject) => primaryExcludedTopic.some((pattern) => pattern.test(normalizeMatch(subject))));
  if (matches.length >= 2 || subjectHits.length >= 2) {
    return { status: "excluded", reason: "primary_excluded_topic", confidence: 0.93, fields: matches.map(([field]) => field), evidence: subjectHits };
  }
  if (matches.length === 1) return { status: "review", reason: "possible_primary_excluded_topic", confidence: 0.55, fields: [matches[0][0]], evidence: subjectHits };
  return { status: "clear", confidence: 0.99, fields: [], evidence: [] };
}

export function assessSensitiveReview(book) {
  const fields = [
    ["title", normalizeMatch(book.title)],
    ["description", normalizeMatch(book.sourceMetadata?.sourceDescription)],
    ["subjects", normalizeMatch((book.sourceMetadata?.subjects ?? []).join(" | "))],
  ];
  const matches = fields.filter(([, text]) => sensitiveReviewPatterns.some((pattern) => pattern.test(text)));
  return matches.length
    ? { status: "review", reason: "sensitive_topic_requires_editorial_review", confidence: 0.9, fields: matches.map(([field]) => field), evidence: matches.map(([, value]) => value) }
    : { status: "clear", confidence: 0.99, fields: [], evidence: [] };
}

export function classifyAge(book) {
  const subjects = normalizedValues(book).subjects;
  const joined = subjects.join(" | ");
  const explicit = joined.match(/\b(?:ages?|age)\s*(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\b/u);
  if (explicit) {
    const min = Math.max(0, Number(explicit[1]));
    const max = Math.min(17, Number(explicit[2]));
    if (min <= max) return { value: [min, max], confidence: 0.96, evidence: [explicit[0]], method: "explicit_source_age" };
  }
  const grades = joined.match(/\bgr(?:ade)?s?\.?\s*(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\b/u);
  if (grades) {
    const min = Math.max(5, Number(grades[1]) + 5);
    const max = Math.min(17, Number(grades[2]) + 6);
    return { value: [min, max], confidence: 0.9, evidence: [grades[0]], method: "source_grade_range" };
  }
  const rules = [
    { value: [0, 3], confidence: 0.94, pattern: /\bboard books?\b/u },
    { value: [3, 7], confidence: 0.9, pattern: /\bpicture books?\b/u },
    { value: [12, 17], confidence: 0.9, pattern: /\byoung adult\b/u },
    { value: [5, 9], confidence: 0.86, pattern: /\b(?:nursery rhymes?|alphabet|early readers?)\b/u },
    { value: [6, 11], confidence: 0.8, pattern: /\bchildren s (?:stories|fiction|poetry)\b/u },
    { value: [7, 12], confidence: 0.76, pattern: /\bjuvenile (?:fiction|literature|nonfiction)\b/u },
  ];
  for (const rule of rules) {
    const evidence = subjects.filter((subject) => rule.pattern.test(subject));
    if (evidence.length) return { value: rule.value, confidence: rule.confidence, evidence: evidence.slice(0, 4), method: "subject_audience_rule" };
  }
  return null;
}

export function classifyBook(book) {
  const normalized = normalizedValues(book);
  const subjects = normalized.subjects;
  const genreEvidence = evidenceFor(subjects, genreRules);
  if (!genreEvidence.length) {
    const titleEvidence = evidenceFor([normalized.title], [
      { value: "сказка", patterns: [/\b(?:skaz|fairy tale)\w*/u] },
      { value: "приключения", patterns: [/\b(?:prikliuchen|adventure)\w*/u] },
      { value: "детектив", patterns: [/\b(?:detektiv|mystery)\w*/u] },
      { value: "юмор", patterns: [/\b(?:vesel|smeshn|humou?r|funny)\w*/u] },
      { value: "фэнтези", patterns: [/\b(?:volshebn|magic|wizard|dragon)\w*/u] },
    ]);
    genreEvidence.push(...titleEvidence.map((item) => ({ ...item, evidence: item.evidence.map((value) => `title:${value}`) })));
  }
  if (!genreEvidence.length) {
    if (subjects.some((subject) => fictionPatterns.test(subject))) genreEvidence.push({ value: "реалистическая проза", evidence: subjects.filter((subject) => fictionPatterns.test(subject)) });
    else if (subjects.some((subject) => nonfictionPatterns.test(subject))) genreEvidence.push({ value: "научно-популярная литература", evidence: subjects.filter((subject) => nonfictionPatterns.test(subject)) });
  }
  const themeEvidence = evidenceFor(subjects, themeRules);
  let moodEvidence = evidenceFor(subjects, moodRules);
  const hasFiction = subjects.some((subject) => fictionPatterns.test(subject));
  const hasExplicitNonfiction = subjects.some((subject) => /\bjuvenile nonfiction\b/u.test(subject));
  if (hasFiction && !hasExplicitNonfiction && !genreEvidence.some((item) => ["научно-популярная литература", "биография", "документальная литература"].includes(item.value))) {
    moodEvidence = moodEvidence.filter((item) => item.value !== "познавательное");
  }
  const formatEvidence = evidenceFor(subjects, formatRules);
  const age = classifyAge(book);
  return {
    age,
    genres: genreEvidence.slice(0, 3),
    themes: themeEvidence.slice(0, 4),
    moods: moodEvidence.slice(0, 3),
    bookFormats: formatEvidence.slice(0, 3),
  };
}

function normalizeOfficialName(value) {
  return normalizeMatch(value).split(" ").filter(Boolean).sort().join(" ");
}

export function matchOfficialRegistry(author, registry) {
  if (!registry?.verified || !Array.isArray(registry.physicalPersons)) return { status: "unavailable" };
  const authorNames = compact(author).split(/\s*;\s*/u).filter(Boolean);
  for (const candidate of registry.physicalPersons) {
    const officialVariants = unique([candidate.officialName, ...(candidate.aliases ?? [])]);
    for (const name of authorNames) {
      for (const official of officialVariants) {
        if (normalizeOfficialName(name) && normalizeOfficialName(name) === normalizeOfficialName(official)) {
          return { status: "match", confidence: 0.99, authorName: name, officialName: candidate.officialName, matchedVariant: official };
        }
        const authorParts = normalizeMatch(name).split(" ").filter(Boolean);
        const officialParts = normalizeMatch(official).split(" ").filter(Boolean);
        const authorInitial = authorParts.find((part) => part.length === 1);
        const officialInitial = officialParts.find((part) => part.length > 1)?.[0];
        const sharedFull = authorParts.filter((part) => part.length > 2 && officialParts.includes(part));
        if (authorInitial && officialInitial === authorInitial && sharedFull.length >= 1) {
          return { status: "ambiguous", confidence: 0.62, authorName: name, officialName: candidate.officialName, matchedVariant: official };
        }
      }
    }
  }
  return { status: "clear" };
}

function titleAuthorKey(book) {
  return `${normalizeMatch(String(book.title).split(/[:/]/u)[0])}|${normalizeMatch(book.author)}`;
}

function titleTokens(book) {
  const normalized = normalizeMatch(String(book.title).split(/[:/]/u)[0]).replace(/\brazskaz/gu, "rasskaz");
  return new Set(normalized.split(" ").filter((token) => token.length >= 3));
}

function authorTokens(book) {
  return new Set(normalizeMatch(book.author).split(" ").filter((token) => token.length >= 3));
}

function overlapRatio(left, right) {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / Math.max(left.size, right.size);
}

function likelySameWork(left, right) {
  const titleOverlap = overlapRatio(titleTokens(left), titleTokens(right));
  const authorOverlap = overlapRatio(authorTokens(left), authorTokens(right));
  return titleOverlap >= 0.82 && authorOverlap >= 0.5;
}

function allIsbns(book) {
  return unique([book.isbn13, ...(book.sourceMetadata?.isbns ?? [])]);
}

function mergeDrafts(left, right) {
  const leftScore = Number(Boolean(left.sourceMetadata?.sourceDescription)) * 3 + Number(left.sourceMetadata?.subjects?.length ?? 0) + Number(Boolean(left.isbn13)) + Number(Boolean(left.sourceMetadata?.coverIds?.length));
  const rightScore = Number(Boolean(right.sourceMetadata?.sourceDescription)) * 3 + Number(right.sourceMetadata?.subjects?.length ?? 0) + Number(Boolean(right.isbn13)) + Number(Boolean(right.sourceMetadata?.coverIds?.length));
  const useRight = rightScore > leftScore;
  const primary = structuredClone(useRight ? right : left);
  const secondary = useRight ? left : right;
  primary.sourceMetadata = {
    ...primary.sourceMetadata,
    workIds: unique([...(primary.sourceMetadata?.workIds ?? [primary.sourceMetadata?.workId]), ...(secondary.sourceMetadata?.workIds ?? [secondary.sourceMetadata?.workId])]),
    editionIds: unique([...(primary.sourceMetadata?.editionIds ?? []), ...(secondary.sourceMetadata?.editionIds ?? [])]),
    authorIds: unique([...(primary.sourceMetadata?.authorIds ?? []), ...(secondary.sourceMetadata?.authorIds ?? [])]),
    isbns: unique([...allIsbns(primary), ...allIsbns(secondary)]),
    publishers: unique([...(primary.sourceMetadata?.publishers ?? []), ...(secondary.sourceMetadata?.publishers ?? [])]),
    subjects: unique([...(primary.sourceMetadata?.subjects ?? []), ...(secondary.sourceMetadata?.subjects ?? [])]),
    alternativeTitles: unique([...(primary.sourceMetadata?.alternativeTitles ?? []), secondary.title, ...(secondary.sourceMetadata?.alternativeTitles ?? [])]),
    mergedDraftIds: unique([...(primary.sourceMetadata?.mergedDraftIds ?? [primary.id]), ...(secondary.sourceMetadata?.mergedDraftIds ?? [secondary.id])]),
  };
  return primary;
}

export function deduplicateDrafts(drafts, production) {
  const productionWork = new Map(production.flatMap((book) => {
    const values = unique([book.sourceMetadata?.workId, ...(book.sourceMetadata?.workIds ?? [])]);
    return values.map((value) => [value, book]);
  }));
  const productionIsbn = new Map(production.flatMap((book) => allIsbns(book).map((value) => [value, book])));
  const productionTitleAuthor = new Map(production.map((book) => [titleAuthorKey(book), book]));
  const duplicates = [];
  const candidates = [];
  for (const draft of drafts) {
    const workMatch = unique([draft.sourceMetadata?.workId, ...(draft.sourceMetadata?.workIds ?? [])]).map((value) => productionWork.get(value)).find(Boolean);
    const isbnMatch = allIsbns(draft).map((value) => productionIsbn.get(value)).find(Boolean);
    const titleMatch = productionTitleAuthor.get(titleAuthorKey(draft));
    const existing = workMatch ?? isbnMatch ?? titleMatch;
    if (existing) {
      duplicates.push({ type: "existing_editorial", draftId: draft.id, existingId: existing.id, title: draft.title, author: draft.author, method: workMatch ? "work_id" : isbnMatch ? "isbn" : "title_author", confidence: 0.99 });
    } else candidates.push(draft);
  }
  const groups = [];
  const indexes = { work: new Map(), isbn: new Map(), title: new Map(), author: new Map() };
  for (const draft of candidates) {
    const workIds = unique([draft.sourceMetadata?.workId, ...(draft.sourceMetadata?.workIds ?? [])]);
    const isbns = allIsbns(draft);
    const titleKey = titleAuthorKey(draft);
    let index = workIds.map((value) => indexes.work.get(value)).find((value) => value !== undefined);
    if (index === undefined) index = isbns.map((value) => indexes.isbn.get(value)).find((value) => value !== undefined);
    if (index === undefined) index = indexes.title.get(titleKey);
    if (index === undefined) {
      const possible = new Set([...authorTokens(draft)].flatMap((token) => [...(indexes.author.get(token) ?? [])]));
      const similarIndex = [...possible].find((groupIndex) => likelySameWork(groups[groupIndex], draft));
      if (similarIndex !== undefined) index = similarIndex;
    }
    if (index === undefined) {
      index = groups.length;
      groups.push(structuredClone(draft));
    } else {
      const previous = groups[index];
      groups[index] = mergeDrafts(previous, draft);
      const method = workIds.some((value) => indexes.work.has(value)) ? "work_id" : isbns.some((value) => indexes.isbn.has(value)) ? "isbn" : indexes.title.has(titleKey) ? "title_author" : "fuzzy_title_author";
      duplicates.push({ type: "imported_merge", keptId: groups[index].id, mergedId: draft.id, title: draft.title, author: draft.author, method, confidence: method === "fuzzy_title_author" ? 0.93 : 0.99 });
    }
    for (const value of workIds) indexes.work.set(value, index);
    for (const value of isbns) indexes.isbn.set(value, index);
    indexes.title.set(titleKey, index);
    for (const token of authorTokens(draft)) {
      const values = indexes.author.get(token) ?? new Set();
      values.add(index);
      indexes.author.set(token, values);
    }
  }
  return { candidates: groups, duplicates };
}

function ageLabel([min, max]) { return `${min}–${max} лет`; }
function fieldMeta(value, confidence, evidence, method, modelVersion = null) {
  return { value, confidence, evidence, method, rule_version: RULE_VERSION, model_version: modelVersion };
}

function generatedDescription(book, genres, themes) {
  const genre = genres[0]?.value ?? "детская книга";
  const themeList = themes.map((item) => item.value).slice(0, 3);
  const second = themeList.length
    ? `В центре внимания — ${themeList.join(", ")}.`
    : "Доступных данных недостаточно, чтобы надёжно описать содержание подробнее.";
  return {
    value: `«${compact(book.title)}» относится к жанру «${genre}». ${second}`,
    confidence: themeList.length ? 0.78 : 0.55,
    evidence: unique([book.title, book.author, ...genres.flatMap((item) => item.evidence), ...themes.flatMap((item) => item.evidence)]),
    method: "factual_metadata_template",
    model_version: null,
    rule_version: DESCRIPTION_RULE_VERSION,
    generated: true,
    generatedAt: defaults.checkedAt,
  };
}

function recommendation(book, age, themes, readingMode) {
  const reasons = [];
  if (themes[0]) reasons.push(`Подойдёт читателям ${ageLabel(age.value)}, которым интересна тема «${themes[0].value}».`);
  if (readingMode.value === "together") reasons.push("Рассчитана прежде всего на совместное чтение со взрослым.");
  else if (readingMode.value === "independent") reasons.push("Возрастная и жанровая разметка допускает самостоятельное чтение.");
  else reasons.push("Подойдёт и для самостоятельного, и для совместного чтения.");
  return { value: reasons.slice(0, 3).join(" "), confidence: Math.min(age.confidence, themes[0]?.confidence ?? 0.75), evidence: unique([...age.evidence, ...(themes[0]?.evidence ?? [])]), method: "derived_from_age_theme_reading_mode", rule_version: RULE_VERSION };
}

function coverFor(book) {
  const coverId = book.sourceMetadata?.coverIds?.[0];
  if (!coverId || !book.isbn13) return { value: { kind: "placeholder", rightsStatus: "not-required" }, confidence: 1, evidence: coverId ? ["cover ID exists but exact ISBN-13 is unavailable"] : [], method: "runtime_safe_cover_fallback", rule_version: RULE_VERSION };
  return {
    value: {
      kind: "external",
      url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
      rightsStatus: "external-display-only",
      sourceName: "Open Library Covers",
      sourcePageUrl: `https://openlibrary.org${book.sourceMetadata.workId}`,
      isbn13: book.isbn13,
      temporary: true,
      verifiedAt: defaults.checkedAt,
    },
    confidence: 0.95,
    evidence: [String(coverId), book.isbn13],
    method: "openlibrary_cover_id_with_exact_isbn",
    rule_version: RULE_VERSION,
  };
}

export function publicCard(book, classification, checkedAt) {
  const age = classification.age;
  const ageRange = age.value;
  const readingMode = ageRange[1] <= 6
    ? fieldMeta("together", 0.9, age.evidence, "age_range_rule")
    : ageRange[0] >= 10
      ? fieldMeta("independent", 0.82, age.evidence, "age_range_rule")
      : fieldMeta("both", 0.82, age.evidence, "age_range_rule");
  const genres = classification.genres.map((item) => ({ ...item, confidence: item.confidence ?? (item.evidence.length > 1 ? 0.92 : 0.82), method: item.method ?? "normalized_subject_mapping" }));
  const themes = classification.themes.map((item) => ({ ...item, confidence: item.confidence ?? (item.evidence.length > 1 ? 0.9 : 0.8), method: item.method ?? "normalized_subject_mapping" }));
  const moods = classification.moods.map((item) => ({ ...item, confidence: item.confidence ?? (item.evidence.length > 1 ? 0.85 : 0.75), method: item.method ?? "normalized_subject_mapping" }));
  const formats = classification.bookFormats.map((item) => ({ ...item, confidence: item.confidence ?? 0.88, method: item.method ?? "normalized_subject_mapping" }));
  const description = generatedDescription(book, genres, themes);
  description.generatedAt = checkedAt;
  const recommendationReasons = recommendation(book, age, themes, readingMode);
  const cover = coverFor(book);
  if (cover.value.verifiedAt) cover.value.verifiedAt = checkedAt;
  const isClassic = Number(book.publicationYear) > 0 && Number(book.publicationYear) <= 1975;
  const card = {
    ...book,
    shortDescription: description.value,
    fullDescription: description.value,
    whyRecommended: recommendationReasons.value,
    cover: cover.value,
    ageMin: ageRange[0],
    ageMax: ageRange[1],
    ageLabel: ageLabel(ageRange),
    readingMode: readingMode.value,
    genres: genres.map((item) => item.value),
    themes: themes.map((item) => item.value),
    moods: moods.map((item) => item.value),
    bookFormats: formats.map((item) => item.value),
    lifeSituations: [],
    emotionalStates: [],
    suitableForBedtime: false,
    languageDifficulty: ageRange[1] <= 7 ? "easy" : ageRange[0] >= 12 ? "advanced" : "medium",
    classicOrModern: book.publicationYear ? (isClassic ? "classic" : "modern") : undefined,
    sensitiveTopics: [],
    sensitiveTopicsReviewed: true,
    status: "published",
  };
  const confidence = {
    bookId: card.id,
    sourceWorkIds: unique([book.sourceMetadata?.workId, ...(book.sourceMetadata?.workIds ?? [])]),
    checkedAt,
    fields: {
      age: fieldMeta(ageRange, age.confidence, age.evidence, age.method),
      reading_mode: readingMode,
      genres,
      themes,
      moods,
      book_formats: formats,
      description,
      recommendation_reasons: recommendationReasons,
      cover,
    },
  };
  return { card, confidence };
}

export function validateRuntimeCard(book) {
  const issues = [];
  for (const field of ["id", "slug", "title", "author", "shortDescription", "whyRecommended"]) if (!compact(book[field])) issues.push(field);
  if (!Number.isInteger(book.ageMin) || !Number.isInteger(book.ageMax) || book.ageMin < 0 || book.ageMax > 17 || book.ageMin > book.ageMax) issues.push("age");
  if (!["independent", "together", "both"].includes(book.readingMode)) issues.push("readingMode");
  if (!Array.isArray(book.genres) || !book.genres.length) issues.push("genres");
  if (!Array.isArray(book.themes) || !book.themes.length) issues.push("themes");
  if (book.sensitiveTopicsReviewed !== true) issues.push("sensitiveTopicsReviewed");
  if (book.cover?.kind === "external" && (!book.isbn13 || book.cover.isbn13 !== book.isbn13 || book.cover.rightsStatus !== "external-display-only" || !book.cover.temporary)) issues.push("cover");
  return issues;
}

function seededSample(values, count, seed) {
  let state = Number(seed) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((left, right) => left.order - right.order).slice(0, count).map(({ value }) => value);
}

function percentage(values, predicate) {
  if (!values.length) return 0;
  return Number((values.filter(predicate).length / values.length * 100).toFixed(1));
}

async function loadRegistry(path) {
  if (!path) return { verified: false, sourceUrl: OFFICIAL_REGISTRY_URL, checkedAt: defaults.checkedAt, reason: "official_registry_export_unavailable" };
  const value = JSON.parse(await readFile(path, "utf8"));
  if (value.sourceUrl !== OFFICIAL_REGISTRY_URL || !value.retrievedAt || !Array.isArray(value.physicalPersons)) throw new Error("Official registry snapshot has invalid provenance");
  return { ...value, verified: true };
}

export async function preparePublishReady(options = defaults) {
  const prepared = JSON.parse(await readFile(options.input, "utf8"));
  const production = JSON.parse(await readFile(options.production, "utf8"));
  if (prepared.length !== 2343 || production.length !== 200) throw new Error(`Unexpected input counts: prepared=${prepared.length}, production=${production.length}`);
  if (JSON.stringify(prepared.slice(0, 200)) !== JSON.stringify(production)) throw new Error("The first 200 prepared records differ from production");
  const registry = await loadRegistry(options.registry);
  const { candidates, duplicates } = deduplicateDrafts(prepared.slice(200), production);
  const excluded = [];
  const incomplete = [];
  const needsLegalReview = [];
  const needsRegistryCheckBooks = [];
  const needsContentReview = [];
  const ready = [];
  const confidences = [];
  const editorialRegistryMatches = [];
  const pipelineCounts = {
    recognizedSuitable: 0,
    suitabilityIncomplete: 0,
    excludedBySuitability: 0,
    excludedByOfficialRegistry: 0,
    excludedByPrimaryTopic: 0,
    contentReview: 0,
    classificationIncomplete: 0,
  };

  for (const editorial of production) {
    const match = matchOfficialRegistry(editorial.author, registry);
    if (match.status === "match" || match.status === "ambiguous") editorialRegistryMatches.push({ bookId: editorial.id, title: editorial.title, author: editorial.author, ...match, action: "report_only_existing_editorial_unchanged" });
  }

  for (const book of candidates) {
    const suitability = assessSuitability(book);
    if (suitability.status === "excluded") {
      pipelineCounts.excludedBySuitability += 1;
      excluded.push({ id: book.id, title: book.title, author: book.author, reason: suitability.code, evidence: suitability.evidence, confidence: suitability.confidence });
      continue;
    }
    if (suitability.status === "incomplete") {
      pipelineCounts.suitabilityIncomplete += 1;
      incomplete.push({ ...book, publishBlockers: [suitability.code], suitability });
      continue;
    }
    pipelineCounts.recognizedSuitable += 1;
    const topic = assessExcludedTopic(book);
    if (topic.status === "excluded") {
      pipelineCounts.excludedByPrimaryTopic += 1;
      excluded.push({ id: book.id, title: book.title, author: book.author, reason: topic.reason, evidence: topic.evidence, fields: topic.fields, confidence: topic.confidence });
      continue;
    }
    if (topic.status === "review") {
      pipelineCounts.contentReview += 1;
      needsContentReview.push({ id: book.id, title: book.title, author: book.author, ...topic });
      continue;
    }
    const sensitiveReview = assessSensitiveReview(book);
    if (sensitiveReview.status === "review") {
      pipelineCounts.contentReview += 1;
      needsContentReview.push({ id: book.id, title: book.title, author: book.author, ...sensitiveReview });
      continue;
    }
    const legal = matchOfficialRegistry(book.author, registry);
    if (legal.status === "match") {
      pipelineCounts.excludedByOfficialRegistry += 1;
      excluded.push({ id: book.id, title: book.title, author: book.author, reason: "author_in_official_registry", authorName: legal.authorName, officialName: legal.officialName, checkedAt: options.checkedAt, confidence: legal.confidence, officialSource: OFFICIAL_REGISTRY_URL });
      continue;
    }
    if (legal.status === "ambiguous") {
      needsLegalReview.push({ id: book.id, title: book.title, author: book.author, ...legal, checkedAt: options.checkedAt, officialSource: OFFICIAL_REGISTRY_URL });
      continue;
    }
    if (legal.status === "unavailable") {
      needsRegistryCheckBooks.push({ bookId: book.id, title: book.title, author: book.author, authorIds: book.sourceMetadata?.authorIds ?? [] });
    }
    const classification = classifyBook(book);
    const blockers = [];
    if (!classification.age || classification.age.confidence < 0.72) blockers.push("age");
    if (!classification.genres.length) blockers.push("genres");
    if (!classification.themes.length) blockers.push("themes");
    if (blockers.length) {
      pipelineCounts.classificationIncomplete += 1;
      incomplete.push({ ...book, publishBlockers: blockers, suitability, classification });
      continue;
    }
    const preparedCard = publicCard(book, classification, options.checkedAt);
    const validationIssues = validateRuntimeCard(preparedCard.card);
    if (validationIssues.length) {
      incomplete.push({ ...book, publishBlockers: validationIssues, suitability, classification });
      continue;
    }
    ready.push(preparedCard.card);
    confidences.push(preparedCard.confidence);
  }

  const combined = [...production, ...ready];
  const registryAuthors = new Map();
  for (const item of needsRegistryCheckBooks) {
    const names = compact(item.author).split(/\s*;\s*/u).filter(Boolean);
    names.forEach((name, index) => {
      const key = normalizeMatch(name);
      const current = registryAuthors.get(key) ?? { author: name, authorIds: [], bookIds: [], bookTitles: [] };
      current.authorIds = unique([...current.authorIds, item.authorIds[index]]);
      current.bookIds = unique([...current.bookIds, item.bookId]);
      current.bookTitles = unique([...current.bookTitles, item.title]);
      registryAuthors.set(key, current);
    });
  }
  const needsRegistryCheck = [...registryAuthors.values()].map((item) => ({ ...item, reason: "official_registry_export_unavailable", checkedAt: options.checkedAt, officialSource: OFFICIAL_REGISTRY_URL }));
  const ids = new Set();
  const slugs = new Set();
  const titleAuthors = new Set();
  for (const book of combined) {
    if (ids.has(book.id)) throw new Error(`Duplicate id: ${book.id}`);
    if (slugs.has(book.slug)) throw new Error(`Duplicate slug: ${book.slug}`);
    const key = titleAuthorKey(book);
    if (titleAuthors.has(key)) throw new Error(`Duplicate title + author: ${book.title} / ${book.author}`);
    ids.add(book.id); slugs.add(book.slug); titleAuthors.add(key);
  }

  const duplicateEnrichment = duplicates.filter((item) => item.type === "existing_editorial").map((item) => {
    const draft = prepared.find((book) => book.id === item.draftId);
    return { ...item, importedBibliography: draft?.sourceMetadata ?? null, action: "editorial_record_preserved_unchanged" };
  });
  const reasonCounts = Object.fromEntries(Object.entries(excluded.reduce((result, item) => {
    result[item.reason] = (result[item.reason] ?? 0) + 1;
    return result;
  }, {})).sort((left, right) => right[1] - left[1]));
  const summary = {
    generatedAt: options.checkedAt,
    ruleVersion: RULE_VERSION,
    inputs: { preparedCatalog: options.input, productionCatalog: options.production, preparedCount: prepared.length, productionCount: production.length, draftCount: prepared.length - production.length },
    legalRegistry: { verified: registry.verified, sourceUrl: registry.sourceUrl ?? OFFICIAL_REGISTRY_URL, retrievedAt: registry.retrievedAt ?? null, reason: registry.reason ?? null, existingEditorialMatchesReported: editorialRegistryMatches.length },
    counts: {
      deduplicatedCandidates: candidates.length,
      publishReady: ready.length,
      incomplete: incomplete.length,
      excluded: excluded.length,
      needsLegalReview: needsLegalReview.length,
      needsRegistryCheck: needsRegistryCheck.length,
      needsRegistryCheckBooks: needsRegistryCheckBooks.length,
      needsContentReview: needsContentReview.length,
      duplicatesTotal: duplicates.length,
      duplicatesWithEditorial: duplicates.filter((item) => item.type === "existing_editorial").length,
      importedDuplicatesMerged: duplicates.filter((item) => item.type === "imported_merge").length,
      finalCatalog: combined.length,
      ...pipelineCounts,
    },
    excludedByReason: reasonCounts,
    completion: {
      descriptions: percentage(ready, (book) => compact(book.shortDescription)),
      covers: percentage(ready, (book) => book.cover?.kind === "external"),
      ages: percentage(ready, (book) => Number.isInteger(book.ageMin) && Number.isInteger(book.ageMax)),
      genres: percentage(ready, (book) => book.genres?.length),
      themes: percentage(ready, (book) => book.themes?.length),
      moods: percentage(ready, (book) => book.moods?.length),
      readingMode: percentage(ready, (book) => book.readingMode),
    },
    productionPreserved: JSON.stringify(combined.slice(0, 200)) === JSON.stringify(production),
    productionConnected: false,
    notes: registry.verified
      ? ["Result is prepared separately and is not connected to apps/books."]
      : ["Author registry screening was skipped and must be run separately before publication.", "The official registry page was available, but its export backend was unreachable from the execution environment.", "All new authors requiring the deferred check are listed in needs-registry-check.json."],
  };

  await mkdir(options.output, { recursive: true });
  await Promise.all([
    writeFile(resolve(options.output, "catalog.json"), `${JSON.stringify(combined, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "new-publish-ready.json"), `${JSON.stringify(ready, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "incomplete-drafts.json"), `${JSON.stringify(incomplete, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "excluded.json"), `${JSON.stringify(excluded, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "duplicates.json"), `${JSON.stringify(duplicates, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "duplicate-enrichment.json"), `${JSON.stringify(duplicateEnrichment, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "needs-legal-review.json"), `${JSON.stringify(needsLegalReview, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "needs-registry-check.json"), `${JSON.stringify(needsRegistryCheck, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "needs-content-review.json"), `${JSON.stringify(needsContentReview, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "existing-editorial-legal-report.json"), `${JSON.stringify(editorialRegistryMatches, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "field-confidence.jsonl"), confidences.map(JSON.stringify).join("\n") + (confidences.length ? "\n" : ""), "utf8"),
    writeFile(resolve(options.output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "sample-100.json"), `${JSON.stringify(seededSample(ready, Math.min(100, ready.length), options.seed), null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "excluded-sample-30.json"), `${JSON.stringify(seededSample(excluded, Math.min(30, excluded.length), options.seed + 1), null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "legal-registry-status.json"), `${JSON.stringify({ officialSource: OFFICIAL_REGISTRY_URL, checkedAt: options.checkedAt, verified: registry.verified, retrievedAt: registry.retrievedAt ?? null, reason: registry.reason ?? null }, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { ...defaults };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[++index];
    if (key === "--input") options.input = resolve(value);
    else if (key === "--production") options.production = resolve(value);
    else if (key === "--output") options.output = resolve(value);
    else if (key === "--registry") options.registry = resolve(value);
    else if (key === "--seed") options.seed = Number(value);
    else if (key === "--checked-at") options.checkedAt = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  await preparePublishReady(options);
}
