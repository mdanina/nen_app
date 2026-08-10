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
const analyticsOnly = process.argv.includes("--analytics-only");
const removeKnownDuplicate = process.argv.includes("--remove-known-duplicate");
const analyticsJsonPath = "data/reports/watch-original-only-analysis.json";
const analyticsMarkdownPath = "data/reports/watch-original-only-analysis.md";
const incrementalReviewPath = "data/reports/watch-russian-title-incremental-review.json";
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
let catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
let duplicateRemoval = null;
if (removeKnownDuplicate) {
  const kept = catalog.find((item) => item.id === "nen-593");
  const removed = catalog.find((item) => item.id === "nen-wd-q16661378");
  if (!kept || !removed) throw new Error("Не найдены обе карточки подтверждённого дубля Лулу");
  if (kept.originalTitle !== removed.originalTitle || kept.year !== removed.year) {
    throw new Error("Карточки Лулу не совпадают по originalTitle и году; удаление отменено");
  }
  catalog = catalog.filter((item) => item.id !== removed.id);
  duplicateRemoval = {
    kept: { id: kept.id, slug: kept.slug, title: kept.title, originalTitle: kept.originalTitle, year: kept.year },
    removed: { id: removed.id, slug: removed.slug, title: removed.title, originalTitle: removed.originalTitle, year: removed.year },
    reason: "nen-593 — более полная редакционная карточка со стабильным slug; nen-wd-q16661378 — поздний импорт того же произведения из Wikidata",
  };
  await fs.writeFile(sourcePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}
const pending = catalog.filter((item) => item.titleLocalization === "original-only");
const identifierIndex = (finalizeOnly || analyticsOnly) ? new Map() : await loadIdentifierIndex(pending);
const previousReport = await fs.readFile(reportPath, "utf8").then(JSON.parse).catch(() => null);
const previousResults = new Map((previousReport?.results ?? []).map((result) => [result.id, result]));
const cache = await fs.readFile(cachePath, "utf8").then(JSON.parse).catch(() =>
  Object.fromEntries((previousReport?.results ?? []).map((result) => [result.id, result])));
const incrementalReview = await fs.readFile(incrementalReviewPath, "utf8").then(JSON.parse).catch(() => ({ results: [] }));
const incrementalEvidenceById = new Map((incrementalReview.results ?? []).map((result) => [result.id, {
  candidate: result.russianTitle,
  source: result.source,
  url: result.sourceUrl,
  match: result.match,
  confidence: result.confidence,
  sourceId: result.sourceId,
  reason: result.reason,
}]));

if (analyticsOnly) {
  const countBy = (values) => Object.fromEntries([...values.reduce((map, value) =>
    map.set(value, (map.get(value) ?? 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")));
  const hasTechnicalError = (entry, pattern) => (entry?.errors ?? []).some((error) =>
    pattern.test(`${error.source ?? ""} ${error.message ?? ""}`));
  const records = pending.map((item) => {
    const cached = cache[item.id] ?? previousResults.get(item.id) ?? {};
    const identifiers = {
      kinopoisk: cached.identifiers?.kinopoisk ?? null,
      tmdbMovie: cached.identifiers?.tmdbMovie ?? null,
      tmdbTv: cached.identifiers?.tmdbTv ?? null,
      imdb: cached.identifiers?.imdb ?? null,
      wikidata: cached.identifiers?.wikidata ?? qid(item) ?? null,
    };
    const directors = cached.identifiers?.directors ?? [];
    const exactCount = [identifiers.kinopoisk, identifiers.tmdbMovie ?? identifiers.tmdbTv,
      identifiers.imdb, identifiers.wikidata].filter(Boolean).length;
    const kpBlocked = hasTechnicalError(cached, /Кинопоиск|Kinopoisk|SSO|авторизац/iu);
    const tmdbLimited = hasTechnicalError(cached, /TMDb.*429|429.*TMDb|HTTP 429/iu);
    const wikipediaLimited = hasTechnicalError(cached, /Википедия.*429|429.*Википедия/iu);
    let priorityGroup;
    let previousFailureReason;
    let recommendedNextSearch;
    if (identifiers.kinopoisk || ((identifiers.tmdbMovie || identifiers.tmdbTv) && tmdbLimited)) {
      priorityGroup = "A";
      previousFailureReason = identifiers.kinopoisk
        ? "Точный Kinopoisk ID известен, но прямой HTML возвращал SSO/авторизацию и не дал пригодного названия"
        : "Точный TMDb ID известен, но предыдущую проверку ограничил HTTP 429";
      recommendedNextSearch = identifiers.kinopoisk
        ? "Точный lookup по Kinopoisk ID через разрешённый API/индекс либо поиск этого ID в индексируемых русскоязычных базах"
        : "TMDb translations по точному ID после cooldown с возобновляемым кэшем";
    } else if (identifiers.tmdbMovie || identifiers.tmdbTv || (identifiers.imdb && exactCount >= 2)) {
      priorityGroup = "B";
      previousFailureReason = "Точные внешние ID есть, но кэш не содержит надёжного русского title evidence";
      recommendedNextSearch = "Кросс-поиск по точным TMDb/IMDb/Wikidata ID в русскоязычных базах и каталогах проката";
    } else if (item.originalTitle && item.year && (directors.length || item.country?.length)) {
      priorityGroup = "C";
      previousFailureReason = wikipediaLimited
        ? "Автоматический источник был ограничен HTTP 429; точного локализованного ID-ответа нет"
        : "По точным ID русский вариант не найден или ID недостаточно";
      recommendedNextSearch = "Редакционный поиск по originalTitle + год + режиссёр/страна";
    } else {
      priorityGroup = "D";
      previousFailureReason = "Редкое произведение или недостаточный набор идентифицирующих метаданных и русскоязычных свидетельств";
      recommendedNextSearch = "Ручной поиск в фестивальных, телевизионных и национальных архивах";
    }
    return {
      id: item.id, currentTitle: item.title, originalTitle: item.originalTitle, year: item.year,
      country: item.country, kind: item.kind, directors, identifiers, exactIdentifierCount: exactCount,
      technicalLimits: { kinopoiskSso: kpBlocked, tmdb429: tmdbLimited, wikipedia429: wikipediaLimited },
      priorityGroup, previousFailureReason, recommendedNextSearch,
    };
  });
  const hasKp = (record) => Boolean(record.identifiers.kinopoisk);
  const hasTmdb = (record) => Boolean(record.identifiers.tmdbMovie || record.identifiers.tmdbTv);
  const hasImdb = (record) => Boolean(record.identifiers.imdb);
  const hasWd = (record) => Boolean(record.identifiers.wikidata);
  const byGroup = Object.fromEntries(["A", "B", "C", "D"].map((group) =>
    [group, records.filter((record) => record.priorityGroup === group).length]));
  const identifierGroups = {
    kinopoisk: records.filter(hasKp).length,
    tmdbAny: records.filter(hasTmdb).length,
    tmdbMovie: records.filter((record) => record.identifiers.tmdbMovie).length,
    tmdbTv: records.filter((record) => record.identifiers.tmdbTv).length,
    imdb: records.filter(hasImdb).length,
    wikidata: records.filter(hasWd).length,
    severalExactIdentifiers: records.filter((record) => record.exactIdentifierCount >= 2).length,
    onlyWikidataOrOther: records.filter((record) => hasWd(record) && !hasKp(record) && !hasTmdb(record) && !hasImdb(record)).length,
    noUsefulExternalIdentifiers: records.filter((record) => !hasKp(record) && !hasTmdb(record) && !hasImdb(record) && !hasWd(record)).length,
  };
  const intersections = {
    kinopoiskAndTmdb: records.filter((record) => hasKp(record) && hasTmdb(record)).length,
    kinopoiskAndImdb: records.filter((record) => hasKp(record) && hasImdb(record)).length,
    tmdbAndImdb: records.filter((record) => hasTmdb(record) && hasImdb(record)).length,
    kinopoiskTmdbImdb: records.filter((record) => hasKp(record) && hasTmdb(record) && hasImdb(record)).length,
    allFour: records.filter((record) => hasKp(record) && hasTmdb(record) && hasImdb(record) && hasWd(record)).length,
  };
  const report = {
    generatedAt: new Date().toISOString(), sourceCatalog: sourcePath, duplicateRemoval,
    catalogTotalAfterDuplicateRemoval: catalog.length, originalOnlyTotal: records.length,
    identifierGroups, intersections,
    distributions: {
      byDecade: countBy(records.map((record) => `${Math.floor(record.year / 10) * 10}-е`)),
      byCountry: countBy(records.flatMap((record) => record.country ?? ["Не указана"])),
      byKind: countBy(records.map((record) => record.kind)),
    },
    sourceAnalysis: {
      kinopoisk: {
        exactIds: identifierGroups.kinopoisk,
        cardsWithKnownLink: records.filter((record) => hasKp(record)).length,
        projectDirectAdapterAvailable: false,
        limitation: "Точные ID сохранены, но прямые страницы возвращали SSO; обход защиты не выполнялся",
      },
      tmdb: {
        movieIds: identifierGroups.tmdbMovie, tvIds: identifierGroups.tmdbTv,
        russianLocalizationInCurrentOriginalOnlyCache: records.filter((record) =>
          [...(cache[record.id]?.provenance ?? []), ...(cache[record.id]?.rejectedCandidates ?? [])]
            .some((entry) => String(entry.source).startsWith("TMDb") && cyrillic.test(entry.candidate ?? ""))).length,
        previousHttp429: records.filter((record) => record.technicalLimits.tmdb429).length,
      },
      imdb: { exactIds: identifierGroups.imdb, use: "Однозначное сопоставление при поиске в русскоязычных индексах" },
      wikidata: {
        qids: identifierGroups.wikidata,
        russianEvidenceRemaining: records.filter((record) =>
          [...(cache[record.id]?.provenance ?? []), ...(cache[record.id]?.rejectedCandidates ?? [])]
            .some((entry) => String(entry.source).startsWith("Wikidata") && cyrillic.test(entry.candidate ?? ""))).length,
        use: "QID и sitelinks для перехода к точным русскоязычным страницам",
      },
    },
    priorityGroups: {
      counts: byGroup,
      definitions: {
        A: "Высокая вероятность быстрого результата по Kinopoisk ID или повторяемому exact-ID endpoint после технического ограничения",
        B: "Вероятен результат через кросс-поиск по нескольким точным ID",
        C: "Нужен поиск по originalTitle, году, режиссёру и стране",
        D: "Редкое произведение или мало идентифицирующих/русскоязычных данных",
      },
      examples: Object.fromEntries(["A", "B", "C", "D"].map((group) =>
        [group, records.filter((record) => record.priorityGroup === group).slice(0, 20)])),
    },
    potential: {
      viaKinopoiskExactId: identifierGroups.kinopoisk,
      viaTmdbExactId: identifierGroups.tmdbAny,
      viaRussianReleaseCatalogs: records.filter((record) => record.year >= 1990 &&
        ["movie", "animated-feature", "documentary"].includes(record.kind)).length,
      viaRussianLanguageDatabasesUsingExactIds: records.filter((record) => hasKp(record) || hasTmdb(record) || hasImdb(record)).length,
      viaIdYearDirectorCombination: records.filter((record) => record.exactIdentifierCount > 0 && record.year && record.directors.length).length,
      note: "Это оценка поискового потенциала, а не число уже подтверждённых русских названий; группы источников пересекаются",
    },
    records,
  };
  const md = [
    "# Аналитика original-only каталога watch", "",
    `Сформировано: ${report.generatedAt}`, "",
    "## Удалённый дубль", "",
    `Оставлена: **${duplicateRemoval?.kept.id}** (${duplicateRemoval?.kept.slug}).`,
    `Удалена: **${duplicateRemoval?.removed.id}** (${duplicateRemoval?.removed.slug}).`,
    duplicateRemoval?.reason ?? "Удаление дубля в этом запуске не выполнялось.", "",
    "## Сводка", "",
    `- Каталог после удаления дубля: ${report.catalogTotalAfterDuplicateRemoval}`,
    `- Original-only: ${report.originalOnlyTotal}`,
    `- Kinopoisk ID: ${identifierGroups.kinopoisk}`,
    `- TMDb ID: ${identifierGroups.tmdbAny} (movie ${identifierGroups.tmdbMovie}, TV ${identifierGroups.tmdbTv})`,
    `- IMDb ID: ${identifierGroups.imdb}`,
    `- Wikidata QID: ${identifierGroups.wikidata}`, "",
    "## Пересечения идентификаторов", "",
    ...Object.entries(intersections).map(([key, value]) => `- ${key}: ${value}`), "",
    "## Приоритет следующего прохода", "",
    ...Object.entries(byGroup).map(([group, value]) => `- ${group}: ${value} — ${report.priorityGroups.definitions[group]}`), "",
    "## Потенциал источников", "",
    ...Object.entries(report.potential).map(([key, value]) => `- ${key}: ${value}`), "",
    "## Примеры проблемных групп", "",
    ...["A", "B", "C", "D"].flatMap((group) => [
      `### Группа ${group}`, "",
      ...report.priorityGroups.examples[group].map((record) =>
        `- ${record.id} — ${record.originalTitle} (${record.year}); ${record.previousFailureReason}; следующий шаг: ${record.recommendedNextSearch}`), "",
    ]),
    "Полный список из всех карточек, распределения по годам, странам и видам содержится в JSON-отчёте.", "",
  ].join("\n");
  await fs.writeFile(analyticsJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(analyticsMarkdownPath, md, "utf8");
  console.log(JSON.stringify({ catalogTotal: catalog.length, originalOnly: records.length,
    identifierGroups, intersections, byGroup, potential: report.potential,
    analyticsJsonPath, analyticsMarkdownPath }, null, 2));
  process.exit(0);
}
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
    ...indexedWikidataEvidence(identifiers), ...editorialEvidence(item),
    ...(incrementalEvidenceById.has(item.id) ? [incrementalEvidenceById.get(item.id)] : [])];
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
  const evidence = [...(cached.provenance ?? []), ...(cached.rejectedCandidates ?? []),
    ...(incrementalEvidenceById.has(item.id) ? [incrementalEvidenceById.get(item.id)] : [])]
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
