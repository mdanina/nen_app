import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const outputPath = resolve(root, "data/source/curated-official-fiction-books.json");
const catalogPath = resolve(root, "data/generated/books.json");
const target = Number(process.argv.find((value) => value.startsWith("--target="))?.split("=")[1] ?? 451);
const checkedAt = new Date().toISOString().slice(0, 10);

const catalogs = [
  {
    key: "mif",
    publisher: "МИФ.Детство",
    pages: ["https://www.mann-ivanov-ferber.ru/catalog/tag/detskoe-chtenie/"],
    productPattern: /https:\/\/www\.mann-ivanov-ferber\.ru\/catalog\/product\/[a-z0-9-]+\//giu,
  },
  {
    key: "eksmo",
    publisher: "Эксмодетство",
    pages: Array.from({ length: 12 }, (_, index) => index
      ? `https://eksmo.ru/deti-i-roditeli/khudozhestvennaya-literatura-dlya-detey/page${index + 1}/`
      : "https://eksmo.ru/deti-i-roditeli/khudozhestvennaya-literatura-dlya-detey/"),
    productPattern: /https:\/\/eksmo\.ru\/book\/[a-z0-9_%.-]+\//giu,
  },
];

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

function cleanText(value = "") {
  return decode(String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalize(value = "") {
  return cleanText(value).toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function canonicalTitle(value = "") {
  return normalize(value
    .replace(/\s*\((?:ил\.?|илл\.?|рис\.?|худ\.?)[^)]+\)\s*/giu, " ")
    .replace(/\s*\[(?:ил\.?|илл\.?|рис\.?|худ\.?)[^\]]+\]\s*/giu, " ")
    .replace(/\s+(?:с|в)\s+иллюстрациями\s+.+$/giu, ""));
}

function authorKey(value = "") {
  return normalize(value).split(/\s+/).filter(Boolean).sort((a, b) => a.localeCompare(b, "ru")).join(" ");
}

function workKey(title, authors) {
  return `${canonicalTitle(title)}|${authors.map(authorKey).sort().join(";")}`;
}

function slugify(value) {
  const map = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return normalize(value).split("").map((letter) => map[letter] ?? letter).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchText(url) {
  let lastStatus;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(35_000),
      headers: { "user-agent": "NEN official children fiction catalog importer/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (![429, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200 * (attempt + 1)));
  }
  throw new Error(`${url}: HTTP ${lastStatus}`);
}

function jsonLd(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)]
    .flatMap((match) => { try { const value = JSON.parse(match[1]); return Array.isArray(value) ? value : [value]; } catch { return []; } });
}

function productFrom(html) {
  return jsonLd(html).find((item) => {
    const type = item?.["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  });
}

function parseAuthors(value = "") {
  return cleanText(value).replace(/^автор(?:ы|а)?\s+/iu, "")
    .split(/\s*(?:;|,|\s+и\s+)\s*/u).map(cleanText).filter((author) => author.split(/\s+/).length >= 2);
}

function parseAge(value = "") {
  const range = value.match(/(?:для\s+(?:детей|читателей)\s+)?(\d{1,2})\s*[—–-]\s*(\d{1,2})\s*(?:лет|года)?/iu);
  if (range && Number(range[1]) <= 17 && Number(range[2]) <= 17 && Number(range[1]) <= Number(range[2])) {
    return [Math.max(2, Number(range[1])), Math.min(17, Number(range[2]))];
  }
  const plus = value.match(/\b(3|4|5|6|7|8|9|10|11|12|13|14|15|16)\s*\+/u);
  if (plus) return [Number(plus[1]), Math.min(17, Number(plus[1]) + 5)];
  if (/подрост/iu.test(value)) return [12, 17];
  if (/малыш|дошколь/iu.test(value)) return [3, 6];
  return [7, 12];
}

function parseNumberNear(html, label) {
  const match = html.match(new RegExp(`${label}[^0-9]{0,80}(\\d{1,4})`, "iu"));
  return match ? Number(match[1]) : undefined;
}

const prohibited = /(энциклопед|атлас|справочник|словарь|учебник|пособие|рабочая тетрад|раскраск|головолом|кроссворд|эксперимент|поделк|рецепт|100 фактов|вопросы и ответы|путеводитель|биографи|мемуар|нон-фикшн|non.?fiction|научно-популярн|комплект книг|набор книг|развивающ)/iu;
const fictionSignal = /(сказк|повест|роман|рассказ|стих|поэз|приключ|детектив|фэнтез|фантаст|комикс|графическ|геро[йя]|персонаж|сюжет|истори[яю] о|миф|легенд|пьес)/iu;

function genresFor(value) {
  const genres = [];
  if (/сказк|миф|легенд|волшеб/iu.test(value)) genres.push("сказка");
  if (/фэнтез|волшеб/iu.test(value)) genres.push("фэнтези");
  if (/фантаст|космич/iu.test(value)) genres.push("научная фантастика");
  if (/детектив|расследован|тайн/iu.test(value)) genres.push("детектив");
  if (/приключ/iu.test(value)) genres.push("приключения");
  if (/юмор|смешн|вес[её]л/iu.test(value)) genres.push("юмор");
  if (/стих|поэз/iu.test(value)) genres.push("поэзия");
  if (!genres.length) genres.push("реалистическая проза");
  return [...new Set(genres)].slice(0, 3);
}

const topicRules = [
  ["дружба", /друж|друз|приятел/iu], ["семья", /семь|мам|пап|родител|бабуш|дедуш|брат|сестр/iu],
  ["школа", /школ|учени|класс|урок/iu], ["животные", /животн|кот|кошк|собак|п[её]с|лис|медвед|звер|птиц|лошад|крол|заяц/iu],
  ["природа", /природ|лес|море|океан|рек|гор|дерев|растен/iu], ["космос", /космос|космич|планет|зв[её]зд|астронавт/iu],
  ["история", /историческ|прошл|войн|древн/iu], ["мифология", /миф|олимп|легенд/iu],
  ["путешествия", /путеше|дорог|экспедиц|странств/iu], ["взросление", /взросл|подрост|перемен|самостоятель/iu],
  ["отношения", /отношен|влюб|любов|ссор|примир/iu], ["юмор", /юмор|смешн|вес[её]л/iu],
  ["волшебство", /волшеб|маг|чарод|колдун/iu], ["приключения", /приключ|путеше|опасност|спас/iu],
];

function themesFor(value, genres) {
  const themes = topicRules.filter(([, rule]) => rule.test(value)).map(([theme]) => theme);
  if (!themes.length) themes.push(genres.includes("сказка") || genres.includes("фэнтези") ? "волшебство" : "отношения");
  return [...new Set(themes)].slice(0, 5);
}

function recommendation(genres, themes, ageMin, ageMax) {
  return `Подойдёт читателям ${ageMin}–${ageMax} лет, которым нравятся ${genres[0]} и книги на темы «${themes.slice(0, 2).join("» и «")}».`;
}

function makeBook({ sourceKey, publisher, sourceUrl, title, authors, annotation, coverUrl, isbn13, pages, year, seriesName, sourceGenre }) {
  title = cleanText(title);
  annotation = cleanText(annotation);
  coverUrl = coverUrl ? new URL(coverUrl, sourceUrl).href : "";
  isbn13 = String(isbn13 ?? "").replace(/\D/g, "");
  const evidence = `${title} ${sourceGenre} ${annotation}`;
  if (!title || !authors.length || annotation.length < 100 || !coverUrl || !/^97[89]\d{10}$/.test(isbn13)) return null;
  if (prohibited.test(`${title} ${sourceGenre}`) || !fictionSignal.test(evidence)) return null;
  const genres = genresFor(evidence);
  const themes = themesFor(evidence, genres);
  const [ageMin, ageMax] = parseAge(evidence);
  const sourceSlug = slugify(new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1));
  const slug = `${sourceKey}-${slugify(title)}-${sourceSlug}`.slice(0, 120).replace(/-+$/g, "");
  return {
    id: `curated-${slug}`, slug, title, authors, publisher, publicationYear: year, pages, seriesName, isbn13,
    shortDescription: annotation, fullDescription: annotation,
    whyRecommended: recommendation(genres, themes, ageMin, ageMax), ageMin, ageMax,
    readingMode: ageMin >= 10 ? "independent" : "both", genres, themes, moods: [],
    languageDifficulty: ageMin <= 6 ? "easy" : ageMin <= 10 ? "medium" : "advanced",
    lengthCategory: !pages || pages <= 32 ? "very-short" : pages <= 80 ? "short" : pages <= 220 ? "medium" : "long",
    sensitiveTopics: [], sensitiveTopicsReviewed: false,
    cover: { kind: "external", url: coverUrl, rightsStatus: "external-display-only", sourceName: `Издательство «${publisher}»`, sourcePageUrl: sourceUrl, isbn13, temporary: true, attribution: "Обложка предоставлена издательством.", verifiedAt: checkedAt },
    annotationProvenance: { source: `Издательство «${publisher}»`, sourceUrl, method: "official_publisher_description", verifiedAt: checkedAt, copiedVerbatim: true },
    bibliographicSources: [sourceUrl], sourceMetadata: { publisherGenre: sourceGenre, sourceUrl }, status: "published",
  };
}

function mifBook(html, sourceUrl) {
  const product = productFrom(html);
  const authorValue = html.match(/"authors":\[\{"id":\d+,"name":"((?:\\.|[^"\\])+)"/u)?.[1];
  let authors = [];
  if (authorValue) { try { authors = parseAuthors(JSON.parse(`"${authorValue}"`)); } catch {} }
  const descriptions = [...html.matchAll(/"description":"((?:\\.|[^"\\])*)"/gu)].flatMap((match) => {
    try { return [cleanText(JSON.parse(`"${match[1]}"`))]; } catch { return []; }
  }).filter((value) => value.length >= 100 && value.length <= 3500).sort((a, b) => b.length - a.length);
  const isbn13 = html.match(/ISBN\s*(97[89][\d\s-]{10,20})/iu)?.[1];
  const details = `${product?.offers?.description ?? ""} ${descriptions[0] ?? ""}`;
  return makeBook({ sourceKey: "mif", publisher: "МИФ.Детство", sourceUrl, title: product?.name, authors, annotation: descriptions[0], coverUrl: product?.offers?.image ?? product?.image, isbn13, pages: parseNumberNear(html, '(?:pages|Объем|Страниц)'), year: parseNumberNear(html, '(?:publicationYear|Год издания)'), sourceGenre: `Детская художественная литература ${details}` });
}

function eksmoBook(html, sourceUrl) {
  const items = jsonLd(html);
  const product = items.find((item) => Array.isArray(item?.["@type"]) && item["@type"].includes("Product"));
  const image = Array.isArray(product?.image) ? product.image.find((item) => /cover1/i.test(item?.url ?? item?.contentUrl ?? "")) ?? product.image[0] : product?.image;
  const coverUrl = typeof image === "string" ? image : image?.url ?? image?.contentUrl;
  const caption = typeof image === "object" ? image?.caption : "";
  const authors = parseAuthors(caption.match(/автор(?:ы|а)?\s+(.+)$/iu)?.[1] ?? "");
  const breadcrumb = items.find((item) => item?.["@type"] === "BreadcrumbList");
  const sourceGenre = (product?.genre ?? []).join(" ") || (breadcrumb?.itemListElement ?? []).map((item) => item.name).join(" ");
  return makeBook({ sourceKey: "eksmo", publisher: product?.brand?.name === "Эксмодетство" ? "Эксмодетство" : "Эксмо", sourceUrl, title: product?.name, authors, annotation: product?.description, coverUrl, isbn13: product?.isbn, pages: parseNumberNear(html, '(?:Страниц|pages)'), year: parseNumberNear(html, '(?:Год издания|publicationYear|datePublished)'), seriesName: cleanText(html.match(/Серия:\s*<[^>]+>\s*([^<]+)/iu)?.[1] ?? "") || undefined, sourceGenre });
}

async function mapConcurrent(values, concurrency, mapper) {
  const result = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      try { result[index] = await mapper(values[index], index); }
      catch (error) { console.warn(`Пропущено ${values[index].url}: ${error.message}`); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result.filter(Boolean);
}

const currentCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
const existingWorks = new Set(currentCatalog.map((book) => workKey(book.title, String(book.author ?? "").split(/\s*;\s*/u))));
const existingIsbns = new Set(currentCatalog.map((book) => String(book.isbn13 ?? "").replace(/\D/g, "")).filter(Boolean));
const discovered = [];
for (const catalog of catalogs) {
  for (const page of catalog.pages) {
    try {
      const html = await fetchText(page);
      for (const url of html.match(catalog.productPattern) ?? []) discovered.push({ catalog, url });
    } catch (error) {
      console.warn(`Каталог недоступен ${page}: ${error.message}`);
    }
  }
}
const uniqueProducts = [...new Map(discovered.map((item) => [item.url, item])).values()];
console.log(`Найдено официальных карточек для проверки: ${uniqueProducts.length}`);
const parsed = await mapConcurrent(uniqueProducts, 3, async ({ catalog, url }) => {
  const html = await fetchText(url);
  return catalog.key === "mif" ? mifBook(html, url) : eksmoBook(html, url);
});

const selected = [];
const selectedWorks = new Set();
const selectedIsbns = new Set();
for (const book of parsed) {
  const key = workKey(book.title, book.authors);
  if (existingWorks.has(key) || selectedWorks.has(key) || existingIsbns.has(book.isbn13) || selectedIsbns.has(book.isbn13)) continue;
  selected.push(book); selectedWorks.add(key); selectedIsbns.add(book.isbn13);
  if (selected.length === target) break;
}
if (selected.length < target) throw new Error(`Недостаточно уникальных подтверждённых карточек: ${selected.length} из ${target}`);

const publisherCounts = Object.fromEntries([...new Set(selected.map((book) => book.publisher))].map((publisher) => [publisher, selected.filter((book) => book.publisher === publisher).length]));
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), selectionPolicy: "Official child-fiction catalog entries with an official annotation, author, ISBN and publisher-hosted cover; deduplicated by canonical work and author.", officialCatalogs: catalogs.map((catalog) => ({ publisher: catalog.publisher, url: catalog.pages[0] })), books: selected, enrichments: [], report: { target, imported: selected.length, publisherCounts, checkedProducts: uniqueProducts.length } }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ target, imported: selected.length, publisherCounts, checkedProducts: uniqueProducts.length, parsed: parsed.length }, null, 2));
