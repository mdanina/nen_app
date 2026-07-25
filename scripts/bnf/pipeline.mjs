import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const BNF_LICENSE = {
  code: "etalab-open-licence-2.0",
  label: "Licence ouverte de l'État 2.0",
  url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  documentation: "https://api.bnf.fr/fr/api-sru-catalogue-general",
};

const USER_AGENT = "NEN-Books-Import/0.1 (staging; bibliographic research)";
const SPARQL_ENDPOINT = "https://data.bnf.fr/sparql";
const SRU_ENDPOINT = "https://catalogue.bnf.fr/api/SRU";

const compact = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const unique = (values) => [...new Set(values.filter(Boolean))];
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

export function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gu, '"').replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
}

function fieldValues(xml, field) {
  const pattern = new RegExp(`<dc:${field}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/dc:${field}>`, "giu");
  return [...xml.matchAll(pattern)].map((match) => compact(decodeXml(match[1].replace(/<[^>]+>/gu, "")))).filter(Boolean);
}

export function parseSruDublinCore(xml) {
  const blocks = [...String(xml).matchAll(/<srw:record>([\s\S]*?)<\/srw:record>/gu)].map((match) => match[1]);
  return blocks.map((block) => {
    const recordId = compact(decodeXml(block.match(/<srw:recordIdentifier>([\s\S]*?)<\/srw:recordIdentifier>/u)?.[1]));
    const createdAt = compact(block.match(/<ixm:attr name="CreationDate">([\s\S]*?)<\/ixm:attr>/u)?.[1]);
    const updatedAt = compact(block.match(/<ixm:attr name="LastModificationDate">([\s\S]*?)<\/ixm:attr>/u)?.[1]);
    const identifiers = fieldValues(block, "identifier");
    return {
      recordId,
      ark: recordId || identifiers.map(extractArk).find(Boolean) || null,
      titles: fieldValues(block, "title"),
      creators: fieldValues(block, "creator"),
      contributors: fieldValues(block, "contributor"),
      descriptions: fieldValues(block, "description"),
      subjects: fieldValues(block, "subject"),
      languages: fieldValues(block, "language").map(normalizeLanguage),
      identifiers,
      publishers: fieldValues(block, "publisher"),
      dates: fieldValues(block, "date"),
      formats: fieldValues(block, "format"),
      types: fieldValues(block, "type"),
      rights: fieldValues(block, "rights"),
      createdAt: createdAt || null,
      updatedAt: updatedAt || null,
    };
  }).filter((record) => record.ark);
}

export function extractArk(value) {
  return compact(value).match(/ark:\/12148\/cb[0-9a-z]+/iu)?.[0]?.toLocaleLowerCase("en") ?? null;
}

export function normalizeLanguage(value) {
  const normalized = compact(value).toLocaleLowerCase("en");
  const aliases = { fr: "fre", fra: "fre", français: "fre", en: "eng", anglais: "eng", de: "ger", deu: "ger", allemand: "ger", ru: "rus", russe: "rus" };
  return aliases[normalized] ?? normalized;
}

export function cleanTitle(value) {
  return compact(value).split(/\s+\/\s+/u)[0].replace(/[\s,;:/]+$/gu, "").trim();
}

export function cleanAuthor(value) {
  let author = compact(value)
    .replace(/\s*\([^)]*(?:\d{4}|\.\.\.\.)[^)]*\)\s*/gu, " ")
    .replace(/\.\s*(?:Auteur(?: du texte)?|Autrice(?: du texte)?|Traducteur|Traductrice|Illustrateur|Illustratrice|Éditeur scientifique).*$/iu, "")
    .replace(/\s+/gu, " ").trim();
  const parts = author.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2 && !/\d/u.test(author)) author = `${parts[1]} ${parts[0]}`;
  return author;
}

export function isAuthorCreator(value) {
  const source = compact(value);
  if (/\b(?:auteur|autrice)(?: du texte)?\b/iu.test(source)) return true;
  return !/\.\s*(?:adaptateur|adaptatrice|compositeur|compositrice|dessinateur|dessinatrice|illustrateur|illustratrice|traducteur|traductrice|réalisateur|réalisatrice|voix parlée|interprète|narrateur|narratrice|photographe|préfacier|préfacière|éditeur scientifique|éditrice scientifique)\b/iu.test(source);
}

export function normalizeMatch(value) {
  return compact(value).toLocaleLowerCase("fr")
    .normalize("NFD").replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function canonicalTitleKey(value) {
  return normalizeMatch(cleanTitle(value)
    .replace(/\((?:nouv(?:elle)?\.?\s+(?:éd(?:ition)?|présentation)|réimpr(?:ession)?|nouvelle édition|édition revue)[^)]*\)/giu, " "));
}

export function isValidIsbn(value) {
  const isbn = String(value ?? "").replace(/[^0-9Xx]/gu, "").toLocaleUpperCase("en");
  if (isbn.length === 10) {
    const total = [...isbn].reduce((sum, character, index) => sum + (character === "X" ? 10 : Number(character)) * (10 - index), 0);
    return total % 11 === 0;
  }
  if (isbn.length === 13) {
    const total = [...isbn].reduce((sum, character, index) => sum + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
    return total % 10 === 0;
  }
  return false;
}

export function extractIsbns(identifiers) {
  return unique(identifiers.flatMap((identifier) => [...identifier.matchAll(/ISBN(?:-1[03])?\s*[: ]\s*(97[89][0-9\s-]{10,16}|[0-9][0-9Xx\s-]{8,15})/giu)]
    .map((match) => match[1].replace(/[^0-9Xx]/gu, "").toLocaleUpperCase("en"))
    .filter(isValidIsbn)));
}

export function isBookRecord(record) {
  const types = record.types.map(normalizeMatch);
  return types.some((type) => type === "text" || type.includes("texte imprime") || type.includes("printed text") || type.includes("electronic text"));
}

export function isTechnicalTitle(title) {
  const value = normalizeMatch(title);
  return !value || /^(sans titre|titre inconnu|document sans titre|untitled|s n)$/u.test(value) || value.length < 2;
}

export function isTechnicalDescription(value) {
  return /^(?:\[?exposition\b|collection\b|code à barres commercial\b|numéro commercial\b|ean\b|isbn\b|notice\b|copie\b|contient\b|comprend\b|extrait\b|lecteur de l'exemplaire\b|reprod\b|publication en série\b|variante\(s\) de titre\b|d'après la couv\b|la couv porte\b|titre de couv\b|traduit de\b)/iu.test(compact(value));
}

function editionFromRecord(record, workId, retrievedAt) {
  return {
    id: record.ark,
    bnfArk: record.ark,
    workId,
    title: record.titles[0] ?? null,
    creators: record.creators,
    contributors: record.contributors,
    descriptions: record.descriptions,
    subjects: record.subjects,
    languages: unique(record.languages),
    isbns: extractIsbns(record.identifiers),
    identifiers: record.identifiers,
    publishers: record.publishers,
    dates: record.dates,
    formats: record.formats,
    types: record.types,
    source: "bnf-sru",
    retrievedAt,
    licence: BNF_LICENSE,
    sourceCreatedAt: record.createdAt,
    sourceUpdatedAt: record.updatedAt,
  };
}

function preferredEdition(editions) {
  return [...editions].sort((left, right) => {
    const score = (edition) => (edition.isbns.length ? 4 : 0) + (edition.descriptions.some((value) => !isTechnicalDescription(value)) ? 3 : 0) + (edition.subjects.length ? 2 : 0) + (edition.languages.length ? 1 : 0);
    return score(right) - score(left) || left.id.localeCompare(right.id);
  })[0];
}

function mergeBookRecords(target, source) {
  target.bnfWorkIds = unique([...target.bnfWorkIds, ...source.bnfWorkIds]).sort();
  target.editions = [...target.editions, ...source.editions].sort((a, b) => a.id.localeCompare(b.id));
  target.bnfEditionArks = unique(target.editions.map((edition) => edition.bnfArk));
  target.isbns = unique(target.editions.flatMap((edition) => edition.isbns));
  target.sourceSubjects = unique([...target.sourceSubjects, ...source.sourceSubjects]);
  target.languages = unique([...target.languages, ...source.languages]);
  target.mergedWorkCount = target.bnfWorkIds.length;
  return target;
}

export function buildStagingBooks({ manifestationsByWork, recordsByArk, retrievedAt, maxBooks = 3000 }) {
  const exclusions = { missing_sru_record: 0, non_book: 0, missing_title: 0, missing_author: 0, technical_title: 0 };
  const candidates = [];
  let editionsCombined = 0;

  for (const [workId, arks] of [...manifestationsByWork.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const records = arks.map((ark) => recordsByArk.get(ark)).filter(Boolean);
    if (!records.length) { exclusions.missing_sru_record += 1; continue; }
    const bookRecords = records.filter(isBookRecord);
    if (!bookRecords.length) { exclusions.non_book += 1; continue; }
    const titleGroups = new Map();
    for (const record of bookRecords) {
      const title = cleanTitle(record.titles[0]);
      if (!title) { exclusions.missing_title += 1; continue; }
      if (isTechnicalTitle(title)) { exclusions.technical_title += 1; continue; }
      const titleKey = canonicalTitleKey(title);
      if (!titleGroups.has(titleKey)) titleGroups.set(titleKey, []);
      titleGroups.get(titleKey).push(record);
    }
    for (const [titleKey, sourceRecords] of titleGroups) {
      const editions = sourceRecords.map((record) => editionFromRecord(record, workId, retrievedAt));
      const preferred = preferredEdition(editions);
      const title = cleanTitle(preferred.title);
      const rawAuthorValues = editions.flatMap((edition) => edition.creators);
      const authors = unique(rawAuthorValues.filter(isAuthorCreator).map(cleanAuthor).filter(Boolean));
      if (!authors.length) { exclusions.missing_author += 1; continue; }
      const sourceDescriptions = unique(editions.flatMap((edition) => edition.descriptions));
      const description = sourceDescriptions.find((value) => !isTechnicalDescription(value)) ?? null;
      const sourceSubjects = unique(editions.flatMap((edition) => edition.subjects));
      const languages = unique(editions.flatMap((edition) => edition.languages));
      const isbns = unique(editions.flatMap((edition) => edition.isbns));
      editionsCombined += Math.max(0, editions.length - 1);
      candidates.push({
      id: `bnf-book:${hash(`${workId}|${titleKey}`).slice(0, 24)}`,
      title,
      authors,
      author: authors.join("; "),
      description,
      descriptionProvenance: description ? {
        source: "bnf-sru-dublin-core-description",
        sourceRecordIds: editions.filter((edition) => edition.descriptions.includes(description)).map((edition) => edition.id),
        retrievedAt,
        licence: BNF_LICENSE,
        originStatus: "unclassified-bibliographic-description",
        publicUseStatus: "editorial-review-required",
        textUnmodified: true,
      } : null,
      sourceDescriptions,
      sourceSubjects,
      languages,
      isbns,
      bnfWorkIds: [workId],
      bnfEditionArks: editions.map((edition) => edition.bnfArk),
      editions,
      provenance: {
        title: { source: "bnf-sru", sourceRecordId: preferred.id, rawValue: preferred.title, normalizedValue: title, retrievedAt, licence: BNF_LICENSE },
        authors: { source: "bnf-sru", sourceRecordIds: editions.map((edition) => edition.id), rawValues: rawAuthorValues, normalizedValue: authors, retrievedAt, licence: BNF_LICENSE },
        description: description ? { source: "bnf-sru-dublin-core-description", sourceRecordIds: editions.filter((edition) => edition.descriptions.includes(description)).map((edition) => edition.id), rawValue: description, normalizedValue: description, retrievedAt, licence: BNF_LICENSE, publicUseStatus: "editorial-review-required" } : null,
        sourceSubjects: { source: "bnf-sru", sourceRecordIds: editions.map((edition) => edition.id), rawValues: sourceSubjects, normalizedValue: sourceSubjects, retrievedAt, licence: BNF_LICENSE },
        languages: { source: "bnf-sru", sourceRecordIds: editions.map((edition) => edition.id), rawValues: languages, normalizedValue: languages, retrievedAt, licence: BNF_LICENSE },
        isbns: { source: "bnf-sru", sourceRecordIds: editions.map((edition) => edition.id), rawValues: editions.flatMap((edition) => edition.identifiers), normalizedValue: isbns, retrievedAt, licence: BNF_LICENSE },
        bnfWorkIds: { source: "bnf-sparql", sourceRecordIds: [workId], rawValues: [workId], normalizedValue: [workId], retrievedAt, licence: BNF_LICENSE },
        bnfEditionArks: { source: "bnf-sru", sourceRecordIds: editions.map((edition) => edition.id), rawValues: editions.map((edition) => edition.bnfArk), normalizedValue: editions.map((edition) => edition.bnfArk), retrievedAt, licence: BNF_LICENSE },
      },
      productionStatus: "staging-only",
      mergedWorkCount: 1,
      });
    }
  }

  const deduplicated = new Map();
  let duplicateWorksMerged = 0;
  for (const candidate of candidates) {
    const key = `${canonicalTitleKey(candidate.title)}|${candidate.authors.map(normalizeMatch).sort().join("|")}`;
    if (deduplicated.has(key)) {
      mergeBookRecords(deduplicated.get(key), candidate);
      duplicateWorksMerged += 1;
    } else deduplicated.set(key, candidate);
  }

  const qualityScore = (book) => (book.description ? 5 : 0) + (book.isbns.length ? 4 : 0) + (book.sourceSubjects.length ? 2 : 0) + (book.languages.length ? 1 : 0) + Math.min(2, book.editions.length - 1);
  const allBooks = [...deduplicated.values()].sort((a, b) => qualityScore(b) - qualityScore(a) || a.id.localeCompare(b.id));
  return {
    books: allBooks.slice(0, maxBooks),
    cleanedBeforeCap: allBooks.length,
    excludedByCap: Math.max(0, allBooks.length - maxBooks),
    exclusions,
    duplicateWorksMerged,
    editionsCombined,
  };
}

export function seededSample(values, count, seed) {
  let state = Number(seed) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return values.map((value) => ({ value, order: random() })).sort((a, b) => a.order - b.order).slice(0, count).map(({ value }) => value);
}

async function fetchWithRetry(url, options, fetchImpl, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...options, headers: { "User-Agent": USER_AGENT, ...(options?.headers ?? {}) }, signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(10_000, 750 * (2 ** (attempt - 1)))));
    }
  }
  throw lastError;
}

function sparqlDiscoveryQuery(limit, offset) {
  return `SELECT ?uri ?oeuvre WHERE { ?manifestation bnf-onto:ouvrageJeunesse "true"^^xsd:boolean ; rdarelationships:workManifested ?oeuvre ; rdfs:seeAlso ?uri. } LIMIT ${limit} OFFSET ${offset}`;
}

function sparqlManifestationsQuery(workIds) {
  const values = workIds.map((workId) => `<${workId}>`).join(" ");
  return `SELECT ?uri ?oeuvre WHERE { VALUES ?oeuvre { ${values} } ?manifestation bnf-onto:ouvrageJeunesse "true"^^xsd:boolean ; rdarelationships:workManifested ?oeuvre ; rdfs:seeAlso ?uri. } ORDER BY ?oeuvre ?uri`;
}

async function fetchSparql({ query, fetchImpl }) {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("format", "application/json");
  url.searchParams.set("query", query);
  const response = await fetchWithRetry(url, { headers: { Accept: "application/json" } }, fetchImpl);
  return response.json();
}

function sruUrl(arks) {
  const url = new URL(SRU_ENDPOINT);
  url.searchParams.set("version", "1.2");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("recordSchema", "dublincore");
  url.searchParams.set("maximumRecords", String(arks.length));
  url.searchParams.set("query", `bib.persistentid any "${arks.join(" ")}"`);
  return url;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(path, values) {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + (values.length ? "\n" : ""), "utf8");
}

export async function runBnfImport({ output, maxBooks = 3000, workTarget = 4500, sparqlPageSize = 500, sruBatchSize = 40, retrievedAt = new Date().toISOString(), seed = 20260722, fetchImpl = fetch }) {
  const root = resolve(output);
  const rawSparql = join(root, "raw", "sparql");
  const rawSru = join(root, "raw", "sru");
  const reports = join(root, "reports");
  await rm(root, { recursive: true, force: true });
  await Promise.all([mkdir(rawSparql, { recursive: true }), mkdir(rawSru, { recursive: true }), mkdir(reports, { recursive: true })]);

  const workIds = [];
  let offset = 0;
  let page = 0;
  while (workIds.length < workTarget) {
    const payload = await fetchSparql({ query: sparqlDiscoveryQuery(sparqlPageSize, offset), fetchImpl });
    const bindings = payload?.results?.bindings ?? [];
    await writeJson(join(rawSparql, `discovery-${String(page + 1).padStart(4, "0")}.json`), payload);
    if (!bindings.length) break;
    for (const binding of bindings) if (binding.oeuvre?.value && !workIds.includes(binding.oeuvre.value)) workIds.push(binding.oeuvre.value);
    offset += bindings.length;
    page += 1;
    console.error(`[BnF] SPARQL discovery: ${workIds.length}/${workTarget} works from ${offset} rows`);
    if (bindings.length < sparqlPageSize) break;
  }

  const selectedWorkIds = workIds.slice(0, workTarget);
  const selectedWorks = new Map(selectedWorkIds.map((workId) => [workId, []]));
  let sparqlRows = 0;
  const workBatchSize = 50;
  for (let index = 0; index < selectedWorkIds.length; index += workBatchSize) {
    const batchWorkIds = selectedWorkIds.slice(index, index + workBatchSize);
    const payload = await fetchSparql({ query: sparqlManifestationsQuery(batchWorkIds), fetchImpl });
    const bindings = payload?.results?.bindings ?? [];
    const batch = Math.floor(index / workBatchSize) + 1;
    await writeJson(join(rawSparql, `manifestations-${String(batch).padStart(4, "0")}.json`), payload);
    for (const binding of bindings) {
      const workId = binding.oeuvre?.value;
      const ark = extractArk(binding.uri?.value);
      if (workId && ark && selectedWorks.has(workId) && !selectedWorks.get(workId).includes(ark)) selectedWorks.get(workId).push(ark);
    }
    sparqlRows += bindings.length;
    if (batch === 1 || batch % 10 === 0 || index + workBatchSize >= selectedWorkIds.length) {
      console.error(`[BnF] SPARQL manifestations: batch ${batch}/${Math.ceil(selectedWorkIds.length / workBatchSize)}, ${sparqlRows} rows`);
    }
  }

  const arkToWork = new Map();
  for (const [workId, arks] of selectedWorks) for (const ark of arks) arkToWork.set(ark, workId);
  const allArks = [...arkToWork.keys()];
  const recordsByArk = new Map();
  let sruRecords = 0;
  for (let index = 0; index < allArks.length; index += sruBatchSize) {
    const arks = allArks.slice(index, index + sruBatchSize);
    const response = await fetchWithRetry(sruUrl(arks), { headers: { Accept: "application/xml,text/xml" } }, fetchImpl);
    const xml = await response.text();
    const batch = Math.floor(index / sruBatchSize) + 1;
    await writeFile(join(rawSru, `batch-${String(batch).padStart(4, "0")}.xml`), xml, "utf8");
    const records = parseSruDublinCore(xml);
    sruRecords += records.length;
    for (const record of records) recordsByArk.set(record.ark, record);
    if (batch === 1 || batch % 10 === 0 || index + sruBatchSize >= allArks.length) {
      console.error(`[BnF] SRU: batch ${batch}/${Math.ceil(allArks.length / sruBatchSize)}, ${sruRecords} records`);
    }
  }

  const built = buildStagingBooks({ manifestationsByWork: selectedWorks, recordsByArk, retrievedAt, maxBooks });
  const books = built.books;
  const editions = books.flatMap((book) => book.editions);
  const languageDistribution = Object.fromEntries([...books.flatMap((book) => book.languages).reduce((map, language) => map.set(language, (map.get(language) ?? 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const sample = seededSample(books, Math.min(30, books.length), seed).map((book) => ({ id: book.id, title: book.title, author: book.author, description: book.description, sourceSubjects: book.sourceSubjects, languages: book.languages, isbns: book.isbns, bnfWorkIds: book.bnfWorkIds, bnfEditionArks: book.bnfEditionArks }));
  const summary = {
    source: "Bibliothèque nationale de France",
    retrievedAt,
    licence: BNF_LICENSE,
    productionIntegration: false,
    limits: { maxBooks, workTarget, sparqlPageSize, sruBatchSize },
    counts: {
      sparqlRows,
      distinctWorksFromSparql: workIds.length,
      worksSelectedForSru: selectedWorks.size,
      manifestationArksSelected: allArks.length,
      sruRecords,
      cleanedUniqueBeforeCap: built.cleanedBeforeCap,
      stagingBooks: books.length,
      editionsInStaging: editions.length,
      editionsCombined: Math.max(0, editions.length - books.length),
      duplicateWorksMerged: books.reduce((count, book) => count + Math.max(0, book.bnfWorkIds.length - 1), 0),
      booksWithMultipleEditions: books.filter((book) => book.editions.length > 1).length,
      booksWithDescription: books.filter((book) => book.description).length,
      booksWithIsbn: books.filter((book) => book.isbns.length).length,
      excludedByCap: built.excludedByCap,
    },
    exclusions: built.exclusions,
    languageDistribution,
  };

  await Promise.all([
    writeJsonLines(join(root, "books.jsonl"), books),
    writeJsonLines(join(root, "editions.jsonl"), editions),
    writeJson(join(reports, "summary.json"), summary),
    writeJson(join(reports, "random-sample-30.json"), sample),
    writeJson(join(reports, "exclusions.json"), built.exclusions),
    writeJson(join(reports, "languages.json"), languageDistribution),
    writeJson(join(reports, "source-works.json"), Object.fromEntries(selectedWorks)),
  ]);
  return { summary, sample };
}
