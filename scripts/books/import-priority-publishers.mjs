import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const catalogPath = resolve(root, "data/generated/books.json");
const outputPath = resolve(root, "data/source/curated-priority-publisher-books.json");
const target = Number(process.argv.find((value) => value.startsWith("--target="))?.split("=")[1] ?? 510);
const checkedAt = new Date().toISOString().slice(0, 10);

const sources = {
  clever: {
    publisher: "Clever",
    sitemap: "https://www.clever-media.ru/sitemap.xml",
    catalog: "https://www.clever-media.ru/collection/khudozhestvennaya-literatura",
  },
  archipelag: {
    publisher: "Архипелаг",
    sitemap: "https://archipelag-publishing.ru/sitemap.xml",
    catalog: "https://archipelag-publishing.ru/catalog/",
  },
};

const entities = new Map([
  ["amp", "&"], ["quot", "\""], ["apos", "'"], ["lt", "<"], ["gt", ">"],
  ["nbsp", " "], ["laquo", "«"], ["raquo", "»"], ["ndash", "–"], ["mdash", "—"],
  ["hellip", "…"], ["rsquo", "’"], ["ldquo", "“"], ["rdquo", "”"], ["shy", ""],
]);

function decode(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities.get(name) ?? match);
}

function text(value = "") {
  return decode(String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalize(value = "") {
  return text(value).toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function canonicalTitle(value = "") {
  return normalize(value)
    .replace(/^(?:книжки[- ]картинки|книжки[- ]картонки)\s+/u, "")
    .replace(/\b(?:подарочное|коллекционное|эксклюзивное) издание\b/gu, "")
    .replace(/\b(?:мягкая|тв[её]рдая) обложка\b/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function authorKey(value = "") {
  return normalize(value).split(/\s+/u).sort((a, b) => a.localeCompare(b, "ru")).join(" ");
}

function titleAuthorKey(title, authors) {
  return `${canonicalTitle(title).replace(/\b(?:книга|том|часть)\s+\d+\b/gu, "").trim()}|${authors.map(authorKey).sort().join(";")}`;
}

function slugify(value) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
    щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return normalize(value).split("").map((letter) => map[letter] ?? letter).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "NEN curated catalog expansion/1.0", accept: "text/html,application/xml,application/json" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function sitemapLinks(xml, predicate) {
  return [...new Set([...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)].map((match) => decode(match[1]).trim()).filter(predicate))];
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decode(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "iu"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "iu"))?.[1]
    ?? "",
  );
}

function parseIsbn(value = "") {
  const isbn = String(value).replace(/\D/g, "");
  return /^97[89]\d{10}$/.test(isbn) ? isbn : undefined;
}

function parseNumber(value = "") {
  const parsed = Number(String(value).match(/\d{1,4}/u)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shortAnnotation(value = "") {
  const stop = /^(?:зачем читать|об авторе|Читайте также|Соберите|Скачать|Не пропустите|Почему стоит|Бестселлер|Возраст \d|Для кого)/iu;
  const paragraphs = String(value).split(/\n+/u).map((item) => item.trim()).filter((item) => item && !stop.test(item));
  const selected = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (selected.length && length + paragraph.length > 700) break;
    selected.push(paragraph);
    length += paragraph.length;
    if (length >= 320) break;
  }
  const result = selected.join("\n\n");
  if (result.length <= 700) return result;
  const sentences = result.match(/[^.!?]+[.!?]+/gu) ?? [];
  const compact = [];
  for (const sentence of sentences) {
    if (compact.length && compact.join(" ").length + sentence.length > 700) break;
    compact.push(sentence.trim());
  }
  return compact.join(" ") || result.slice(0, 700).replace(/\s+\S*$/u, "").trim();
}

function splitAuthors(value = "") {
  return String(value).split(/\s*(?:;|\/|,\s+(?=[А-ЯЁ][а-яё]+\s+[А-ЯЁ])|\s+и\s+)\s*/u).map(text).filter(Boolean);
}

function ageRange(minValue, maxValue, fallback = [6, 11]) {
  const min = Math.max(2, Math.min(17, parseNumber(minValue) ?? fallback[0]));
  const max = Math.max(min, Math.min(17, parseNumber(maxValue) ?? fallback[1]));
  return [min, max];
}

const prohibited = /(энциклопед|атлас|справочник|словарь|учебник|учебное пособие|рабочая тетрад|пропис|раскраск|головоломк|кроссворд|эксперимент|поделк|рецепт|100 фактов|вопросы и ответы|путеводитель|биографи|мемуар|документальн|нон-фикшн|non.?fiction|научно-популярн|комплект|набор из \d+ книг|тренаж[её]р|развивающ(?:ая|ее) пособие)/iu;
const fictionSignal = /(сказк|повест|роман|рассказ|стих|поэз|приключ|детектив|фэнтез|фантаст|комикс|графическ|геро[йя]|персонаж|сюжет|истори[яю] о|миф|легенд)/iu;

function genres(value) {
  const result = [];
  if (/сказк|миф|легенд/iu.test(value)) result.push("сказка");
  if (/фэнтез|волшеб|маг(?:ия|ическ)/iu.test(value)) result.push("фэнтези");
  if (/фантаст|космич/iu.test(value)) result.push("научная фантастика");
  if (/детектив|расследован|тайн/iu.test(value)) result.push("детектив");
  if (/приключ/iu.test(value)) result.push("приключения");
  if (/юмор|смешн|вес[её]л/iu.test(value)) result.push("юмор");
  if (/стих|поэз/iu.test(value)) result.push("поэзия");
  if (/историческ/iu.test(value)) result.push("историческая проза");
  if (/семейн/iu.test(value)) result.push("семейная история");
  if (!result.length) result.push("реалистическая проза");
  return [...new Set(result)].slice(0, 3);
}

const themeRules = [
  ["дружба", /друж|друз|приятел/iu], ["семья", /семь|мам[а-я]|пап[а-я]|родител|бабуш|дедуш|брат|сестр/iu],
  ["школа", /школ|учени|класс|урок/iu], ["детский сад", /детск(?:ий|ого) сад|дошколь/iu],
  ["животные", /животн|кот|кошк|собак|п[её]с|лис[а-я]|медвед|звер|птиц|лошад|крол|заяц/iu],
  ["природа", /природ|лес|море|океан|река|гор[аы]|дерев|растен/iu],
  ["космос", /космос|космич|планет|зв[её]зд|астронавт/iu], ["экология", /экологи|окружающ|климат/iu],
  ["история", /историческ|прошл|войн|древн/iu], ["мифология", /миф|олимп|легенд/iu],
  ["искусство", /искусств|худож|рисов|картин/iu], ["музыка", /музык|песн|оркестр|скрип|пиан/iu],
  ["театр", /театр|сцен[а-я]|спектак/iu], ["спорт", /спорт|футбол|хокке|соревнован|олимпиад/iu],
  ["путешествия", /путеше|дорог|экспедиц|странств/iu], ["морские приключения", /морск|океан|корабл|пират|остров/iu],
  ["взросление", /взросл|подрост|перемен|самостоятель/iu], ["самооценка", /уверенн|самооцен|принима[а-я]+ себя|стесня/iu],
  ["отношения", /отношен|влюб|любов|ссор|примир/iu], ["юмор", /юмор|смешн|вес[её]л/iu],
  ["волшебство", /волшеб|маг|чарод|колдун/iu], ["приключения", /приключ|путеше|опасност|спас[а-я]+/iu],
];

function themes(value, mappedGenres) {
  const result = themeRules.filter(([, rule]) => rule.test(value)).map(([theme]) => theme);
  if (!result.length) result.push(mappedGenres.includes("сказка") || mappedGenres.includes("фэнтези") ? "волшебство" : "отношения");
  return [...new Set(result)].slice(0, 5);
}

function makeBook({ publisher, sourceUrl, title, authors, description, coverUrl, isbn13, ageMin, ageMax, pages, seriesName, sourceGenre }) {
  const evidence = `${title} ${sourceGenre} ${description}`;
  if (!title || !authors.length || description.length < 60 || !coverUrl || !isbn13 || prohibited.test(`${title} ${sourceGenre}`)) return null;
  if (!fictionSignal.test(evidence) && !/художественная литература/iu.test(sourceGenre)) return null;
  const mappedGenres = genres(evidence);
  const mappedThemes = themes(evidence, mappedGenres);
  const prefix = publisher === "Clever" ? "clever" : "archipelag";
  const slug = `${prefix}-${slugify(title)}-${slugify(authors[0])}`.slice(0, 118).replace(/-+$/u, "");
  return {
    id: `curated-${slug}`,
    slug,
    title,
    authors,
    publisher,
    pages,
    seriesName,
    isbn13,
    shortDescription: shortAnnotation(description),
    fullDescription: description,
    whyRecommended: "",
    ageMin,
    ageMax,
    readingMode: ageMin <= 6 ? "both" : ageMin >= 11 ? "independent" : "both",
    genres: mappedGenres,
    themes: mappedThemes,
    moods: [],
    languageDifficulty: ageMin <= 6 ? "easy" : ageMin <= 10 ? "medium" : "advanced",
    lengthCategory: !pages || pages <= 32 ? "very-short" : pages <= 80 ? "short" : pages <= 220 ? "medium" : "long",
    sensitiveTopics: [],
    sensitiveTopicsReviewed: false,
    cover: {
      kind: "external",
      url: coverUrl,
      rightsStatus: "external-display-only",
      sourceName: `Издательство «${publisher}»`,
      sourcePageUrl: sourceUrl,
      isbn13,
      temporary: true,
      attribution: "Обложка предоставлена издательством.",
      verifiedAt: checkedAt,
    },
    annotationProvenance: {
      source: `Издательство «${publisher}»`,
      sourceUrl,
      method: "official_publisher_description",
      verifiedAt: checkedAt,
      copiedVerbatim: true,
    },
    bibliographicSources: [sourceUrl],
    sourceMetadata: { publisherGenre: sourceGenre, sourceUrl },
    status: "published",
  };
}

function cleverBook(payload, sourceUrl) {
  const product = payload?.product;
  if (!product) return null;
  const propertyNames = new Map((product.properties ?? []).map((item) => [item.id, item.permalink]));
  const values = new Map();
  for (const characteristic of product.characteristics ?? []) {
    const key = propertyNames.get(characteristic.property_id);
    if (!key) continue;
    values.set(key, [...(values.get(key) ?? []), characteristic.title]);
  }
  const value = (key) => values.get(key)?.join(", ") ?? "";
  const sourceGenre = [
    value("imya-tekuschego-razdela"),
    value("imya-tekushchego-razdela"),
    value("temy"),
    value("tematika"),
    value("kollektsii"),
  ]
    .filter(Boolean)
    .join(". ");
  if (!/художественная литература/iu.test(sourceGenre)) return null;
  const description = [text(product.description), text(product.short_description)].sort((left, right) => right.length - left.length)[0] ?? "";
  const authors = splitAuthors(value("avtor") || value("avtor1"));
  const [ageMin, ageMax] = ageRange(value("vozrast-ot") || value("vozrastot"), value("vozrast-do") || value("vozrastpo"), [3, 9]);
  return makeBook({
    publisher: "Clever",
    sourceUrl,
    title: text(product.title),
    authors,
    description,
    coverUrl: product.first_image?.original_url,
    isbn13: parseIsbn(product.variants?.[0]?.sku),
    ageMin,
    ageMax,
    pages: parseNumber(value("kolichestvo-stranits") || value("stranits")),
    seriesName: value("seriya") || undefined,
    sourceGenre,
  });
}

function archipelagBook(html, sourceUrl) {
  const title = text(html.match(/<h1\b[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "");
  const authors = [...html.matchAll(/<a[^>]+class=["'][^"']*book-author__about-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/giu)]
    .map((match) => text(match[1])).filter(Boolean).slice(0, 2);
  const about = html.match(/<h3[^>]*>\s*О книге\s*<\/h3>([\s\S]*?)(?:<h3[^>]*>|<div[^>]+class=["'][^"']*book-author)/iu)?.[1] ?? "";
  let description = text(about);
  if (description.length < 80) {
    description = meta(html, "description") || meta(html, "og:description");
  }
  description = description
    .replace(/^Купить\s+/iu, "")
    .replace(/\.\s*Год издания:[\s\S]*$/iu, ".")
    .trim();
  const body = text(html);
  const age = body.match(/Возраст\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:года?|лет)/iu);
  const category = new URL(sourceUrl).pathname.split("/").filter(Boolean)[1] ?? "";
  return makeBook({
    publisher: "Архипелаг",
    sourceUrl,
    title,
    authors,
    description,
    coverUrl: new URL(meta(html, "og:image"), sourceUrl).href,
    isbn13: parseIsbn(body.match(/ISBN:\s*([^\n]+)/iu)?.[1]),
    ageMin: Number(age?.[1] ?? 6),
    ageMax: Number(age?.[2] ?? 12),
    pages: parseNumber(body.match(/Количество страниц:\s*([^\n]+)/iu)?.[1]),
    sourceGenre: category === "tales" ? "сказки" : category === "poetry" ? "поэзия" : "рассказы и повести",
  });
}

async function collectClever(links, goal) {
  const books = [];
  const rejected = [];
  for (let offset = 0; offset < links.length && books.length < goal; offset += 12) {
    const batch = links.slice(offset, offset + 12);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        return { url, payload: JSON.parse(await fetchText(`${url}.json`)) };
      } catch (error) {
        return { url, error: String(error) };
      }
    }));
    for (const result of results) {
      const book = result.payload ? cleverBook(result.payload, result.url) : null;
      if (book) books.push(book);
      else rejected.push({ sourceUrl: result.url, reason: result.error ?? "not_complete_fiction_card" });
    }
    if (offset % 120 === 0) console.log(`Clever: ${books.length}/${goal}, просмотрено ${Math.min(offset + batch.length, links.length)}/${links.length}`);
  }
  return { books, rejected };
}

async function collectArchipelag(links) {
  const books = [];
  const rejected = [];
  for (let offset = 0; offset < links.length; offset += 10) {
    const batch = links.slice(offset, offset + 10);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        return { url, html: await fetchText(url) };
      } catch (error) {
        return { url, error: String(error) };
      }
    }));
    for (const result of results) {
      const book = result.html ? archipelagBook(result.html, result.url) : null;
      if (book) books.push(book);
      else rejected.push({ sourceUrl: result.url, reason: result.error ?? "not_complete_fiction_card" });
    }
  }
  return { books, rejected };
}

const current = JSON.parse(await readFile(catalogPath, "utf8"))
  .filter((book) => !/^curated-(?:clever|archipelag)-/u.test(String(book.id)));
const existingKeys = new Set(current.map((book) => titleAuthorKey(book.title, String(book.author).split(/\s*;\s*/u))));
const existingIsbn = new Set(current.map((book) => book.isbn13).filter(Boolean));

const [cleverXml, archipelagXml] = await Promise.all([
  fetchText(sources.clever.sitemap),
  fetchText(sources.archipelag.sitemap),
]);
const cleverLinks = sitemapLinks(cleverXml, (url) => /\/product\/[^/]+$/u.test(url));
const archipelagLinks = sitemapLinks(archipelagXml, (url) => /\/catalog\/(?:tales|poetry|stories)\/\d+\/$/u.test(url));

const [clever, archipelag] = await Promise.all([
  collectClever(cleverLinks, Math.max(target + 80, 290)),
  collectArchipelag(archipelagLinks),
]);

const selected = [];
const duplicates = [];
for (const book of [...archipelag.books, ...clever.books]) {
  if (selected.length >= target) break;
  const key = titleAuthorKey(book.title, book.authors);
  if (existingKeys.has(key) || existingIsbn.has(book.isbn13)) {
    duplicates.push({ id: book.id, title: book.title, authors: book.authors, reason: "duplicate_existing_catalog" });
    continue;
  }
  existingKeys.add(key);
  existingIsbn.add(book.isbn13);
  selected.push(book);
}

if (selected.length < 200) throw new Error(`Получено только ${selected.length} уникальных полных карточек; требуется минимум 200.`);

const publisherCounts = Object.fromEntries([...new Set(selected.map((book) => book.publisher))]
  .map((publisher) => [publisher, selected.filter((book) => book.publisher === publisher).length]));
await writeFile(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourcePolicy: "Официальные каталоги издательств; только полные карточки детской художественной литературы.",
  officialCatalogs: Object.values(sources).map(({ publisher, catalog }) => ({ publisher, url: catalog })),
  books: selected,
  enrichments: [],
  report: {
    requested: target,
    accepted: selected.length,
    publisherCounts,
    duplicateRejections: duplicates,
    sourceRejections: [...archipelag.rejected, ...clever.rejected],
  },
}, null, 2)}\n`, "utf8");
console.log(`Сохранено ${selected.length} книг: ${JSON.stringify(publisherCounts)}`);
