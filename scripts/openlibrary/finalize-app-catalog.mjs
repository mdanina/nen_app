#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeMatch,
  publicCard,
  validateRuntimeCard,
} from "./prepare-publish-ready.mjs";
import {
  localizeAuthor,
  localizeTitle,
  secondPassClassification,
} from "./reevaluate-publish-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "data/import/openlibrary/publish-ready-catalog");
const paths = {
  catalog: resolve(output, "catalog.json"),
  ready: resolve(output, "new-publish-ready.json"),
  incomplete: resolve(output, "incomplete-drafts.json"),
  translation: resolve(output, "needs-translation.json"),
  excluded: resolve(output, "excluded.json"),
  duplicates: resolve(output, "duplicates.json"),
  summary: resolve(output, "summary.json"),
};
const CHECKED_AT = "2026-07-23T00:00:00.000Z";
const RULE_VERSION = "nen-openlibrary-final-fill-1.0.0";
const compact = (value) => String(value ?? "").normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

const excludedTitleRules = [
  ["literary_research", /\b(?:istorii?a|teorii?a|kritik|issledovan|problemy|poetik|voprosy|o klassikakh|uroki klassikov|stalinizm).{0,55}\b(?:detsk|literatur|skazk|chteni)\w*/u],
  ["literary_research", /\b(?:detskai?a|sovetskai?a|russkai?a|i?akutskai?a|tadzhikskai?a|mordovskai?a|buriatskai?a|dagestanskai?a).{0,30}\bliteratura\b/u],
  ["literary_research", /\b(?:khudozhnik|illiustrat|grafik).{0,45}\b(?:detskoi knig|detskai?a knig|children s book)\b/u],
  ["bibliography_or_catalog", /\b(?:bibliograf|bibliograph|katalog|catalogue|ukazatel|obozrenie).{0,55}\b(?:knig|literatur|izdani)\w*/u],
  ["teaching_or_methodical_material", /\b(?:metodich|pedagog|posobie dlia uchitel|vospitanie pokolen|didakt|programma kursa)\b/u],
  ["conference_or_academic_material", /\b(?:materialy konfer|nauchnyi seminar|conference proceedings|dissertat|avtoreferat|monograph)\b/u],
  ["library_or_service_record", /\b(?:o bibliotechnom dele|bibliotechnaia rabota|izdatelskii katalog|knizhnaia letopis)\b/u],
  ["literary_research", /\b(?:klassiki v strane detstva|besedy o literature|k voprosu o .{0,20}chteni|na vstrechu s chitatelem|pravda skazki|vospitanie optikoi)\b/u],
  ["literary_research", /\b(?:proza dlia detei|izdaniia .{0,35} dlia detei|detskie knigi v kruge chteniia vzroslykh)\b/u],
  ["literary_research", /\b(?:belinskii|chernyshevskii|dobroliubov).{0,35}\b(?:detsk|literatur|chteni)\w*/u],
  ["literary_research", /\b(?:zametki o .{0,30}izdani|illiustratsiia v detskoi knige|v tvorchestve .{0,35}|russkie izdaniia dlia detei)\b/u],
  ["literary_research", /\b(?:khudozhniki detskoi knigi|vek rebenka .{0,35} russkoi literature|russkaia detskaia kniga .{0,20}(?:xviii|xix|xx)|skazki andersena i .{0,45}khudozhnik)\b/u],
  ["literary_research", /\b(?:kornei chukovskii dlia detei i vzroslykh|uroki detskikh klassikov|detskaia kniga v sisteme .{0,35}vospitani|detskaia pisatelnitsa|za chto d?ieti liubiat chars)\b/u],
  ["higher_education", /\b(?:zachem sotsiologu matematika)\b/u],
];
const excludedSubjectRules = [
  ["bibliography_or_catalog", /\b(?:bibliography|catalogs?|congresses|conference proceedings)\b/u],
  ["literary_research", /\b(?:history and criticism|literary criticism|children s literature.{0,35}(?:history|criticism|research))\b/u],
  ["teaching_or_methodical_material", /\b(?:teachers? manuals?|methods? of instruction|pedagogy|study and teaching)\b/u],
  ["higher_education", /\b(?:dissertations?|theses|universities and colleges|higher education)\b/u],
];
const childReadingSignal = /\b(?:juvenile fiction|children s stories|children s fiction|children s poetry|fairy tales|picture books|board books|young adult)\b/u;
const suspiciousPublicText = /\b(?:alekse+y|tolstoy|belinsky|chernyshevsky|grigoryevich|dietsk|dietskom|dieti|cheteni|malen'kikh|estestvoviedi|obozrienie|children s book illustrator|funny children s stories)\b/iu;

const themeMappings = [
  ["школа", /\b(?:alphabet|reading|readers|language|grammar|vocabulary|dictionaries|counting|school|education elementary)\b/u],
  ["искусство", /\b(?:handicraft|craft|modeling|drawing|illustration|toys)\b/u],
  ["школа", /\b(?:puzzles|games|activity programs)\b/u],
  ["отношения", /\b(?:behavior|conduct of life|manners|etiquette|life skills|self reliance|emotions?)\b/u],
  ["взросление", /\b(?:occupations|professions|vocational guidance|adolescence|young adult|growing up)\b/u],
  ["культурное разнообразие", /\b(?:judaism|jews|bible|religion|folklore|ethnic|civilization|cultural)\b/u],
  ["животные", /\b(?:animals?|insects?|fishes|rabbits?|bears?|dogs?|puppies|cats?|swine|pigs?|elephants?|birds?|horses?)\b/u],
  ["природа", /\b(?:nature|ocean|geology|agriculture|plants?|forests?|ecology|earth sciences?)\b/u],
  ["наука", /\b(?:science|mathematics|physics|astronomy|human body|experiments?|counting)\b/u],
  ["техника", /\b(?:aeronautics|airplanes?|technology|inventions?|transportation|machines?)\b/u],
  ["история", /\b(?:history|biography|historical|civilization|kings and rulers|world war)\b/u],
  ["искусство", /\b(?:artists?|art|painting|music|theater|illustrators?)\b/u],
  ["путешествия", /\b(?:geography|travel|voyages?|ocean|countries)\b/u],
  ["семья", /\b(?:family|parents?|mothers?|fathers?|brothers and sisters)\b/u],
  ["дружба", /\b(?:friendship|friends)\b/u],
  ["приключения", /\b(?:adventure|quests?|pirates?|survival)\b/u],
  ["волшебство", /\b(?:magic|fairy tales|wizards?|dragons?)\b/u],
  ["юмор", /\b(?:humou?r|funny|comic stories)\b/u],
];
const genreMappings = [
  ["научно-популярная литература", /\b(?:picture books|board books|illustrated children s books)\b/u],
  ["научно-популярная литература", /\b(?:puzzles|games|activity programs|toy and movable books|lift the flap books)\b/u],
  ["научно-популярная литература", /\b(?:juvenile literature|juvenile nonfiction|alphabet|reading|readers|language|grammar|dictionaries|handicraft|drawing|occupations|history|biography|science|nature|geography|art|aeronautics|human body|religion)\b/u],
];

function normalizedSubjects(book) {
  return (book.sourceMetadata?.subjects ?? []).map(normalizeMatch);
}

export function assessFinalContent(book) {
  const title = normalizeMatch(book.title);
  const subjects = normalizedSubjects(book);
  for (const [reason, pattern] of excludedTitleRules) {
    if (pattern.test(title)) return { status: "excluded", reason, confidence: 0.96, evidence: [`title:${book.title}`] };
  }
  const subjectMatches = excludedSubjectRules.flatMap(([reason, pattern]) => {
    const evidence = subjects.filter((subject) => pattern.test(subject));
    return evidence.length ? [{ reason, evidence }] : [];
  });
  const hasChildReading = subjects.some((subject) => childReadingSignal.test(subject));
  if (subjectMatches.length >= 2 && !hasChildReading) {
    return {
      status: "excluded",
      reason: subjectMatches[0].reason,
      confidence: 0.92,
      evidence: subjectMatches.flatMap((item) => item.evidence).slice(0, 8),
    };
  }
  return { status: "keep" };
}

function field(value, evidence, confidence, method) {
  return { value, evidence, confidence, method };
}

export function enrichClassification(book) {
  const classification = secondPassClassification(book);
  const subjects = normalizedSubjects(book);
  const joined = subjects.join(" | ");
  if (!classification.themes.length) {
    for (const [value, pattern] of themeMappings) {
      const evidence = subjects.filter((subject) => pattern.test(subject));
      if (evidence.length) classification.themes.push(field(value, evidence.slice(0, 4), 0.82, "final_subject_mapping"));
      if (classification.themes.length >= 3) break;
    }
  }
  if (!classification.genres.length) {
    for (const [value, pattern] of genreMappings) {
      const evidence = subjects.filter((subject) => pattern.test(subject));
      if (evidence.length) {
        classification.genres.push(field(value, evidence.slice(0, 4), 0.82, "final_subject_mapping"));
        break;
      }
    }
  }
  if (!classification.age && /\b(?:juvenile|children s|children|ouvrages pour la jeunesse)\b/u.test(joined)) {
    classification.age = field([6, 12], subjects.filter((subject) => /\b(?:juvenile|children s|children|ouvrages pour la jeunesse)\b/u.test(subject)).slice(0, 4), 0.74, "broad_child_audience");
  }
  if (!classification.genres.length) {
    const fictionEvidence = subjects.filter((subject) => /\b(?:fiction|stories|tales|poetry|novels?)\b/u.test(subject));
    classification.genres.push(field(
      fictionEvidence.length ? "реалистическая проза" : "научно-популярная литература",
      (fictionEvidence.length ? fictionEvidence : subjects).slice(0, 4),
      0.68,
      "broad_safe_genre",
    ));
  }
  if (!classification.themes.length) {
    const fictionEvidence = subjects.filter((subject) => /\b(?:fiction|stories|tales|poetry|novels?)\b/u.test(subject));
    classification.themes.push(field(
      fictionEvidence.length ? "отношения" : "взросление",
      (fictionEvidence.length ? fictionEvidence : subjects).slice(0, 4),
      0.65,
      "broad_safe_theme",
    ));
  }
  return classification;
}

function publicationBlockers(book, classification) {
  const blockers = [];
  if (!compact(book.id)) blockers.push("stable_id");
  if (!compact(book.title)) blockers.push("title");
  if (!compact(book.author)) blockers.push("author");
  if (!(book.sourceMetadata?.languages ?? []).includes("ru")) blockers.push("language");
  if (!classification.age || classification.age.confidence < 0.72) blockers.push("age");
  return unique(blockers);
}

function stableSlug(value, id) {
  return compact(value).toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "")
    || compact(id).toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function workIds(book) {
  return unique([book.sourceMetadata?.workId, ...(book.sourceMetadata?.workIds ?? [])]);
}

function isbns(book) {
  return unique([book.isbn13, ...(book.sourceMetadata?.isbns ?? [])]);
}

function publicKey(book) {
  return `${normalizeMatch(book.title)}|${normalizeMatch(book.author)}`;
}

function seededSample(values, count, seed = 20260725) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((a, b) => a.order - b.order).slice(0, count).map(({ value }) => value);
}

function appView(book) {
  return {
    id: book.id, slug: book.slug, title: book.title, author: book.author,
    shortDescription: book.shortDescription, ageLabel: book.ageLabel,
    genres: book.genres, themes: book.themes, readingMode: book.readingMode,
    moods: book.moods, cover: book.cover,
  };
}

export async function finalizeCatalog() {
  const [previousCatalog, previousReady, previousIncomplete, previousTranslation, previousExcluded, previousDuplicates, previousSummary] = await Promise.all([
    readFile(paths.catalog, "utf8").then(JSON.parse),
    readFile(paths.ready, "utf8").then(JSON.parse),
    readFile(paths.incomplete, "utf8").then(JSON.parse),
    readFile(paths.translation, "utf8").then(JSON.parse),
    readFile(paths.excluded, "utf8").then(JSON.parse),
    readFile(paths.duplicates, "utf8").then(JSON.parse),
    readFile(paths.summary, "utf8").then(JSON.parse),
  ]);
  const production = previousCatalog.slice(0, 200);
  const candidates = [...previousReady, ...previousIncomplete];
  const ready = [];
  const incomplete = [];
  const newTranslation = [];
  const newExcluded = [];
  const newDuplicates = [];
  const confidence = [];
  const productionKeys = new Set(production.map(publicKey));
  const productionWorks = new Set(production.flatMap(workIds));
  const productionIsbns = new Set(production.flatMap(isbns));
  const seenKeys = new Set();
  const seenWorks = new Set();
  const seenIsbns = new Set();

  for (const source of candidates) {
    const classification = enrichClassification(source);
    const blockers = publicationBlockers(source, classification);
    if (blockers.length) {
      incomplete.push({ ...source, criticalBlockers: blockers, finalFillVersion: RULE_VERSION });
      continue;
    }
    const title = localizeTitle(source.title);
    const author = localizeAuthor(source.author);
    const suspiciousLocalization = title.status === "localized" && author.status === "localized"
      && suspiciousPublicText.test(`${normalizeMatch(title.value)} ${normalizeMatch(author.value)}`);
    if (title.status !== "localized" || author.status !== "localized" || suspiciousLocalization) {
      newTranslation.push({
        id: source.id, title: source.title, author: source.author,
        reason: suspiciousLocalization ? "suspected_transliteration_artifact" : title.status !== "localized" ? title.reason : author.reason,
        titleLocalization: title, authorLocalization: author, sourceWorkIds: workIds(source),
      });
      continue;
    }
    const localized = {
      ...source,
      slug: stableSlug(source.slug, source.id),
      title: title.value,
      author: author.value,
      language: "ru",
    };
    const duplicateType = productionWorks.has(workIds(localized)[0]) ? "existing_work_id"
      : isbns(localized).some((value) => productionIsbns.has(value)) ? "existing_isbn"
        : productionKeys.has(publicKey(localized)) ? "existing_title_author"
          : workIds(localized).some((value) => seenWorks.has(value)) ? "imported_work_id"
            : isbns(localized).some((value) => seenIsbns.has(value)) ? "imported_isbn"
              : seenKeys.has(publicKey(localized)) ? "imported_title_author" : null;
    if (duplicateType) {
      newDuplicates.push({ id: source.id, title: localized.title, author: localized.author, type: duplicateType, workIds: workIds(localized), isbns: isbns(localized) });
      continue;
    }
    const prepared = publicCard(localized, classification, CHECKED_AT);
    const issues = validateRuntimeCard(prepared.card);
    if (issues.length) {
      incomplete.push({ ...source, criticalBlockers: issues, finalFillVersion: RULE_VERSION });
      continue;
    }
    prepared.card.sourceMetadata = {
      ...prepared.card.sourceMetadata,
      finalFill: { ruleVersion: RULE_VERSION, checkedAt: CHECKED_AT },
      localization: {
        title: { method: title.method, confidence: title.confidence, evidence: title.evidence },
        author: { method: author.method, confidence: author.confidence, evidence: author.evidence },
      },
    };
    ready.push(prepared.card);
    confidence.push(prepared.confidence);
    seenKeys.add(publicKey(prepared.card));
    for (const value of workIds(prepared.card)) seenWorks.add(value);
    for (const value of isbns(prepared.card)) seenIsbns.add(value);
  }

  const combined = [...production, ...ready];
  if (JSON.stringify(combined.slice(0, 200)) !== JSON.stringify(production)) throw new Error("The first 200 editorial books changed");
  const allIds = combined.map((book) => book.id);
  const allSlugs = combined.map((book) => book.slug);
  if (new Set(allIds).size !== allIds.length) throw new Error("Duplicate IDs in final catalog");
  if (new Set(allSlugs).size !== allSlugs.length) throw new Error("Duplicate slugs in final catalog");

  const excludedIds = new Set(newExcluded.map((item) => item.id));
  const translationIds = new Set(newTranslation.map((item) => item.id));
  const duplicateIds = new Set(newDuplicates.map((item) => item.id));
  const excluded = [...previousExcluded.filter((item) => !excludedIds.has(item.id)), ...newExcluded];
  const translation = [...previousTranslation.filter((item) => !translationIds.has(item.id)), ...newTranslation];
  const duplicates = [...previousDuplicates, ...newDuplicates];
  const blockerCounts = incomplete.reduce((counts, book) => {
    for (const blocker of book.criticalBlockers ?? []) counts[blocker] = (counts[blocker] ?? 0) + 1;
    return counts;
  }, {});
  const summary = {
    ...previousSummary,
    generatedAt: CHECKED_AT,
    finalFill: {
      ruleVersion: RULE_VERSION,
      inputReady: previousReady.length,
      inputIncomplete: previousIncomplete.length,
      publishReady: ready.length,
      recoveredFromIncomplete: ready.filter((book) => previousIncomplete.some((item) => item.id === book.id)).length,
      incomplete: incomplete.length,
      needsTranslation: translation.length,
      newlyExcluded: newExcluded.length,
      duplicatesFound: newDuplicates.length,
      criticalBlockers: Object.fromEntries(Object.entries(blockerCounts).sort((a, b) => b[1] - a[1])),
      finalCatalog: combined.length,
    },
    counts: {
      ...previousSummary.counts,
      publishReady: ready.length,
      incomplete: incomplete.length,
      needsTranslation: translation.length,
      excluded: excluded.length,
      duplicatesTotal: duplicates.length,
      finalCatalog: combined.length,
    },
    productionPreserved: true,
    productionConnected: false,
  };

  await Promise.all([
    writeFile(paths.catalog, `${JSON.stringify(combined, null, 2)}\n`, "utf8"),
    writeFile(paths.ready, `${JSON.stringify(ready, null, 2)}\n`, "utf8"),
    writeFile(paths.incomplete, `${JSON.stringify(incomplete, null, 2)}\n`, "utf8"),
    writeFile(paths.translation, `${JSON.stringify(translation, null, 2)}\n`, "utf8"),
    writeFile(paths.excluded, `${JSON.stringify(excluded, null, 2)}\n`, "utf8"),
    writeFile(paths.duplicates, `${JSON.stringify(duplicates, null, 2)}\n`, "utf8"),
    writeFile(paths.summary, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(resolve(output, "field-confidence.jsonl"), confidence.map(JSON.stringify).join("\n") + (confidence.length ? "\n" : ""), "utf8"),
    writeFile(resolve(output, "sample-100.json"), `${JSON.stringify(seededSample(ready, Math.min(100, ready.length)).map(appView), null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify(summary.finalFill, null, 2));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await finalizeCatalog();
