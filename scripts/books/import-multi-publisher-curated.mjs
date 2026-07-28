import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const outputPath = resolve(root, "data/source/curated-multi-publisher-books.json");
const currentCatalogPath = resolve(root, "data/generated/books.json");
const checkedAt = new Date().toISOString().slice(0, 10);
const perPublisherTarget = Number(process.argv.find((value) => value.startsWith("--per-publisher="))?.split("=")[1] ?? 70);

const publisherSources = {
  whiteCrow: {
    name: "Белая ворона",
    sitemap: "https://albuscorvus.ru/product-sitemap.xml",
    officialUrl: "https://albuscorvus.ru/catalog/",
  },
  kompas: {
    name: "КомпасГид",
    sitemap: "https://kompasgid.ru/product-sitemap.xml",
    officialUrl: "https://kompasgid.ru/",
  },
  alpina: {
    name: "Альпина.Дети",
    category: "https://alpinabook.ru/catalog/books-khudozhestvennaya-literatura-dlya-detey/",
    officialUrl: "https://alpinabook.ru/catalog/books-khudozhestvennaya-literatura-dlya-detey/",
  },
};

const entities = new Map([
  ["amp", "&"], ["quot", "\""], ["apos", "'"], ["lt", "<"], ["gt", ">"],
  ["nbsp", " "], ["laquo", "«"], ["raquo", "»"], ["ndash", "–"], ["mdash", "—"],
  ["hellip", "…"], ["rsquo", "’"], ["ldquo", "“"], ["rdquo", "”"], ["shy", ""],
]);

function decode(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities.get(name) ?? match);
}

function cleanText(value = "") {
  return decode(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value = "") {
  return cleanText(value).toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function authorKey(value = "") {
  return normalize(value).split(/\s+/).sort((a, b) => a.localeCompare(b, "ru")).join(" ");
}

function titleAuthorKey(title, authors) {
  return `${normalize(title).replace(/\b(?:книга|том|часть)\s+\d+\b/gu, "").trim()}|${authors.map(authorKey).sort().join(";")}`;
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
    headers: {
      "user-agent": "NEN curated children books/1.0 (bounded official publisher catalog import)",
      accept: "text/html,application/xhtml+xml,application/xml,text/xml",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decode(
    html.match(new RegExp(`<meta[^>]+property=['"]${escaped}['"][^>]+content=['"]([^'"]+)['"]`, "iu"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=['"]([^'"]+)['"][^>]+property=['"]${escaped}['"]`, "iu"))?.[1]
    ?? "",
  );
}

function parseIsbn(value = "") {
  const isbn = value.replace(/\D/g, "");
  return /^97[89]\d{10}$/.test(isbn) ? isbn : undefined;
}

function parseNumber(value = "") {
  const parsed = Number(value.match(/\d{1,4}/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tags(html, tagName = "p") {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "giu"))]
    .map((match) => cleanText(match[1])).filter(Boolean);
}

function parseAge(value = "", fallback = [7, 12]) {
  const numbers = [...value.matchAll(/\d+/g)].map((match) => Number(match[0])).filter((number) => number <= 17);
  if (/дошколь/iu.test(value)) return [3, 6];
  if (/младш(?:его|ий) школь/iu.test(value)) return [6, 10];
  if (/средн(?:его|ий) школь/iu.test(value)) return [9, 13];
  if (/старш(?:его|ий) школь/iu.test(value)) return [12, 17];
  if (!numbers.length) return fallback;
  if (numbers.length >= 2) return [Math.max(2, Math.min(...numbers)), Math.min(17, Math.max(...numbers))];
  return [Math.max(2, numbers[0]), Math.min(17, numbers[0] + (numbers[0] < 7 ? 4 : 5))];
}

function parseAuthors(value = "", reversed = false) {
  return value.split(/\s*(?:,|;|\/| и )\s*/u).map((author) => cleanText(author)).filter(Boolean).map((author) => {
    const parts = author.split(/\s+/);
    if (!reversed || parts.length !== 2 || /^[А-ЯЁ]\.?$/u.test(parts[1])) return author;
    return `${parts[1]} ${parts[0]}`;
  });
}

const prohibited = /(энциклопед|атлас|справочник|словарь|учебник|учебное пособие|рабочая тетрад|раскраск|головоломк|кроссворд|эксперимент|поделк|готовим|рецепт|позна[её]т мир|изуча[ею]м|100 фактов|вопросы и ответы|путеводитель|биографи|мемуар|документальн|нон-фикшн|non.?fiction|научно-популярн|^комплект\b)/iu;
const fictionSignal = /(сказк|повест|роман|рассказ|стих|поэз|приключ|детектив|фэнтез|фантаст|комикс|графическ|геро[йя]|персонаж|сюжет|истори[яю] о|романтическ|миф|легенд|пьес)/iu;

function mapGenres(value) {
  const result = [];
  if (/сказк|миф|легенд/iu.test(value)) result.push("сказка");
  if (/фэнтез|волшеб/iu.test(value)) result.push("фэнтези");
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

const topicRules = [
  ["дружба", /друж|друз|приятел/iu], ["семья", /семь|мам[а-я]|пап[а-я]|родител|бабуш|дедуш|брат|сестр/iu],
  ["школа", /школ|учени|класс|урок/iu], ["детский сад", /детск(?:ий|ого) сад|дошколь/iu],
  ["животные", /животн|кот|кошк|собак|п[её]с|лис[а-я]|медвед|звер|птиц|лошад|крол|заяц/iu],
  ["природа", /природ|лес|море|океан|река|гор[аы]|дерев|растен/iu],
  ["космос", /космос|космич|планет|зв[её]зд|астронавт/iu], ["экология", /экологи|окружающ|защит[а-я]+ природ|климат/iu],
  ["история", /историческ|прошл|войн|древн/iu], ["мифология", /миф|олимп|легенд/iu],
  ["искусство", /искусств|худож|рисов|картин/iu], ["музыка", /музык|песн|оркестр|скрип|пиан/iu],
  ["театр", /театр|сцен[а-я]|спектак/iu], ["спорт", /спорт|футбол|хокке|соревнован|олимпиад/iu],
  ["путешествия", /путеше|дорог|экспедиц|странств/iu], ["морские приключения", /морск|океан|корабл|пират|остров/iu],
  ["изобретения", /изобрет|мастерит|конструир/iu], ["взросление", /взросл|подрост|перемен|самостоятель/iu],
  ["самооценка", /уверенн|самооцен|принима[а-я]+ себя|стесня/iu], ["отношения", /отношен|влюб|любов|ссор|примир/iu],
  ["юмор", /юмор|смешн|вес[её]л/iu], ["волшебство", /волшеб|маг|чарод|колдун/iu],
  ["приключения", /приключ|путеше|опасност|спас[а-я]+/iu],
];

function mapThemes(value, genres) {
  const result = topicRules.filter(([, rule]) => rule.test(value)).map(([topic]) => topic);
  if (!result.length) result.push(genres.includes("сказка") || genres.includes("фэнтези") ? "волшебство" : "отношения");
  return [...new Set(result)].slice(0, 5);
}

function lengthCategory(pages) {
  if (!pages || pages <= 32) return "very-short";
  if (pages <= 80) return "short";
  if (pages <= 220) return "medium";
  return "long";
}

function readingMode(ageMin, pages) {
  if (ageMin <= 6) return pages && pages > 120 ? "together" : "both";
  return ageMin >= 10 ? "independent" : "both";
}

function reason(genres, themes, ageMin, ageMax) {
  return `Подойдёт читателям ${ageMin}–${ageMax} лет, которым нравятся ${genres[0]} и книги на темы «${themes.slice(0, 2).join("» и «")}».`;
}

function makeBook({ source, sourceUrl, title, authors, annotation, coverUrl, isbn13, age, pages, year, seriesName, translator, sourceGenre }) {
  if (!title || !authors.length || annotation.length < 90 || !coverUrl || !isbn13 || prohibited.test(`${title} ${sourceGenre}`)) return null;
  if (source !== "Альпина.Дети" && !fictionSignal.test(`${title} ${sourceGenre} ${annotation}`)) return null;
  const genres = mapGenres(`${title} ${sourceGenre} ${annotation}`);
  const themes = mapThemes(`${title} ${sourceGenre} ${annotation}`, genres);
  const [ageMin, ageMax] = age;
  const prefix = source === "Белая ворона" ? "whitecrow" : source === "КомпасГид" ? "kompasgid" : "alpina-deti";
  const sourceSlug = slugify(new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1));
  const slug = `${prefix}-${slugify(title)}-${sourceSlug}`.slice(0, 120).replace(/-+$/g, "");
  return {
    id: `curated-${slug}`,
    slug,
    title,
    authors,
    publisher: source,
    publicationYear: year,
    pages,
    seriesName,
    translator,
    isbn13,
    shortDescription: annotation,
    fullDescription: annotation,
    whyRecommended: reason(genres, themes, ageMin, ageMax),
    ageMin,
    ageMax,
    readingMode: readingMode(ageMin, pages),
    genres,
    themes,
    moods: [],
    languageDifficulty: ageMin <= 6 ? "easy" : ageMin <= 10 ? "medium" : "advanced",
    lengthCategory: lengthCategory(pages),
    sensitiveTopics: [],
    sensitiveTopicsReviewed: false,
    cover: {
      kind: "external",
      url: coverUrl,
      rightsStatus: "external-display-only",
      sourceName: `Издательство «${source}»`,
      sourcePageUrl: sourceUrl,
      isbn13,
      temporary: true,
      attribution: "Обложка предоставлена издательством.",
      verifiedAt: checkedAt,
    },
    annotationProvenance: {
      source: `Издательство «${source}»`,
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

function whiteCrowBook(html, sourceUrl) {
  const title = cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "");
  const authors = [...html.matchAll(/<h3[^>]+class="[^"]*product-author[^"]*"[^>]*>([\s\S]*?)<\/h3>/giu)]
    .map((match) => cleanText(match[1])).filter(Boolean).slice(0, 1).flatMap((value) => parseAuthors(value));
  const ageText = cleanText(html.match(/<[^>]+class="[^"]*product-target-group[^"]*"[^>]*>([\s\S]*?)<\/(?:div|h3|p)>/iu)?.[1] ?? "");
  const annotation = meta(html, "og:description");
  const body = cleanText(html);
  return makeBook({
    source: "Белая ворона", sourceUrl, title, authors, annotation,
    coverUrl: meta(html, "og:image"), isbn13: parseIsbn(body.match(/ISBN:\s*([^\n]+)/iu)?.[1]),
    age: parseAge(ageText, [4, 9]), pages: parseNumber(body.match(/Объ[её]м:\s*([^\n]+)/iu)?.[1]),
    year: parseNumber(body.match(/(?:Год издания|Издано):\s*([^\n]+)/iu)?.[1]),
    translator: cleanText(body.match(/Перевод:\s*([^\n]+)/iu)?.[1]), sourceGenre: ageText,
  });
}

function characteristics(html) {
  const result = new Map();
  for (const match of html.matchAll(/<div class="characterictics__label">([\s\S]*?)<\/div>[\s\S]*?<div class="characterictics__value">([\s\S]*?)<\/div>/giu)) {
    result.set(cleanText(match[1]), cleanText(match[2]));
  }
  return result;
}

function kompasBook(html, sourceUrl) {
  const fields = characteristics(html);
  const rawTitle = cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "");
  const title = rawTitle.includes("|") ? rawTitle.split("|").slice(1).join("|").trim() : rawTitle;
  const review = cleanText(html.match(/<div[^>]+class="[^"]*reviews__text[^"]*"[^>]*>([\s\S]*?)<\/div>/iu)?.[1] ?? "")
    .replace(/^@\S+\s*/u, "").trim();
  const ageText = `${fields.get("Возраст") ?? ""} ${fields.get("Рекомендуемый возраст") ?? ""}`;
  return makeBook({
    source: "КомпасГид", sourceUrl, title, authors: parseAuthors(fields.get("Автор"), true),
    annotation: review, coverUrl: meta(html, "og:image"), isbn13: parseIsbn(fields.get("ISBN")),
    age: parseAge(ageText, [7, 13]), pages: parseNumber(fields.get("Стр.")),
    year: parseNumber(fields.get("Год выпуска")), seriesName: fields.get("Серия") || undefined,
    sourceGenre: fields.get("Жанры") ?? "художественная книга",
  });
}

function specs(html) {
  const result = new Map();
  for (const match of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/giu)) {
    result.set(cleanText(match[1]), cleanText(match[2]));
  }
  return result;
}

function alpinaBook(html, sourceUrl) {
  const fields = specs(html);
  if (fields.get("Издательство") !== "Альпина.Дети") return null;
  const title = cleanText(html.match(/<span[^>]+class="[^"]*b-book-primary__title-main[^"]*"[^>]*>([\s\S]*?)<\/span>/iu)?.[1] ?? "");
  const authorBlock = html.match(/<div[^>]+class="[^"]*b-book-primary__authors[^"]*"[^>]*>([\s\S]*?)<\/div><\/div>/iu)?.[1] ?? "";
  const authors = [...authorBlock.matchAll(/<span[^>]+itemprop="name"[^>]*>([\s\S]*?)<\/span>/giu)].map((match) => cleanText(match[1])).filter(Boolean);
  const about = html.match(/<h2[^>]+id="o-chem"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?:<h2|<div class="box|<\/section>)/iu)?.[1] ?? "";
  const annotation = tags(about).filter((paragraph) => paragraph.length >= 60).join("\n\n");
  return makeBook({
    source: "Альпина.Дети", sourceUrl, title, authors, annotation,
    coverUrl: meta(html, "og:image"), isbn13: parseIsbn(fields.get("ISBN")),
    age: parseAge(fields.get("Рекомендуемый возраст"), [6, 11]), pages: parseNumber(fields.get("Количество страниц")),
    year: parseNumber(fields.get("Год выпуска")), seriesName: fields.get("Серия") || undefined,
    sourceGenre: "детская художественная литература",
  });
}

function sitemapLinks(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)].map((match) => decode(match[1]).trim()).filter((url) => /\/product\//u.test(url));
}

function categoryLinks(html, baseUrl) {
  return [...new Set([...html.matchAll(/href=['"]([^'"]*\/catalog\/book-[^'"]+\/)['"]/giu)]
    .map((match) => new URL(decode(match[1]), baseUrl).href))];
}

async function collect(label, links, parser, target) {
  const books = [];
  const rejected = [];
  for (let offset = 0; offset < links.length && books.length < target; offset += 10) {
    const batch = links.slice(offset, offset + 10);
    const pages = await Promise.all(batch.map(async (url) => {
      try {
        return { url, html: await fetchText(url) };
      } catch (error) {
        return { url, error: String(error) };
      }
    }));
    for (const page of pages) {
      if (books.length >= target) break;
      if (page.error) {
        rejected.push({ sourceUrl: page.url, reason: page.error });
        continue;
      }
      const book = parser(page.html, page.url);
      if (book) books.push(book);
      else rejected.push({ sourceUrl: page.url, reason: "not_complete_fiction_card" });
    }
    console.log(`${label}: ${books.length}/${target}, просмотрено ${Math.min(offset + batch.length, links.length)}/${links.length}`);
  }
  return { books, rejected };
}

const current = JSON.parse(await readFile(currentCatalogPath, "utf8"))
  .filter((book) => !/^curated-(?:whitecrow|kompasgid|alpina-deti)-/u.test(String(book.id)));
const previousSource = JSON.parse(await readFile(outputPath, "utf8"));
const existingKeys = new Set(current.map((book) => titleAuthorKey(book.title, String(book.author).split(/\s*;\s*/u))));
const existingIsbn = new Set(current.map((book) => book.isbn13).filter(Boolean));

const [whiteCrowXml, kompasXml, ...alpinaPages] = await Promise.all([
  fetchText(publisherSources.whiteCrow.sitemap),
  fetchText(publisherSources.kompas.sitemap),
  ...Array.from({ length: 8 }, (_, index) => fetchText(
    index === 0 ? publisherSources.alpina.category : `${publisherSources.alpina.category}?PAGEN_1=${index + 1}`,
  )),
]);

const whiteCrow = await collect("Белая ворона", sitemapLinks(whiteCrowXml), whiteCrowBook, perPublisherTarget + 20);
const kompas = await collect("КомпасГид", sitemapLinks(kompasXml), kompasBook, perPublisherTarget + 20);
const alpinaLinks = [...new Set(alpinaPages.flatMap((html) => categoryLinks(html, publisherSources.alpina.category)))];
const alpina = await collect("Альпина.Дети", alpinaLinks, alpinaBook, perPublisherTarget + 20);

const selected = [];
const rejectedDuplicates = [];
for (const book of previousSource.books ?? []) {
  const key = titleAuthorKey(book.title, book.authors);
  if (existingKeys.has(key) || existingIsbn.has(book.isbn13)) continue;
  existingKeys.add(key);
  existingIsbn.add(book.isbn13);
  selected.push(book);
}
for (const group of [whiteCrow.books, kompas.books, alpina.books]) {
  let acceptedForPublisher = selected.filter((book) => book.publisher === group[0]?.publisher).length;
  for (const book of group) {
    if (acceptedForPublisher >= perPublisherTarget + 20) break;
    const key = titleAuthorKey(book.title, book.authors);
    if (existingKeys.has(key) || existingIsbn.has(book.isbn13)) {
      rejectedDuplicates.push({ id: book.id, title: book.title, authors: book.authors, reason: "duplicate_existing_catalog" });
      continue;
    }
    existingKeys.add(key);
    existingIsbn.add(book.isbn13);
    selected.push(book);
    acceptedForPublisher += 1;
  }
}

if (selected.length < 200) {
  throw new Error(`После проверки получено только ${selected.length} уникальных полных карточек; требуется не менее 200.`);
}

const counts = Object.fromEntries([...new Set(selected.map((book) => book.publisher))]
  .map((publisher) => [publisher, selected.filter((book) => book.publisher === publisher).length]));
const output = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: "Официальные каталоги издательств; только детская художественная литература с полной карточкой и аннотацией.",
  officialCatalogs: Object.values(publisherSources).map(({ name, officialUrl }) => ({ publisher: name, url: officialUrl })),
  books: selected,
  enrichments: [],
  report: {
    requestedPerPublisher: perPublisherTarget,
    accepted: selected.length,
    publisherCounts: counts,
    duplicateRejections: rejectedDuplicates,
    sourceRejections: [...whiteCrow.rejected, ...kompas.rejected, ...alpina.rejected],
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Сохранено ${selected.length} книг: ${JSON.stringify(counts)}`);
