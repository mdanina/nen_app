import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const catalogPath = resolve(root, "data/generated/books.json");
const overridesPath = resolve(root, "data/source/official-cover-overrides.json");
const metadataOverridesPath = resolve(root, "data/source/official-metadata-overrides.json");
const webCandidatesPath = resolve(root, "data/source/web-modern-edition-candidates.json");
const webIsbnCandidatesPath = resolve(root, "data/source/web-modern-edition-isbn-candidates.json");
const reportPath = resolve(root, "data/reports/official-cover-enrichment.json");
const verifiedAt = new Date().toISOString().slice(0, 10);

const publishers = [
  {
    key: "azbooka",
    publisher: "Азбука-Аттикус",
    name: "Издательская группа «Азбука-Аттикус»",
    publisherPattern: /азбук|махаон|иностранк|колибри/iu,
    sitemapUrls: ["https://azbooka.ru/sitemap.xml"],
    productPattern: /^https:\/\/azbooka\.ru\/books\//u,
  },
  {
    key: "eksmo",
    publisher: "Эксмо",
    name: "Издательство «Эксмо»",
    publisherPattern: /эксмо|bombora/iu,
    sitemapUrls: [
      "https://eksmo.ru/sitemap/books1.xml",
      "https://eksmo.ru/sitemap/books2.xml",
      "https://eksmo.ru/sitemap/books3.xml",
    ],
    productPattern: /^https:\/\/eksmo\.ru\/book\//u,
  },
  {
    key: "rosman",
    publisher: "Росмэн",
    name: "Издательство «Росмэн»",
    publisherPattern: /росм[эе]н/iu,
    sitemapUrls: ["https://rosman.ru/sitemap-iblock-21.xml"],
    productPattern: /^https:\/\/rosman\.ru\/catalog\//u,
  },
  {
    key: "detlit",
    publisher: "Детская литература",
    name: "Издательство «Детская литература»",
    publisherPattern: /детск.*лит|det.*lit/iu,
    sitemapUrls: ["https://detlit.ru/sitemap.xml"],
    productPattern: /^https:\/\/detlit\.ru\/(?!$|series\/|sitemap\/)/u,
  },
  {
    key: "strekoza",
    publisher: "Стрекоза",
    name: "Издательство «Стрекоза»",
    publisherPattern: /стрекоз/iu,
    sitemapUrls: [
      "https://strecoza.ru/product-sitemap.xml",
      "https://strecoza.ru/product-sitemap2.xml",
      "https://strecoza.ru/product-sitemap3.xml",
      "https://strecoza.ru/product-sitemap4.xml",
    ],
    productPattern: /^https:\/\/strecoza\.ru\/product\//u,
  },
  {
    key: "samokat",
    name: "Издательство «Самокат»",
    publisher: "Самокат",
    publisherPattern: /самокат/iu,
    sitemapUrls: ["https://samokatbook.ru/sitemap-iblock-1.xml"],
    productPattern: /^https:\/\/samokatbook\.ru\/book\//u,
  },
  {
    key: "polyandria",
    name: "Издательство «Поляндрия»",
    publisher: "Поляндрия",
    publisherPattern: /поляндри/iu,
    sitemapUrls: ["https://www.polyandria.ru/sitemap-iblock-4.xml"],
    productPattern: /^https?:\/\/www\.polyandria\.ru\/catalog\/[^/]+\/[^/]+\/?$/u,
  },
  {
    key: "white-crow",
    name: "Издательство «Белая ворона»",
    publisher: "Белая ворона",
    publisherPattern: /белая ворона|albus corvus/iu,
    sitemapUrls: ["https://albuscorvus.ru/product-sitemap.xml"],
    productPattern: /^https:\/\/albuscorvus\.ru\/product\/[^/]+\/?$/u,
  },
  {
    key: "kompasgid",
    name: "Издательство «КомпасГид»",
    publisher: "КомпасГид",
    publisherPattern: /компасгид|компас гид/iu,
    sitemapUrls: ["https://kompasgid.ru/product-sitemap.xml"],
    productPattern: /^https:\/\/kompasgid\.ru\/product\/[^/]+\/?$/u,
  },
  {
    key: "clever",
    name: "Издательство «Clever»",
    publisher: "Clever",
    publisherPattern: /clever|клевер/iu,
    sitemapUrls: ["https://www.clever-media.ru/sitemap.xml"],
    productPattern: /^https:\/\/www\.clever-media\.ru\/product\/[^/]+\/?$/u,
  },
  {
    key: "archipelag",
    name: "Издательство «Архипелаг»",
    publisher: "Архипелаг",
    publisherPattern: /архипелаг/iu,
    sitemapUrls: ["https://archipelag-publishing.ru/sitemap.xml"],
    productPattern: /^https:\/\/archipelag-publishing\.ru\/catalog\/[^/]+\/\d+\/?$/u,
  },
  {
    key: "alpina",
    name: "Издательство «Альпина.Дети»",
    publisher: "Альпина.Дети",
    publisherPattern: /альпина(?:\.|\s*)дети|alpina/iu,
    sitemapUrls: ["https://alpinabook.ru/upload/sitemap.xml"],
    productPattern: /^https:\/\/alpinabook\.ru\/catalog\/book-[^/]+\/?$/u,
  },
];

const ast = {
  key: "ast",
  publisher: "АСТ",
  name: "Издательство «АСТ»",
  publisherPattern: /(?:^|\s)аст(?:$|\s)|астрель|малыш|вилли винки/iu,
};

const transliteration = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const ignoredTokens = new Set(["book", "books", "kniga", "skazki", "rasskazy", "stikhi", "povesti", "roman", "dlya", "detey"]);

function normalize(value = "") {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ru")
    .replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function slugify(value = "") {
  return [...normalize(value)].map((letter) => transliteration[letter] ?? letter).join("")
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function tokens(value = "") {
  return slugify(value).split("-").filter((token) => token.length >= 4 && !ignoredTokens.has(token));
}

function titleVariants(book) {
  return [...new Set([
    book.title,
    String(book.title ?? "").split(/\s*(?:[:(]|\.\s+)/u)[0],
    book.originalTitle,
    String(book.originalTitle ?? "").split(/\s*(?:[:(]|\.\s+)/u)[0],
  ].filter((value) => String(value).trim().length >= 3))];
}

function titleScore(title, pageTitle) {
  const left = normalize(title);
  const right = normalize(pageTitle);
  if (!left || !right) return 0;
  if (right.includes(left) || left.includes(right)) return 1;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length >= 3));
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / Math.max(1, leftTokens.size);
}

function validIsbn13(isbn) {
  if (!/^97[89]\d{10}$/u.test(isbn ?? "")) return false;
  const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

function authorSurnames(author = "") {
  return String(author).split(/\s*;\s*/u).map((name) => normalize(name).split(" ").filter((token) => token.length >= 4).at(-1)).filter(Boolean);
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "iu"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "iu"))?.[1]
    ?? "",
  ).replaceAll("&amp;", "&").trim();
}

function displayText(html = "") {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&laquo;/giu, "«")
    .replace(/&raquo;/giu, "»")
    .replace(/\s+/gu, " ")
    .trim();
}

function plainText(html = "") {
  return normalize(String(html).replace(/<script\b[\s\S]*?<\/script>/giu, " ").replace(/<style\b[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " "));
}

function jsonLdObjects(html = "") {
  const objects = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const value = JSON.parse(match[1].trim());
      const queue = Array.isArray(value) ? [...value] : [value];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        objects.push(item);
        if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
      }
    } catch {
      // Some publisher pages contain non-JSON analytics in ld+json blocks.
    }
  }
  return objects;
}

function parsedNumber(value) {
  const result = Number(String(value ?? "").match(/\d{1,4}/u)?.[0]);
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function bibliography(html = "") {
  const visible = displayText(html);
  const structured = jsonLdObjects(html).find((item) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return types.some((type) => /^(?:book|product)$/iu.test(String(type ?? "")));
  }) ?? {};
  const isbnCandidates = [
    structured.isbn,
    ...[...visible.matchAll(/97[89](?:[\s-]*\d){10}/gu)].map((match) => match[0]),
  ].map((value) => String(value ?? "").replace(/\D/gu, "")).filter(validIsbn13);
  const publicationYear = parsedNumber(
    structured.datePublished
    ?? visible.match(/(?:год\s+(?:издания|выпуска|публикации)|издано)\D{0,40}((?:19|20)\d{2})/iu)?.[1],
  );
  const pages = parsedNumber(
    structured.numberOfPages
    ?? visible.match(/(?:количество\s+страниц|объ[её]м|страниц)\D{0,30}(\d{1,4})/iu)?.[1],
  );
  const seriesName = String(
    structured.isPartOf?.name
    ?? visible.match(/серия\D{0,10}[«"]?([a-zа-яё0-9][a-zа-яё0-9 .,'«»"—-]{2,80}?)[»"]?(?=\s+(?:isbn|год|возраст|формат|перепл[её]т|количество|страниц|вес)\b)/iu)?.[1]
    ?? "",
  ).trim() || undefined;
  const languageValue = String(structured.inLanguage ?? "");
  const publisher = String(
    structured.publisher?.name
    ?? structured.brand?.name
    ?? visible.match(/издательств[оа]\D{0,12}[«"]?([a-zа-яё0-9][a-zа-яё0-9 .,&'«»"—-]{1,60}?)[»"]?(?=\s+(?:isbn|год|серия|страниц|формат|перепл[её]т)\b)/iu)?.[1]
    ?? "",
  ).trim() || undefined;
  return {
    isbn13: isbnCandidates[0],
    publicationYear,
    pages,
    seriesName,
    language: /^(?:ru|rus|рус)/iu.test(languageValue) ? "ru" : languageValue || "ru",
    publisher,
  };
}

function pageData(html, url) {
  const title = String(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? meta(html, "og:title"))
    .replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  const body = plainText(html);
  const imageValue = meta(html, "og:image");
  let image;
  try { image = imageValue ? new URL(imageValue, url).href : undefined; } catch { image = undefined; }
  if (image && /(?:logo|favicon|og-tag|og_image|default)/iu.test(image)) image = undefined;
  return { title, body, image, bibliography: bibliography(html) };
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "NEN official cover resolver/1.0", accept: "text/html,application/xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index], index);
    }
  }));
  return result;
}

function buildIndex(urls) {
  const tokenIndex = new Map();
  for (const url of urls) {
    const pathTokens = tokens(new URL(url).pathname);
    for (const token of pathTokens) tokenIndex.set(token, [...(tokenIndex.get(token) ?? []), url]);
  }
  return tokenIndex;
}

function sitemapCandidates(book, source) {
  const candidates = new Map();
  for (const variant of titleVariants(book)) {
    const bookTokens = tokens(variant);
    for (const token of bookTokens) {
      for (const url of source.tokenIndex.get(token) ?? []) {
        const urlTokens = new Set(tokens(new URL(url).pathname));
        const common = bookTokens.filter((item) => urlTokens.has(item)).length;
        const score = common / Math.max(1, bookTokens.length);
        candidates.set(url, Math.max(score, candidates.get(url) ?? 0));
      }
    }
  }
  return [...candidates.entries()].filter(([, score]) => score >= 0.67)
    .sort((left, right) => right[1] - left[1]).slice(0, 8)
    .map(([url, score]) => ({ url, score, source }));
}

const [catalog, existingOverrides, existingMetadataOverrides, webCandidates, webIsbnCandidates] = await Promise.all([
  readFile(catalogPath, "utf8").then(JSON.parse),
  readFile(overridesPath, "utf8").then(JSON.parse),
  readFile(metadataOverridesPath, "utf8").then(JSON.parse),
  readFile(webCandidatesPath, "utf8").then(JSON.parse).catch(() => ({ candidates: [] })),
  readFile(webIsbnCandidatesPath, "utf8").then(JSON.parse).catch(() => ({ candidates: [] })),
]);
const overridden = new Set(existingOverrides.map((item) => item.id));
const missing = catalog.filter((book) => !(book.cover?.url || book.coverUrl) && !overridden.has(book.id));

for (const source of publishers) {
  const maps = await mapLimit(source.sitemapUrls, 3, async (url) => {
    try { return await fetchText(url); } catch (error) { console.error(`${url}: ${error}`); return ""; }
  });
  source.urls = [...new Set(maps.flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => match[1].trim()))
    .map((url) => url.replace(/^http:\/\/www\.polyandria\.ru/iu, "https://www.polyandria.ru"))
    .filter((url) => source.productPattern.test(url)))];
  source.tokenIndex = buildIndex(source.urls);
  console.log(`${source.key}: ${source.urls.length} официальных карточек`);
}

const trials = [];
for (const book of missing) {
  for (const source of publishers) {
    trials.push(...sitemapCandidates(book, source).map((trial) => ({ ...trial, book })));
  }
}
const missingById = new Map(missing.map((book) => [book.id, book]));
for (const candidate of webCandidates.candidates ?? []) {
  const book = missingById.get(candidate.id);
  if (!book) continue;
  const source = publishers.find((publisher) => publisher.productPattern.test(candidate.url));
  if (!source) continue;
  trials.push({
    book,
    source,
    url: candidate.url,
    score: 1,
    discoveredBy: "full_web_work_title_author",
  });
}
for (const candidate of webIsbnCandidates.candidates ?? []) {
  const book = missingById.get(candidate.id);
  if (!book) continue;
  const officialSource = publishers.find((publisher) => publisher.productPattern.test(candidate.url));
  let hostname = "веб-каталог";
  try { hostname = new URL(candidate.url).hostname.replace(/^www\./u, ""); } catch {}
  const source = officialSource ?? {
    key: `web-${hostname}`,
    name: hostname,
    publisher: undefined,
    publisherPattern: /$a/u,
    productPattern: /$a/u,
    sourceType: "bibliographic-card",
  };
  trials.push({
    book,
    source,
    url: candidate.url,
    score: 1,
    discoveredBy: "full_web_work_title_author_isbn",
    discoveredIsbn: candidate.isbn,
  });
}

const booksWithSitemapCandidates = new Set(trials.map((trial) => trial.book.id));
const astBooks = missing.filter((book) => (
  ast.publisherPattern.test(book.publisher ?? "")
  || !booksWithSitemapCandidates.has(book.id)
));
const astSearchPages = await mapLimit(astBooks, 6, async (book) => {
  const surname = authorSurnames(book.author)[0] ?? "";
  const searchUrl = `https://ast.ru/search/?q=${encodeURIComponent(`${book.title} ${surname}`)}`;
  try {
    const html = await fetchText(searchUrl);
    const urls = [...new Set([...html.matchAll(/href=["'](\/book\/[^"'?#]+\/)["']/giu)]
      .map((match) => new URL(match[1], searchUrl).href))].slice(0, 5);
    return { book, urls };
  } catch (error) {
    return { book, urls: [], error: String(error) };
  }
});
for (const item of astSearchPages) {
  trials.push(...item.urls.map((url, index) => ({ book: item.book, source: ast, url, score: 1 - index * 0.05 })));
}

const uniqueUrls = [...new Set(trials.map((trial) => trial.url))];
console.log(`Кандидатных официальных страниц: ${uniqueUrls.length}`);
const pages = new Map((await mapLimit(uniqueUrls, 8, async (url) => {
  try { return [url, pageData(await fetchText(url), url)]; }
  catch (error) { return [url, { error: String(error) }]; }
})));

const matches = [];
const metadataMatches = [];
const rejected = [];
const isbnOwners = new Map(catalog.filter((book) => book.isbn13).map((book) => [book.isbn13, book.id]));
for (const book of missing) {
  const candidates = trials.filter((trial) => trial.book.id === book.id).map((trial) => {
    const page = pages.get(trial.url);
    if (!page?.image || page.error) return null;
    const compactBody = page.body.replace(/\D/gu, "");
    const isbnExact = Boolean(
      (book.isbn13 && compactBody.includes(book.isbn13))
      || (trial.discoveredIsbn && compactBody.includes(trial.discoveredIsbn)),
    );
    const score = Math.max(...titleVariants(book).map((variant) => titleScore(variant, page.title)));
    const surnames = authorSurnames(book.author);
    const authorMatch = surnames.some((surname) => page.body.includes(surname));
    if (!isbnExact && !(score >= 0.72 && authorMatch)) return null;
    const currentPublisherMatch = Boolean(book.publisher && trial.source.publisherPattern.test(book.publisher));
    return {
      ...trial,
      page,
      isbnExact,
      titleMatch: score,
      authorMatch,
      currentPublisherMatch,
      editionYear: page.bibliography.publicationYear ?? 0,
      confidence: isbnExact ? 1 : Math.min(0.99, 0.72 + score * 0.2 + (authorMatch ? 0.07 : 0)),
    };
  }).filter(Boolean).sort((left, right) => (
    Number(right.currentPublisherMatch) - Number(left.currentPublisherMatch)
    || right.editionYear - left.editionYear
    || Number(Boolean(right.page.bibliography.isbn13)) - Number(Boolean(left.page.bibliography.isbn13))
    || right.confidence - left.confidence
    || right.score - left.score
  ));
  if (!candidates.length) {
    rejected.push({ id: book.id, title: book.title, author: book.author, publisher: book.publisher, isbn13: book.isbn13, reason: "no_verified_official_match" });
    continue;
  }
  const match = candidates[0];
  const confirmedIsbn = match.isbnExact
    ? book.isbn13
    : [match.page.bibliography.isbn13].find((isbn) => isbn && (!isbnOwners.has(isbn) || isbnOwners.get(isbn) === book.id));
  matches.push({
    id: book.id,
    cover: {
      kind: "external",
      url: match.page.image,
      rightsStatus: "external-display-only",
      sourceName: match.source.name,
      sourcePageUrl: match.url,
      isbn13: book.isbn13,
      temporary: true,
      attribution: match.source.sourceType === "bibliographic-card"
        ? "Обложка опубликована в карточке современного издания."
        : "Обложка предоставлена издательством.",
      verifiedAt,
    },
    match: {
      strategy: match.isbnExact ? "official_page_exact_isbn" : "official_page_work_title_author",
      confidence: match.confidence,
      titleMatch: match.titleMatch,
      authorMatch: match.authorMatch,
      isbnExact: match.isbnExact,
    },
  });
  metadataMatches.push({
    id: book.id,
    source: match.source.name,
    sourceUrl: match.url,
    sourceRecordId: new URL(match.url).pathname,
    officialTitle: match.page.title,
    officialAuthors: String(book.author).split(/\s*;\s*/u),
    publisher: match.page.bibliography.publisher ?? match.source.publisher,
    isbn13: confirmedIsbn,
    publicationYear: match.page.bibliography.publicationYear,
    pages: match.page.bibliography.pages,
    seriesName: match.page.bibliography.seriesName,
    language: match.page.bibliography.language,
    replaceEdition: true,
    match: {
      strategy: match.isbnExact ? "exact_isbn" : "work_title_author",
      confidence: match.confidence,
      titleScore: match.titleMatch,
      authorMatch: match.authorMatch,
      isbnExact: match.isbnExact,
      currentPublisherMatch: match.currentPublisherMatch,
      selectedEditionYear: match.page.bibliography.publicationYear,
    },
    verifiedAt,
  });
}

const merged = new Map(existingOverrides.map((item) => [item.id, item]));
for (const match of matches) merged.set(match.id, match);
const mergedMetadata = new Map(existingMetadataOverrides.map((item) => [item.id, item]));
for (const match of metadataMatches) mergedMetadata.set(match.id, match);
const cumulativeMatches = [...merged.values()].filter((item) => item.match);
await mkdir(dirname(reportPath), { recursive: true });
await Promise.all([
  writeFile(overridesPath, `${JSON.stringify([...merged.values()], null, 2)}\n`, "utf8"),
  writeFile(metadataOverridesPath, `${JSON.stringify([...mergedMetadata.values()], null, 2)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    inputPlaceholders: missing.length,
    matchedThisRun: matches.length,
    matched: cumulativeMatches.length,
    strategyCounts: Object.fromEntries(["official_page_exact_isbn", "official_page_title_author", "official_page_work_title_author"].map((strategy) => [
      strategy,
      cumulativeMatches.filter((item) => item.match.strategy === strategy).length,
    ])),
    matches: cumulativeMatches,
    unmatched: rejected,
  }, null, 2)}\n`, "utf8"),
]);
console.log(`Добавлено официальных обложек: ${matches.length}`);
console.log(JSON.stringify(Object.fromEntries(["official_page_exact_isbn", "official_page_title_author", "official_page_work_title_author"].map((strategy) => [
  strategy,
  matches.filter((item) => item.match.strategy === strategy).length,
]))));
