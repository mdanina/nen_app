#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyBook,
  normalizeMatch,
  publicCard,
  validateRuntimeCard,
} from "./prepare-publish-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaults = {
  catalog: resolve(root, "data/import/openlibrary/publish-ready-catalog/catalog.json"),
  ready: resolve(root, "data/import/openlibrary/publish-ready-catalog/new-publish-ready.json"),
  incomplete: resolve(root, "data/import/openlibrary/publish-ready-catalog/incomplete-drafts.json"),
  confidence: resolve(root, "data/import/openlibrary/publish-ready-catalog/field-confidence.jsonl"),
  summary: resolve(root, "data/import/openlibrary/publish-ready-catalog/summary.json"),
  output: resolve(root, "data/import/openlibrary/publish-ready-catalog"),
  checkedAt: "2026-07-23T00:00:00.000Z",
  seed: 20260724,
};

const SECOND_PASS_VERSION = "nen-openlibrary-second-pass-1.0.0";
const compact = (value) => String(value ?? "").normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const stableSlug = (value, id) => {
  const normalized = compact(value)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || compact(id).toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
};
const hasCyrillic = (value) => /[А-Яа-яЁё]/u.test(value);
const hasOtherScript = (value) => /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Han}]/u.test(value);

const russianTitleTokens = new Set([
  "azbuka", "basni", "bez", "bolsh", "chto", "dets", "dlia", "dom", "drug", "druzei", "eshche",
  "geroi", "gde", "ia", "ili", "istoriia", "kak", "kniga", "kot", "kosh", "les", "mama", "moi",
  "moia", "more", "na", "nad", "nash", "novyi", "o", "ot", "perv", "pes", "po", "pod", "povest",
  "prikliuchen", "pro", "rasskaz", "reben", "rossii", "russk", "samyi", "semia", "skaz", "stikh",
  "taina", "tri", "v", "vesel", "vse", "volshebn", "za", "zanimatel", "zhivot", "zima",
]);
const russianGivenNames = new Set([
  "aleksandr", "aleksei", "andrei", "anatolii", "anton", "arkadii", "boris", "daniil", "dmitrii", "evgenii",
  "fedor", "fyodor", "gennadii", "georgii", "grigorii", "ivan", "iurii", "yurii", "konstantin", "korney",
  "lev", "leonid", "mikhail", "nikolai", "oleg", "pavel", "petr", "samuil", "sergei", "semen", "valentin",
  "valerii", "viktor", "vitalii", "vladimir", "alena", "anna", "asiya", "ekaterina", "elena", "irina",
  "liudmila", "marina", "nadezhda", "natalia", "olga", "sofia", "svetlana", "tamara", "tatiana",
]);
const libraryMarkers = /[ʹʺĭīǐëėḞḢĖŁı︠︡͡]/u;
const unsafeDisplayPunctuation = /(?:[︠︡͡]|\u0301|(?:\/|=)\s*$|--)/u;
const hasUnsafeDisplayMarkers = (value) => {
  const withoutRomanNumerals = String(value).replace(/\b[IVXLCDM]{2,}\b/gu, "");
  return /\p{Script=Latin}/u.test(withoutRomanNumerals)
    || unsafeDisplayPunctuation.test(value)
    || /ксвии+/iu.test(value);
};

function looksRussianTitle(value) {
  const words = normalizeMatch(value).split(" ").filter(Boolean);
  const hits = words.filter((word) => [...russianTitleTokens].some((token) => word === token || word.startsWith(token))).length;
  return hits >= 2 || (hits >= 1 && words.length <= 3);
}

function looksRussianAuthor(value) {
  if (/[øåæñ]/iu.test(value)) return false;
  const words = normalizeMatch(value).split(" ").filter(Boolean);
  if (words.some((word) => russianGivenNames.has(word))) return true;
  return words.some((word) => /(?:ov|ova|ev|eva|sky|skii|skaia|ovich|evich|enko|chuk)$/u.test(word));
}

const wordOverrides = new Map(Object.entries({
  dlia: "для", ia: "я", i: "и", v: "в", vo: "во", na: "на", o: "о", ob: "об", po: "по", iz: "из",
  s: "с", so: "со", k: "к", ot: "от", do: "до", pro: "про", bez: "без", pod: "под", nad: "над",
  za: "за", ili: "или", kak: "как", chto: "что", kto: "кто", gde: "где", eshche: "ещё", vse: "все",
  moi: "мои", moia: "моя", moe: "моё", nash: "наш", nasha: "наша", tri: "три",
}));

function transliterateWord(raw) {
  if (/^[IVXLCDM]{2,}$/u.test(raw)) return raw;
  const original = raw
    .replace(/t(?:͡|︠|︡)+s(?:͡|︠|︡)*/giu, "¤")
    .replace(/Ë/gu, "Yo").replace(/ë/gu, "yo")
    .replace(/Ĭ|ĭ|Ǐ|ǐ/gu, "j")
    .replace(/Ė/gu, "E").replace(/ė/gu, "e")
    .normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "")
    .replace(/[︠︡]/gu, "");
  const lower = original.toLocaleLowerCase("en");
  if (wordOverrides.has(lower)) return preserveCase(raw, wordOverrides.get(lower));
  const ordered = [
    ["shch", "щ"], ["sch", "щ"], ["zh", "ж"], ["kh", "х"], ["ch", "ч"], ["sh", "ш"],
    ["yo", "ё"], ["yu", "ю"], ["iu", "ю"], ["ya", "я"], ["ia", "я"],
  ];
  let value = lower;
  value = value.replaceAll("¤", "ц");
  for (const [from, to] of ordered) value = value.replaceAll(from, to);
  const single = {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "й", k: "к",
    l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в",
    w: "в", x: "кс", y: "ы", z: "з", "ʹ": "ь", "ʺ": "ъ",
  };
  value = [...value].map((character) => single[character] ?? character).join("");
  return preserveCase(raw, value);
}

function preserveCase(raw, value) {
  if (!value) return value;
  if (/^\p{Lu}/u.test(raw)) return value[0].toLocaleUpperCase("ru") + value.slice(1);
  return value;
}

function reverseLibraryTransliteration(value) {
  return compact(value)
    .replace(/([A-Za-zÀ-žĬĭǏǐĖėʹʺ︠︡͡]+)/gu, (word) => transliterateWord(word))
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([«(])\s+/gu, "$1")
    .replace(/\s+([» )])/gu, "$1")
    .trim();
}

function cleanCyrillicTitle(value) {
  const cyrillicPart = compact(value).split(/\s*[|=]\s*/u).find((part) => hasCyrillic(part));
  return compact(cyrillicPart ?? value)
    .replace(/[︠︡͡]/gu, "")
    .replace(/['ʹ]/gu, "ь")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\bТаина\b/gu, "Тайна")
    .replace(/\bБолшая\b/gu, "Большая")
    .replace(/Собачиы/gu, "Собачий")
    .replace(/Связь времен/gu, "Связь времён");
}

export function localizeTitle(value) {
  if (!compact(value)) return { status: "missing", reason: "missing_title" };
  if (hasCyrillic(value)) {
    const localized = cleanCyrillicTitle(value);
    if (hasUnsafeDisplayMarkers(localized)) return { status: "review", reason: "technical_or_mixed_script_title", evidence: [value, localized] };
    return { status: "localized", value: localized, confidence: 0.99, method: "existing_cyrillic_title", evidence: [value] };
  }
  if (hasOtherScript(value)) return { status: "review", reason: "official_russian_title_not_available", evidence: [value] };
  if (!looksRussianTitle(value)) return { status: "review", reason: "official_russian_title_not_available", evidence: [value] };
  const localized = reverseLibraryTransliteration(value);
  if (!hasCyrillic(localized) || hasUnsafeDisplayMarkers(localized)) return { status: "review", reason: "transliteration_not_resolved", evidence: [value, localized] };
  return { status: "localized", value: localized, confidence: libraryMarkers.test(value) ? 0.94 : 0.84, method: "reverse_library_transliteration", evidence: [value] };
}

function localizeSingleAuthor(value) {
  const cleaned = compact(value);
  if (!cleaned) return { status: "missing", reason: "missing_author" };
  if (hasCyrillic(cleaned)) {
    const localized = cleaned
      .replace(/[︠︡͡]/gu, "")
      .replace(/['ʹ]/gu, "ь")
      .replace(/\bАлексеи\b/gu, "Алексей");
    if (hasUnsafeDisplayMarkers(localized)) return { status: "review", reason: "technical_or_mixed_script_author", evidence: [value, localized] };
    return { status: "localized", value: localized, confidence: 0.99, method: "existing_cyrillic_author", evidence: [value] };
  }
  if (hasOtherScript(cleaned) || !looksRussianAuthor(cleaned)) return { status: "review", reason: "official_russian_author_name_not_available", evidence: [value] };
  let localized = reverseLibraryTransliteration(cleaned);
  if (localized.includes(",")) {
    const [surname, rest] = localized.split(",").map(compact);
    if (surname && rest) localized = `${rest} ${surname}`;
  }
  localized = localized
    .replace(/\bАндреи\b/gu, "Андрей")
    .replace(/\bСергеи\b/gu, "Сергей")
    .replace(/\bНиколаи\b/gu, "Николай")
    .replace(/\bВиталии\b/gu, "Виталий")
    .replace(/\bДмитрии\b/gu, "Дмитрий")
    .replace(/\bЮрии\b/gu, "Юрий")
    .replace(/\bКорнеи\b/gu, "Корней")
    .replace(/\bАлексеи\b/gu, "Алексей")
    .replace(/\b([А-ЯЁа-яё]+)ы\b/gu, "$1й")
    .replace(/\b([А-ЯЁа-яё]+)ски\b/gu, "$1ский");
  if (!hasCyrillic(localized) || hasUnsafeDisplayMarkers(localized)) return { status: "review", reason: "author_transliteration_not_resolved", evidence: [value, localized] };
  return { status: "localized", value: localized, confidence: libraryMarkers.test(value) ? 0.92 : 0.82, method: "reverse_library_transliteration", evidence: [value] };
}

export function localizeAuthor(value) {
  const authors = compact(value).split(/\s*;\s*/u).filter(Boolean);
  const localized = authors.map(localizeSingleAuthor);
  const unresolved = localized.filter((item) => item.status !== "localized");
  if (unresolved.length) return { status: "review", reason: "official_russian_author_name_not_available", unresolved, evidence: authors };
  return {
    status: "localized",
    value: localized.map((item) => item.value).join("; "),
    confidence: Math.min(...localized.map((item) => item.confidence)),
    method: "per_author_localization",
    evidence: authors,
  };
}

const titleThemeRules = [
  ["дружба", /\b(?:druzh|druz|drug|подруг|друж)\w*/u],
  ["семья", /\b(?:sem|mama|papa|rodit|brat|sestr|сем|мам|пап|родител|брат|сестр)\w*/u],
  ["школа", /\b(?:shkol|urok|klass|uchenik|школ|урок|класс|ученик)\w*/u],
  ["животные", /\b(?:zhivot|kot|kosh|sobak|pes|medved|lis|volk|zai|ezh|ptit|ryb|dino|живот|кот|кош|собак|пес|медвед|лис|волк|зай|ёж|птиц|рыб|динозавр)\w*/u],
  ["природа", /\b(?:prirod|les|more|reka|sad|derev|zima|leto|природ|лес|мор|рек|сад|дерев|зим|лет)\w*/u],
  ["наука", /\b(?:nauk|kosmos|zvezd|fizik|matemat|opyt|vselenn|наук|космос|звезд|физик|математ|опыт|вселен)\w*/u],
  ["техника", /\b(?:mashin|parovoz|samolet|robot|izobret|машин|паровоз|самол|робот|изобрет)\w*/u],
  ["искусство", /\b(?:muzyk|kartin|khudozh|teatr|музык|картин|худож|театр)\w*/u],
  ["путешествия", /\b(?:putesh|dorog|poezd|korabl|okean|stran|путеш|дорог|поезд|корабл|океан|стран)\w*/u],
  ["взросление", /\b(?:vzros|podrost|взрос|подрост)\w*/u],
  ["юмор", /\b(?:vesel|smeshn|nelep|весел|смеш|нелеп)\w*/u],
  ["волшебство", /\b(?:volshebn|skaz|drakon|волшеб|сказ|дракон)\w*/u],
  ["приключения", /\b(?:prikliuch|pirat|taina|poisk|приключ|пират|тайн|поиск)\w*/u],
];

const titleGenreRules = [
  ["сказка", /\b(?:skaz|basn|сказ|басн)\w*/u],
  ["поэзия", /\b(?:stikh|poet|стих|поэт)\w*/u],
  ["приключения", /\b(?:prikliuch|pirat|приключ|пират)\w*/u],
  ["детектив", /\b(?:detektiv|taina|детектив|тайн)\w*/u],
  ["юмор", /\b(?:vesel|smeshn|весел|смеш)\w*/u],
  ["научно-популярная литература", /\b(?:atlas|ent?siklop|атлас|энциклоп)\w*/u],
  ["реалистическая проза", /\b(?:rasskaz|povest|рассказ|повест)\w*/u],
];

export function secondPassClassification(book) {
  const base = classifyBook(book);
  const titleText = `${normalizeMatch(book.title)} ${compact(book.title).toLocaleLowerCase("ru")}`;
  if (!base.genres.length) {
    const match = titleGenreRules.find(([, pattern]) => pattern.test(titleText));
    if (match) base.genres.push({ value: match[0], evidence: [`title:${book.title}`], confidence: 0.8, method: "second_pass_title_mapping" });
  }
  if (!base.themes.length) {
    for (const [value, pattern] of titleThemeRules) {
      if (pattern.test(titleText)) base.themes.push({ value, evidence: [`title:${book.title}`], confidence: 0.78, method: "second_pass_title_mapping" });
      if (base.themes.length >= 3) break;
    }
  }
  if (!base.age) {
    const subjects = (book.sourceMetadata?.subjects ?? []).map(normalizeMatch);
    const evidence = subjects.filter((subject) => /\bchildren s literature\b/u.test(subject));
    if (evidence.length) base.age = { value: [6, 12], confidence: 0.74, evidence: evidence.slice(0, 3), method: "second_pass_general_child_audience" };
  }
  return base;
}

export function criticalBlockers(book, classification) {
  const blockers = [];
  if (!compact(book.id)) blockers.push("stable_id");
  if (!compact(book.title)) blockers.push("title");
  if (!compact(book.author)) blockers.push("author");
  if (!(book.sourceMetadata?.languages ?? []).includes("ru")) blockers.push("language");
  if (!classification.age || classification.age.confidence < 0.72) blockers.push("age");
  if (!classification.genres.length) blockers.push("genre");
  if (!classification.themes.length) blockers.push("theme");
  return unique(blockers);
}

function seededSample(values, count, seed) {
  let state = Number(seed) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((left, right) => left.order - right.order).slice(0, count).map(({ value }) => value);
}

function percentage(values, predicate) {
  return values.length ? Number((values.filter(predicate).length / values.length * 100).toFixed(1)) : 0;
}

function appViewCard(book) {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    ageLabel: book.ageLabel,
    readingMode: book.readingMode,
    genres: book.genres,
    themes: book.themes,
    moods: book.moods,
    shortDescription: book.shortDescription,
    whyRecommended: book.whyRecommended,
    cover: book.cover,
  };
}

export async function reevaluatePublishReady(options = defaults) {
  const previousCatalog = JSON.parse(await readFile(options.catalog, "utf8"));
  const production = previousCatalog.slice(0, 200);
  const previousReady = JSON.parse(await readFile(options.ready, "utf8"));
  const previousIncomplete = JSON.parse(await readFile(options.incomplete, "utf8"));
  const previousSummary = JSON.parse(await readFile(options.summary, "utf8"));
  const candidates = [...previousReady, ...previousIncomplete];
  const ready = [];
  const incomplete = [];
  const needsTranslation = [];
  const confidence = [];
  let recoveredBeforeTranslation = 0;

  for (const source of candidates) {
    const classification = secondPassClassification(source);
    const blockers = criticalBlockers(source, classification);
    if (blockers.length) {
      incomplete.push({ ...source, criticalBlockers: blockers, secondPassVersion: SECOND_PASS_VERSION });
      continue;
    }
    if (previousIncomplete.some((item) => item.id === source.id)) recoveredBeforeTranslation += 1;
    const title = localizeTitle(source.title);
    const author = localizeAuthor(source.author);
    if (title.status !== "localized" || author.status !== "localized") {
      needsTranslation.push({
        id: source.id,
        title: source.title,
        author: source.author,
        titleLocalization: title,
        authorLocalization: author,
        reason: title.status !== "localized" ? title.reason : author.reason,
        sourceWorkIds: unique([source.sourceMetadata?.workId, ...(source.sourceMetadata?.workIds ?? [])]),
      });
      continue;
    }
    const localizedSource = {
      ...source,
      slug: stableSlug(source.slug, source.id),
      title: title.value,
      author: author.value,
    };
    const prepared = publicCard(localizedSource, classification, options.checkedAt);
    const issues = validateRuntimeCard(prepared.card);
    if (issues.length) {
      incomplete.push({ ...source, criticalBlockers: issues, secondPassVersion: SECOND_PASS_VERSION });
      continue;
    }
    prepared.card.sourceMetadata = {
      ...prepared.card.sourceMetadata,
      originalDisplayTitle: source.title,
      originalDisplayAuthor: source.author,
      localization: {
        title: { confidence: title.confidence, method: title.method, evidence: title.evidence, ruleVersion: SECOND_PASS_VERSION },
        author: { confidence: author.confidence, method: author.method, evidence: author.evidence, ruleVersion: SECOND_PASS_VERSION },
      },
    };
    prepared.confidence.fields.title_localization = { value: title.value, confidence: title.confidence, evidence: title.evidence, method: title.method, rule_version: SECOND_PASS_VERSION, model_version: null };
    prepared.confidence.fields.author_localization = { value: author.value, confidence: author.confidence, evidence: author.evidence, method: author.method, rule_version: SECOND_PASS_VERSION, model_version: null };
    ready.push(prepared.card);
    confidence.push(prepared.confidence);
  }

  const localizationDuplicates = [];
  const productionByTitleAuthor = new Map(
    production.map((book) => [`${normalizeMatch(book.title)}|${normalizeMatch(book.author)}`, book]),
  );
  const localizedByTitleAuthor = new Map();
  const deduplicatedReady = [];
  for (const book of ready) {
    const key = `${normalizeMatch(book.title)}|${normalizeMatch(book.author)}`;
    const editorialMatch = productionByTitleAuthor.get(key);
    if (editorialMatch) {
      localizationDuplicates.push({
        kind: "matches_existing_editorial_book",
        keptId: editorialMatch.id,
        removedId: book.id,
        title: book.title,
        author: book.author,
        workIds: unique([book.sourceMetadata?.workId, ...(book.sourceMetadata?.workIds ?? [])]),
      });
      continue;
    }
    const existing = localizedByTitleAuthor.get(key);
    if (existing) {
      existing.sourceMetadata = {
        ...existing.sourceMetadata,
        workIds: unique([
          existing.sourceMetadata?.workId,
          ...(existing.sourceMetadata?.workIds ?? []),
          book.sourceMetadata?.workId,
          ...(book.sourceMetadata?.workIds ?? []),
        ]),
        editionIds: unique([
          ...(existing.sourceMetadata?.editionIds ?? []),
          ...(book.sourceMetadata?.editionIds ?? []),
        ]),
        isbns: unique([
          ...(existing.sourceMetadata?.isbns ?? []),
          ...(book.sourceMetadata?.isbns ?? []),
        ]),
      };
      localizationDuplicates.push({
        kind: "merged_imported_books_after_localization",
        keptId: existing.id,
        removedId: book.id,
        title: book.title,
        author: book.author,
        workIds: unique([book.sourceMetadata?.workId, ...(book.sourceMetadata?.workIds ?? [])]),
      });
      continue;
    }
    localizedByTitleAuthor.set(key, book);
    deduplicatedReady.push(book);
  }
  ready.length = 0;
  ready.push(...deduplicatedReady);
  const readyIds = new Set(ready.map((book) => book.id));
  const deduplicatedConfidence = confidence.filter((item) => readyIds.has(item.bookId));
  confidence.length = 0;
  confidence.push(...deduplicatedConfidence);

  const combined = [...production, ...ready];
  const ids = new Set();
  const slugs = new Set();
  const titleAuthors = new Set();
  for (const book of combined) {
    const key = `${normalizeMatch(book.title)}|${normalizeMatch(book.author)}`;
    if (ids.has(book.id)) throw new Error(`Duplicate id after localization: ${book.id}`);
    if (slugs.has(book.slug)) throw new Error(`Duplicate slug after localization: ${book.slug}`);
    if (titleAuthors.has(key)) throw new Error(`Duplicate title and author after localization: ${book.title} / ${book.author}`);
    ids.add(book.id); slugs.add(book.slug); titleAuthors.add(key);
  }
  if (JSON.stringify(combined.slice(0, 200)) !== JSON.stringify(production)) throw new Error("Editorial records changed during the second pass");

  const previousReadyIds = new Set(previousReady.map((book) => book.id));
  const recoveredPublished = ready.filter((book) => !previousReadyIds.has(book.id)).length;
  const previousReadyLostToTranslation = previousReady.filter((book) => !ready.some((item) => item.id === book.id)).length;
  const blockerCounts = incomplete.reduce((result, item) => {
    for (const blocker of item.criticalBlockers ?? []) result[blocker] = (result[blocker] ?? 0) + 1;
    return result;
  }, {});
  const summary = {
    ...previousSummary,
    generatedAt: options.checkedAt,
    secondPass: {
      version: SECOND_PASS_VERSION,
      previousReady: previousReady.length,
      previousIncomplete: previousIncomplete.length,
      recoveredBeforeTranslation,
      recoveredPublished,
      previousReadyLostToTranslation,
      publishReadyAfterLocalization: ready.length,
      incompleteAfterSecondPass: incomplete.length,
      needsTranslation: needsTranslation.length,
      localizationDuplicates: localizationDuplicates.length,
      criticalBlockers: Object.fromEntries(Object.entries(blockerCounts).sort((left, right) => right[1] - left[1])),
    },
    counts: {
      ...previousSummary.counts,
      publishReady: ready.length,
      incomplete: incomplete.length,
      needsTranslation: needsTranslation.length,
      finalCatalog: combined.length,
    },
    completion: {
      descriptions: percentage(ready, (book) => compact(book.shortDescription)),
      covers: percentage(ready, (book) => book.cover?.kind === "external"),
      ages: percentage(ready, (book) => Number.isInteger(book.ageMin) && Number.isInteger(book.ageMax)),
      genres: percentage(ready, (book) => book.genres?.length),
      themes: percentage(ready, (book) => book.themes?.length),
      moods: percentage(ready, (book) => book.moods?.length),
      readingMode: percentage(ready, (book) => book.readingMode),
      localizedTitles: percentage(ready, (book) => hasCyrillic(book.title) && !hasUnsafeDisplayMarkers(book.title)),
      localizedAuthors: percentage(ready, (book) => compact(book.author).split(/\s*;\s*/u).every((author) => hasCyrillic(author) && !hasUnsafeDisplayMarkers(author))),
    },
    productionPreserved: true,
    productionConnected: false,
  };

  await Promise.all([
    writeFile(resolve(options.output, "catalog.json"), `${JSON.stringify(combined, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "new-publish-ready.json"), `${JSON.stringify(ready, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "incomplete-drafts.json"), `${JSON.stringify(incomplete, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "needs-translation.json"), `${JSON.stringify(needsTranslation, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "localization-duplicates.json"), `${JSON.stringify(localizationDuplicates, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "field-confidence.jsonl"), confidence.map(JSON.stringify).join("\n") + (confidence.length ? "\n" : ""), "utf8"),
    writeFile(resolve(options.output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "sample-100.json"), `${JSON.stringify(seededSample(ready, Math.min(100, ready.length), options.seed), null, 2)}\n`, "utf8"),
    writeFile(resolve(options.output, "sample-50-app-view.json"), `${JSON.stringify(seededSample(ready, Math.min(50, ready.length), options.seed + 1).map(appViewCard), null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify(summary.secondPass, null, 2));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { ...defaults };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[++index];
    if (key === "--catalog") options.catalog = resolve(value);
    else if (key === "--ready") options.ready = resolve(value);
    else if (key === "--incomplete") options.incomplete = resolve(value);
    else if (key === "--output") options.output = resolve(value);
    else if (key === "--checked-at") options.checkedAt = value;
    else if (key === "--seed") options.seed = Number(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  await reevaluatePublishReady(options);
}
