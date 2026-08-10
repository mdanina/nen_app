import fs from "node:fs/promises";
import path from "node:path";

const sourcePath = "data/source/watch-v2.json";
const reportPath = "data/reports/watch-russian-title-research.json";
const cachePath = "data/reports/cache/watch-russian-title-research.json";
const userAgent = "NENWatchRussianTitleResearch/1.0 (editorial catalog audit)";
const finalizeOnly = process.argv.includes("--finalize-only");
const applyConfirmed = process.argv.includes("--apply-confirmed");
const indexOnly = process.argv.includes("--index-only");
const tmdbOnly = process.argv.includes("--tmdb-only");
const wikipediaOnly = process.argv.includes("--wikipedia-only");
const cyrillic = /[А-ЯЁа-яё]/u;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanText = (value) => String(value ?? "")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&amp;/gu, "&")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&nbsp;/gu, " ").replace(/\s+/gu, " ").trim();
const normalize = (value) => cleanText(value).toLocaleLowerCase("ru")
  .replace(/[«»„“”"'’`]/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const qid = (item) => item.id.match(/^nen-wd-(q\d+)$/iu)?.[1]?.toUpperCase();
const claimValue = (entity, property) => entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
const sanitizeCandidate = (value) => {
  const candidate = cleanText(value)
    .replace(/\s*\((?:TV Series\s+)?\d{4}(?:[–-]\d{4})?\)$/iu, "")
    .trim();
  return candidate.endsWith("»") && !candidate.includes("«") ? candidate.slice(0, -1).trim() : candidate;
};
const invalidCandidate = (value) =>
  /порнофильм|неформальный разговорный|отсутствие морали|Великобритания, режисс[её]р|Джин Мэршек|Ламарка\s+1990|Хассе, Ханньо|^Жених$/iu.test(value);

async function fetchText(url, attempts = 4) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent, accept: "text/html,application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after")) * 1000;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 30_000 ? retryAfter : attempt * 3000);
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (current) {
      error = current;
    }
  }
  throw error;
}

const invalidEvidence = (item, entry) =>
  (item.originalTitle === "The Adventures of Robin Hood" && entry.url.includes("1938_")) ||
  (item.originalTitle === "Il flauto magico" && entry.url.includes("2020")) ||
  ["L’Animale", "Epiphany", "Xuxa e o Tesouro da Cidade Perdida", "Das blaue Licht"].includes(item.originalTitle) &&
    entry.source.startsWith("Русская Википедия");

const editorialEvidenceById = new Map(Object.entries({
  "nen-wd-q7730764": ["Голубь", "Кинопоиск — точная карточка фильма", "https://www.kinopoisk.ru/film/11865/stills/", "exact-kinopoisk-id:11865"],
  "nen-wd-q3210370": ["Дом ангела", "Афиша — карточка фильма", "https://www.afisha.ru/movie/dom-angela-177185/", "original-title+year+director"],
  "nen-wd-q10320133": ["Хрустальная луна", "Кинопоиск — точная карточка фильма", "https://www.kinopoisk.ru/film/56597/", "exact-kinopoisk-id:56597"],
  "nen-wd-q1216067": ["Я начинаю считать", "Кинопоиск — индекс точной фильмографии", "https://www.kinopoisk.ru/lists/movies/country--11/year--1969/?b=films", "original-title+year+director"],
  "nen-wd-q1171138": ["Летающий класс", "Русская Википедия — точная фильмография", "https://ru.wikipedia.org/wiki/Клингер,_Пауль", "original-title+year"],
  "nen-wd-q1197386": ["Дьявол из Мюленберга", "IMDb — русский AKA точного IMDb ID", "https://www.imdb.com/title/tt0047571/", "exact-imdb-id:tt0047571"],
  "nen-wd-q1171629": ["Храбрый портняжка", "Кинопоиск — индекс фильмов", "https://www.kinopoisk.ru/lists/movies/country--60/year--1956-1956/?b=films", "original-title+year+director"],
  "nen-wd-q11965280": ["Стойкий оловянный солдатик", "Русскоязычный каталог анимации Иво Каприно", "https://www.norge.ru/caprino_teiknefilm/", "original-title+year+creator"],
  "nen-wd-q5813249": ["Дон Кихот Ламанческий", "Русская Википедия — перечень экранизаций", "https://ru.wikipedia.org/wiki/Дон_Кихот", "original-title+year+country+format"],
  "nen-wd-q5637724": ["Роб Рой", "IMDb — русский AKA точного IMDb ID", "https://www.imdb.com/title/tt0816630/", "exact-imdb-id:tt0816630"],
  "nen-wd-q5967621": ["Приключения Одиссея", "Афиша — карточка мультфильма", "https://www.afisha.ru/movie/priklyucheniya-odisseya-194210/", "original-title+year+director"],
  "nen-wd-q5228000": ["Мануэлита", "Бюллетень кинопрокатчика — карточка фильма", "https://www.kinobusiness.com/movies/manuelita/", "original-title+imdb-id+director"],
  "nen-wd-q21981149": ["Рождественская ёлка", "Кинопоиск — индекс анимации", "https://www.kinopoisk.ru/lists/movies/genre--animation/country--10/", "original-title+year+director"],
  "nen-wd-q1116775": ["Мавр и вороны Лондона", "Русская Википедия — точная фильмография", "https://ru.wikipedia.org/wiki/Хассе,_Ханньо", "original-title+year"],
  "nen-wd-q12308184": ["Умный человек", "Кинопоиск — точная фильмография", "https://www.kinopoisk.ru/name/530089/", "original-title+year"],
  "nen-wd-q57592347": ["Врата времени", "Бюллетень кинопрокатчика — карточка фильма", "https://www.kinobusiness.com/movies/vrata-vremeni/", "original-title+year+director"],
  "nen-wd-q21032627": ["Пророчество Алхамбра", "Афиша — карточка мультфильма", "https://www.afisha.ru/movie/prorochestvo-alhambra-205352/", "original-title+year+director"],
  "nen-wd-q113238923": ["Валентино и клан Пса", "Кинопоиск — индекс анимации", "https://www.kinopoisk.ru/lists/movies/genre--animation/year--2008/?b=films&page=3", "original-title+year+director"],
  "nen-wd-q5824894": ["Загадка Чико Крокеты", "Русская Википедия — список номинантов премии Гойя", "https://ru.wikipedia.org/wiki/Гойя_(премия,_2005)", "original-title+award-year+format"],
  "nen-wd-q1169631": ["Свет любви", "Русскоязычная кинобаза — карточка точного IMDb ID", "https://www.okino.ua/film/svet-lyubvi-120197/", "exact-imdb-id:tt0234102+year+director"],
}));

function editorialEvidence(item) {
  const value = editorialEvidenceById.get(item.id);
  if (!value) return [];
  const [candidate, source, url, match] = value;
  return [{ candidate, source, url, match, confidence: 0.96 }];
}

async function loadEntity(item) {
  const id = qid(item);
  if (!id) return undefined;
  const payload = JSON.parse(await fetchText(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`));
  return payload.entities?.[id];
}

async function loadIdentifierIndex(items) {
  const ids = items.map(qid).filter(Boolean);
  const values = ids.map((id) => `wd:${id}`).join(" ");
  const query = `SELECT ?item ?kinopoisk ?imdb ?tmdbMovie ?tmdbTv ?director ?directorLabel ?ruLabel ?ruAlias ?ruTitle ?ruArticle WHERE {
    VALUES ?item { ${values} }
    OPTIONAL { ?item wdt:P2603 ?kinopoisk }
    OPTIONAL { ?item wdt:P345 ?imdb }
    OPTIONAL { ?item wdt:P4947 ?tmdbMovie }
    OPTIONAL { ?item wdt:P4983 ?tmdbTv }
    OPTIONAL { ?item wdt:P57 ?director }
    OPTIONAL { ?item rdfs:label ?ruLabel FILTER(LANG(?ruLabel) = "ru") }
    OPTIONAL { ?item skos:altLabel ?ruAlias FILTER(LANG(?ruAlias) = "ru") }
    OPTIONAL { ?item wdt:P1476 ?ruTitle FILTER(LANG(?ruTitle) = "ru") }
    OPTIONAL { ?ruArticle schema:about ?item; schema:isPartOf <https://ru.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
  }`;
  let response;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    response = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "user-agent": userAgent,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query, format: "json" }),
      signal: AbortSignal.timeout(120_000),
    });
    if (response.ok) break;
    if (response.status !== 429 && response.status < 500) break;
    await sleep(attempt * 5_000);
  }
  if (!response?.ok) throw new Error(`Wikidata SPARQL: HTTP ${response?.status ?? "network error"}`);
  const bindings = (await response.json()).results.bindings;
  const index = new Map(ids.map((id) => [id, {
    wikidata: id, kinopoisk: null, imdb: null, tmdbMovie: null, tmdbTv: null,
    directors: [], ruLabel: null, ruAliases: [], ruTitles: [], ruArticle: null,
  }]));
  for (const row of bindings) {
    const id = row.item.value.match(/Q\d+$/u)?.[0];
    const entry = index.get(id);
    if (!entry) continue;
    entry.kinopoisk ??= row.kinopoisk?.value ?? null;
    entry.imdb ??= row.imdb?.value ?? null;
    entry.tmdbMovie ??= row.tmdbMovie?.value ?? null;
    entry.tmdbTv ??= row.tmdbTv?.value ?? null;
    entry.ruLabel ??= row.ruLabel?.value ?? null;
    if (row.ruAlias?.value && !entry.ruAliases.includes(row.ruAlias.value)) entry.ruAliases.push(row.ruAlias.value);
    if (row.ruTitle?.value && !entry.ruTitles.includes(row.ruTitle.value)) entry.ruTitles.push(row.ruTitle.value);
    entry.ruArticle ??= row.ruArticle?.value ?? null;
    if (row.director?.value) {
      const director = { id: row.director.value.match(/Q\d+$/u)?.[0], name: row.directorLabel?.value ?? null };
      if (!entry.directors.some((value) => value.id === director.id)) entry.directors.push(director);
    }
  }
  return index;
}

function wikidataEvidence(entity) {
  const evidence = [];
  const label = entity?.labels?.ru?.value;
  const sitelink = entity?.sitelinks?.ruwiki?.title;
  if (label && cyrillic.test(label)) evidence.push({
    candidate: cleanText(label), source: "Wikidata — русская метка точного QID",
    url: `https://www.wikidata.org/wiki/${entity.id}`, match: "exact-wikidata-id", confidence: 0.98,
  });
  if (sitelink && cyrillic.test(sitelink)) evidence.push({
    candidate: cleanText(sitelink.replace(/\s+\([^)]*\)$/u, "")), source: "Русская Википедия — sitelink точного QID",
    url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(sitelink.replaceAll(" ", "_"))}`,
    match: "exact-wikidata-sitelink", confidence: 0.97,
  });
  return evidence;
}

async function tmdbEvidence(item, identifiers) {
  const movieId = identifiers?.tmdbMovie;
  const tvId = identifiers?.tmdbTv;
  const id = movieId ?? tvId;
  if (!id) return [];
  const media = movieId ? "movie" : "tv";
  const url = `https://www.themoviedb.org/${media}/${id}?language=ru-RU`;
  const html = await fetchText(url);
  const pageTitle = sanitizeCandidate(cleanText(html.match(/<title>(.*?)<\/title>/isu)?.[1])
    .replace(/\s*\(\d{4}(?:–\d{4})?\).*$/u, "")
    .replace(/\s*[—-]\s*The Movie Database.*$/iu, "").trim());
  if (!pageTitle || !cyrillic.test(pageTitle)) return [];
  return [{
    candidate: pageTitle, source: "TMDb — русская локализация страницы точного TMDb ID", url,
    match: `exact-tmdb-${media}-id:${id}`, confidence: 0.94,
  }];
}

function indexedWikidataEvidence(identifiers) {
  const evidence = [];
  if (identifiers?.ruLabel && cyrillic.test(identifiers.ruLabel)) evidence.push({
    candidate: identifiers.ruLabel,
    source: "Wikidata — русская метка точного QID",
    url: `https://www.wikidata.org/wiki/${identifiers.wikidata}`,
    match: `exact-wikidata-id:${identifiers.wikidata}`,
    confidence: 0.98,
  });
  if (identifiers?.ruArticle) {
    const title = decodeURIComponent(identifiers.ruArticle.split("/wiki/")[1] ?? "").replaceAll("_", " ");
    if (cyrillic.test(title)) evidence.push({
      candidate: title.replace(/\s+\([^)]*\)$/u, ""),
      source: "Русская Википедия — статья точного Wikidata QID",
      url: identifiers.ruArticle,
      match: `exact-wikidata-sitelink:${identifiers.wikidata}`,
      confidence: 0.97,
    });
  }
  for (const value of identifiers?.ruTitles ?? []) if (cyrillic.test(value)) evidence.push({
    candidate: value,
    source: "Wikidata — русское название произведения у точного QID",
    url: `https://www.wikidata.org/wiki/${identifiers.wikidata}`,
    match: `exact-wikidata-title:${identifiers.wikidata}`,
    confidence: 0.96,
  });
  for (const value of identifiers?.ruAliases ?? []) if (cyrillic.test(value)) evidence.push({
    candidate: value,
    source: "Wikidata — русский alias точного QID",
    url: `https://www.wikidata.org/wiki/${identifiers.wikidata}`,
    match: `exact-wikidata-alias:${identifiers.wikidata}`,
    confidence: 0.95,
  });
  return evidence;
}

function bilingualCandidates(item, results) {
  const original = cleanText(item.originalTitle);
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(`([А-ЯЁ][А-ЯЁа-яё0-9 ,.!?«»„“”'’:\\-]{2,100})\\s*[\\/|—–-]\\s*${escaped}`, "iu"),
    new RegExp(`([А-ЯЁ][А-ЯЁа-яё0-9 ,.!?«»„“”'’:\\-]{2,100})\\s*\\(${escaped}\\)`, "iu"),
  ];
  const evidence = [];
  for (const result of results) {
    const text = cleanText(`${result.title} ${result.snippet}`);
    if (!normalize(text).includes(normalize(original))) continue;
    for (const pattern of patterns) {
      const match = text.match(pattern)?.[1]?.trim().replace(/^[\d–—,:;\s]+/u, "");
      if (match && cyrillic.test(match) && match.length <= 100) {
        evidence.push({
          candidate: match, source: `Русская Википедия — точное двуязычное упоминание на странице «${result.title}»`,
          url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(result.title.replaceAll(" ", "_"))}`,
          match: `original-title:${original};year:${item.year}`, confidence: 0.9,
        });
        break;
      }
    }
  }
  return evidence;
}

async function wikipediaEvidence(item) {
  const query = `"${item.originalTitle}" ${item.year}`;
  const url = new URL("https://ru.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", format: "json", list: "search", srsearch: query, srlimit: "10", utf8: "1",
  });
  const payload = JSON.parse(await fetchText(url));
  return bilingualCandidates(item, payload?.query?.search ?? []);
}

function decide(item, identifiers, evidence, errors) {
  const grouped = new Map();
  for (const entry of evidence) {
    const key = normalize(entry.candidate);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  const ranked = [...grouped.values()].sort((a, b) =>
    Math.max(...b.map((x) => x.confidence)) - Math.max(...a.map((x) => x.confidence)) || b.length - a.length);
  const best = ranked[0] ?? [];
  const distinctSources = new Set(best.map((entry) => entry.source.split(" — ")[0])).size;
  const strongest = best.reduce((max, entry) => Math.max(max, entry.confidence), 0);
  const competingStrength = ranked[1]?.reduce((max, entry) => Math.max(max, entry.confidence), 0) ?? 0;
  const conflict = ranked.length > 1 && competingStrength >= strongest &&
    normalize(ranked[1][0].candidate) !== normalize(best[0]?.candidate);
  if (best.length && !conflict && (strongest >= 0.94 || distinctSources >= 2)) return {
    id: item.id, originalTitle: item.originalTitle, year: item.year, country: item.country,
    status: "CONFIRMED_RU", russianTitle: best[0].candidate, confidence: strongest,
    reason: strongest >= 0.94 ? "Точное сопоставление по внешнему идентификатору и году" : "Совпадение независимых источников",
    identifiers, provenance: best, rejectedCandidates: ranked.slice(1).flat(), errors,
  };
  if (best.length) return {
    id: item.id, originalTitle: item.originalTitle, year: item.year, country: item.country,
    status: "CANDIDATE_RU", russianTitle: best[0].candidate, confidence: strongest,
    reason: conflict ? "Найдены противоречащие друг другу русские варианты" : "Русский вариант найден, но источников недостаточно для автоматического применения",
    identifiers, provenance: best, rejectedCandidates: ranked.slice(1).flat(), errors,
  };
  return {
    id: item.id, originalTitle: item.originalTitle, year: item.year, country: item.country,
    status: "UNRESOLVED", russianTitle: null, confidence: strongest,
    reason: "Русское название не найдено; это не доказывает его отсутствия",
    identifiers, provenance: evidence, rejectedCandidates: ranked.slice(1).flat(), errors,
  };
}

await fs.mkdir(path.dirname(cachePath), { recursive: true });
const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const pending = catalog.filter((item) => item.titleLocalization === "original-only");
const identifierIndex = finalizeOnly ? new Map() : await loadIdentifierIndex(pending);
const previousReport = await fs.readFile(reportPath, "utf8").then(JSON.parse).catch(() => null);
const previousResults = new Map((previousReport?.results ?? []).map((result) => [result.id, result]));
const cache = await fs.readFile(cachePath, "utf8").then(JSON.parse).catch(() =>
  Object.fromEntries((previousReport?.results ?? []).map((result) => [result.id, result])));
let completed = 0;
let saveChain = Promise.resolve();
const saveCache = () => {
  saveChain = saveChain.then(async () => {
    const temporaryPath = `${cachePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, cachePath);
  });
  return saveChain;
};

async function research(item) {
  const identifiers = identifierIndex.get(qid(item)) ?? {
    wikidata: qid(item) ?? null, kinopoisk: null, imdb: null, tmdbMovie: null, tmdbTv: null, directors: [],
  };
  const previous = cache[item.id];
  const evidence = [...(previous?.provenance ?? []), ...(previous?.rejectedCandidates ?? []),
    ...indexedWikidataEvidence(identifiers), ...editorialEvidence(item)];
  const errors = (previous?.errors ?? []).filter((error) => error.source !== "Wikidata" && error.source !== "TMDb" && error.source !== "Русская Википедия");
  const hasTmdb = evidence.some((entry) => entry.source.startsWith("TMDb"));
  const hasWikipedia = evidence.some((entry) => entry.source.startsWith("Русская Википедия"));
  const loaders = [];
  if (!indexOnly && !wikipediaOnly && !hasTmdb) loaders.push(["TMDb", () => tmdbEvidence(item, identifiers)]);
  if (!indexOnly && !tmdbOnly && !hasWikipedia) loaders.push(["Русская Википедия", () => wikipediaEvidence(item)]);
  for (const [name, loader] of loaders) {
    try { evidence.push(...await loader()); }
    catch (error) { errors.push({ source: name, message: String(error?.message ?? error) }); }
  }
  const uniqueEvidence = evidence.filter((entry, index) => evidence.findIndex((other) =>
    normalize(other.candidate) === normalize(entry.candidate) && other.url === entry.url) === index);
  if (identifiers.kinopoisk) errors.push({
    source: "Кинопоиск",
    message: "Точный Kinopoisk ID найден через Wikidata; HTML-страница требует авторизацию и не использована как подтверждение",
    id: identifiers.kinopoisk,
  });
  cache[item.id] = decide(item, identifiers, uniqueEvidence, errors);
  completed += 1;
  if (completed % 20 === 0) {
    await saveCache();
    console.log(`Обработано ${completed}/${pending.length}`);
  }
}

if (!finalizeOnly) {
  const queue = pending.slice();
await Promise.all(Array.from({ length: 2 }, async () => {
    while (queue.length) await research(queue.shift());
  }));
  await saveCache();
}

const results = pending.map((item) => {
  const cached = cache[item.id] ?? previousResults.get(item.id);
  if (!cached) throw new Error(`В кэше отсутствует результат для ${item.id}`);
  const evidence = [...(cached.provenance ?? []), ...(cached.rejectedCandidates ?? [])]
    .map((entry) => ({ ...entry, candidate: sanitizeCandidate(entry.candidate) }))
    .filter((entry) => !invalidCandidate(entry.candidate) &&
      !invalidEvidence(item, entry) &&
      !/The Movie Database|TMDB|&#\d+;/iu.test(entry.candidate));
  return decide(item, cached.identifiers, evidence, cached.errors ?? []);
});
const counts = Object.fromEntries(["CONFIRMED_RU", "CANDIDATE_RU", "NO_RU_TITLE", "UNRESOLVED"].map((status) =>
  [status, results.filter((result) => result.status === status).length]));
const sourceStats = {
  kinopoiskIds: results.filter((result) => result.identifiers?.kinopoisk).length,
  kinopoiskTitleEvidence: results.filter((result) => result.provenance.some((entry) => entry.source.startsWith("Кинопоиск"))).length,
  tmdb: results.filter((result) => result.provenance.some((entry) => entry.source.startsWith("TMDb"))).length,
  wikidata: results.filter((result) => result.provenance.some((entry) => entry.source.startsWith("Wikidata"))).length,
  russianWikipedia: results.filter((result) => result.provenance.some((entry) => entry.source.startsWith("Русская Википедия"))).length,
  other: results.filter((result) => result.provenance.some((entry) => !/^(?:TMDb|Wikidata|Русская Википедия|Кинопоиск)/u.test(entry.source))).length,
};
const report = {
  generatedAt: new Date().toISOString(), sourceCatalog: sourcePath, catalogWasModified: false,
  methodology: {
    confirmed: "Точный внешний ID с русской локализацией либо совпадение независимых источников",
    noRuTitle: "Только явное положительное подтверждение отсутствия русской локализации; отсутствие поиска не достаточно",
    unresolved: "Недостаточно данных, конфликт вариантов или источники недоступны",
  },
  sourceAvailability: {
    kinopoisk: `${sourceStats.kinopoiskIds} точных ID получены через Wikidata; прямые страницы возвращают SSO-авторизацию, поэтому названия из них автоматически не извлекались`,
  },
  total: results.length, counts, sourceStats, results,
};
if (applyConfirmed) {
  const confirmed = new Map(results.filter((result) => result.status === "CONFIRMED_RU")
    .map((result) => [result.id, result]));
  const applied = [];
  for (const item of catalog) {
    const result = confirmed.get(item.id);
    if (!result || item.titleLocalization !== "original-only") continue;
    const previousTitle = item.title;
    item.title = result.russianTitle;
    item.titleLocalization = "official-ru";
    applied.push({ id: item.id, previousTitle, title: item.title, originalTitle: item.originalTitle });
  }
  const duplicateIds = catalog.filter((item, index) => catalog.findIndex((other) => other.id === item.id) !== index);
  const duplicateSlugs = catalog.filter((item, index) => catalog.findIndex((other) => other.slug === item.slug) !== index);
  if (duplicateIds.length || duplicateSlugs.length) throw new Error("Применение локализации обнаружило дубли id или slug");
  report.application = {
    appliedAt: new Date().toISOString(),
    appliedCount: applied.length,
    originalTitlesChanged: applied.filter((entry) => entry.originalTitle !==
      catalog.find((item) => item.id === entry.id)?.originalTitle).length,
    applied,
  };
  await fs.writeFile(sourcePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ total: report.total, counts, reportPath, cachePath }, null, 2));
