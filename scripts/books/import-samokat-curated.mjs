import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const outputPath = resolve(root, "data/source/curated-publisher-books.json");
const currentCatalogPath = resolve(root, "data/generated/books.json");
const categoryUrl = "https://samokatbook.ru/catalog/detskaya-hudozhestvennaya-literatura/";
const target = Number(process.argv.find((value) => value.startsWith("--target="))?.split("=")[1] ?? 175);
const checkedAt = new Date().toISOString().slice(0, 10);

const entities = new Map([
  ["amp", "&"], ["quot", "\""], ["apos", "'"], ["lt", "<"], ["gt", ">"],
  ["nbsp", " "], ["laquo", "«"], ["raquo", "»"], ["ndash", "–"], ["mdash", "—"],
]);

function decode(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities.get(name) ?? match);
}

function text(value = "") {
  return decode(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value = "") {
  return text(value).toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function authorKey(value = "") {
  return normalize(value).split(/\s+/).sort((a, b) => a.localeCompare(b, "ru")).join(" ");
}

function titleAuthorKey(title, authors) {
  return `${normalize(title)}|${authors.map(authorKey).sort().join(";")}`;
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
      "user-agent": "NEN books catalog curator/1.0 (single bounded official-catalog import)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function productLinks(html) {
  const links = [];
  const pattern = /<a\b([^>]*\bclass="[^"]*\bmain-goods_name\b[^"]*"[^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1].match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    const url = new URL(decode(href), categoryUrl).href;
    if (!links.includes(url)) links.push(url);
  }
  return links;
}

function option(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<div[^>]*class="[^"]*detail-content_option[^"]*"[^>]*>[\\s\\S]*?<span[^>]*>\\s*${escaped}\\s*<\\/span>([\\s\\S]*?)<\\/div>`,
    "iu",
  );
  return text(html.match(pattern)?.[1] ?? "");
}

function h1(html) {
  return text(html.match(/<h1\b[^>]*class="[^"]*detail-content__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "");
}

function description(html) {
  const section = html.match(/<div\b[^>]*class="[^"]*\barticle-text\b[^"]*"[^>]*id="description"[^>]*>([\s\S]*?)(?:<div\b[^>]*class="[^"]*\bdetail-share\b|<\/section>)/iu)?.[1] ?? "";
  const beforeReasons = section.split(/<h2\b/iu)[0];
  return [...beforeReasons.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
    .map((match) => text(match[1]))
    .filter((paragraph) => paragraph.length >= 40)
    .join("\n\n")
    .trim();
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decode(html.match(new RegExp(`<meta[^>]+property="${escaped}"[^>]+content="([^"]+)"`, "iu"))?.[1] ?? "");
}

function parseAuthors(value) {
  return value.split(/\s*[,;]\s*/).map((author) => {
    const parts = author.trim().split(/\s+/);
    if (parts.length < 2 || parts.some((part) => /^[А-ЯЁA-Z]\.?$/u.test(part))) return author.trim();
    if (/^[а-яё]/u.test(parts[0]) && parts.length >= 3) return `${parts.at(-1)} ${parts.slice(0, -1).join(" ")}`;
    return `${parts.slice(1).join(" ")} ${parts[0]}`;
  }).filter(Boolean);
}

function parseAge(value) {
  const numbers = [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (!numbers.length) return null;
  if (numbers.length === 1) return [Math.max(2, numbers[0]), Math.min(17, numbers[0] + 3)];
  return [Math.max(2, numbers[0]), Math.min(17, numbers[1])];
}

function parseNumber(value) {
  const parsed = Number(value.match(/\d+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIsbn(value) {
  const isbn = value.replace(/\D/g, "");
  return /^97[89]\d{10}$/.test(isbn) ? isbn : undefined;
}

const fictionGenre = /(сказ|повест|роман|рассказ|поэз|стих|комикс|графичес|фантаст|фэнтези|детектив|приключ|пьес|юмор|художествен)/iu;
const nonFictionGenre = /(нон-фикшн|научно-популяр|познаватель|биограф|автобиограф|документаль|энциклоп|справоч|учебн|методичес|пособ)/iu;
const nonBookTitle = /(комплект|набор открыток|блокнот|ежедневник|раскраск|рабочая тетрадь)/iu;
const confirmedNonFictionText = /(автобиографическ|документальн|воспоминани[яй]|мемуар|дневник очевидца|вела дневник.+(?:оккупац|войн|19\d{2})|реальная история автора|по долгу службы|редкая работа.+автор)/isu;

function mapGenres(sourceGenre, title, annotation) {
  const value = `${sourceGenre} ${title} ${annotation}`.toLocaleLowerCase("ru");
  const genres = [];
  if (/сказ|легенд|миф/.test(value)) genres.push("сказка");
  if (/фэнтези|волшеб/.test(value)) genres.push("фэнтези");
  if (/фантастик|космич/.test(value)) genres.push("научная фантастика");
  if (/детектив|расследован|тайн/.test(value)) genres.push("детектив");
  if (/приключ/.test(value)) genres.push("приключения");
  if (/юмор|смешн|весёл/.test(value)) genres.push("юмор");
  if (/стих|поэз/.test(value)) genres.push("поэзия");
  if (/историческ/.test(value)) genres.push("историческая проза");
  if (!genres.length) genres.push("реалистическая проза");
  return [...new Set(genres)];
}

const topicRules = [
  ["дружба", /друж|друз|приятел/iu],
  ["семья", /семь|мам[а-я]|пап[а-я]|родител|бабуш|дедуш|брат|сестр/iu],
  ["школа", /школ|учени|класс|урок/iu],
  ["детский сад", /детск(?:ий|ого) сад|дошколь/iu],
  ["животные", /животн|кот|кошк|собак|пёс|лис[а-я]|медвед|звер|птиц|лошад|крол|заяц/iu],
  ["природа", /природ|лес|море|океан|река|гора|дерев|растен/iu],
  ["космос", /космос|космич|планет|звёзд|звезд|астронавт/iu],
  ["экология", /экологи|окружающ|защит[а-я]+ природ|мусор|климат/iu],
  ["история", /историческ|прошл|войн|(?:^|\s)\d{1,2}\s*век|древн/iu],
  ["мифология", /миф|бог[аи]\b|олимп|легенд/iu],
  ["искусство", /искусств|худож|рисов|картин/iu],
  ["музыка", /музык|песн|оркестр|скрип|пиан/iu],
  ["театр", /театр|сцен[а-я]|спектак/iu],
  ["спорт", /спорт|футбол|хокке|соревнован|олимпиад/iu],
  ["путешествия", /путеше|дорог|экспедиц|странств/iu],
  ["морские приключения", /морск|океан|корабл|пират|остров/iu],
  ["изобретения", /изобрет|изобретател|мастерит|конструир/iu],
  ["взросление", /взросл|подрост|перемен|самостоятель/iu],
  ["самооценка", /уверенн|самооцен|принима[а-я]+ себя|стесня/iu],
  ["отношения", /отношен|влюб|любов|ссор|примир/iu],
  ["юмор", /юмор|смешн|весёл/iu],
  ["волшебство", /волшеб|маг|чарод|колдун/iu],
  ["приключения", /приключ|путеше|опасност|спас[а-я]+/iu],
];

function mapThemes(title, annotation, genre) {
  const value = `${title} ${annotation} ${genre}`;
  const themes = topicRules.filter(([, pattern]) => pattern.test(value)).map(([theme]) => theme);
  if (!themes.length) themes.push(/сказ|фэнтези|волшеб/iu.test(genre) ? "волшебство" : "отношения");
  return [...new Set(themes)].slice(0, 5);
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

function languageDifficulty(ageMin) {
  if (ageMin <= 6) return "easy";
  if (ageMin <= 10) return "medium";
  return "advanced";
}

function reasons(genres, themes, ageMin, ageMax) {
  const topic = themes.slice(0, 2).join(" и ");
  return `Подойдёт читателям ${ageMin}–${ageMax} лет, которым нравятся ${genres[0]}${topic ? ` и книги про ${topic}` : ""}.`;
}

function parseProduct(html, sourceUrl) {
  const title = h1(html).replace(/\s*\((?:перепл[её]т|обложка)\)\s*$/iu, "").trim();
  const authors = parseAuthors(option(html, "Автор:"));
  const sourceGenre = option(html, "жанр:");
  const age = parseAge(option(html, "рекомендуемый возраст:"));
  const publisher = option(html, "издательство:");
  const annotation = description(html);
  const coverUrl = meta(html, "og:image");
  const isbn13 = parseIsbn(option(html, "ISBN:"));
  const pages = parseNumber(option(html, "страниц:"));
  const publicationYear = parseNumber(option(html, "год:"));
  const seriesName = option(html, "серия:").replace(/^вне серии$/iu, "") || undefined;
  const translatorSource = option(html, "переводчик:") || option(html, "перевод:");
  const translator = translatorSource
    ? parseAuthors(translatorSource.replace(/^с\s+[а-яё-]+\s+/iu, "")).join("; ")
    : undefined;

  if (!title || !authors.length || !age || !publisher || !annotation || !coverUrl || !isbn13) return null;
  if (!fictionGenre.test(sourceGenre) || nonFictionGenre.test(sourceGenre) || nonBookTitle.test(title) || confirmedNonFictionText.test(annotation)) return null;
  const genres = mapGenres(sourceGenre, title, annotation);
  const themes = mapThemes(title, annotation, sourceGenre);
  const sourceSlug = new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1);
  const slug = `samokat-${slugify(title)}-${sourceSlug}`.slice(0, 120).replace(/-+$/g, "");
  const [ageMin, ageMax] = age;

  return {
    id: `curated-${slug}`,
    slug,
    title,
    authors,
    publisher: publisher.replace(/^издательство\s+/iu, "").trim(),
    publicationYear,
    pages,
    seriesName,
    translator,
    isbn13,
    shortDescription: annotation,
    fullDescription: annotation,
    whyRecommended: reasons(genres, themes, ageMin, ageMax),
    ageMin,
    ageMax,
    readingMode: readingMode(ageMin, pages),
    genres,
    themes,
    moods: [],
    languageDifficulty: languageDifficulty(ageMin),
    lengthCategory: lengthCategory(pages),
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

const current = JSON.parse(await readFile(currentCatalogPath, "utf8"))
  .filter((book) => !String(book.id).startsWith("curated-samokat-"));
const existingKeys = new Set(current.map((book) => titleAuthorKey(book.title, String(book.author).split(/\s*;\s*/))));
const existingIsbn = new Set(current.map((book) => book.isbn13).filter(Boolean));
const existingByKey = new Map(current.map((book) => [titleAuthorKey(book.title, String(book.author).split(/\s*;\s*/)), book]));
const existingByIsbn = new Map(current.filter((book) => book.isbn13).map((book) => [book.isbn13, book]));
const links = [];
for (let page = 1; page <= 20; page += 1) {
  const html = await fetchText(page === 1 ? categoryUrl : `${categoryUrl}?PAGEN_7=${page}`);
  for (const link of productLinks(html)) if (!links.includes(link)) links.push(link);
}

const books = [];
const enrichments = [];
const rejected = [];
for (let offset = 0; offset < links.length && books.length < target; offset += 8) {
  const batch = links.slice(offset, offset + 8);
  const pages = await Promise.all(batch.map(async (url) => {
    try {
      return { url, html: await fetchText(url) };
    } catch (error) {
      return { url, error: String(error) };
    }
  }));
  for (const page of pages) {
    if (page.error) {
      rejected.push({ sourceUrl: page.url, reason: page.error });
      continue;
    }
    const book = parseProduct(page.html, page.url);
    if (!book) {
      rejected.push({ sourceUrl: page.url, reason: "missing_required_field_or_not_confirmed_fiction" });
      continue;
    }
    const key = titleAuthorKey(book.title, book.authors);
    if (existingKeys.has(key) || existingIsbn.has(book.isbn13)) {
      const existing = existingByKey.get(key) ?? existingByIsbn.get(book.isbn13);
      if (existing && !enrichments.some((item) => item.id === existing.id)) {
        enrichments.push({
          id: existing.id,
          publisher: book.publisher,
          publicationYear: book.publicationYear,
          pages: book.pages,
          seriesName: book.seriesName,
          translator: book.translator,
          isbn13: book.isbn13,
          bibliographicSource: book.bibliographicSources[0],
        });
      }
      rejected.push({ sourceUrl: page.url, title: book.title, reason: "duplicate_existing_catalog" });
      continue;
    }
    if (books.some((item) => titleAuthorKey(item.title, item.authors) === key || item.isbn13 === book.isbn13)) {
      rejected.push({ sourceUrl: page.url, title: book.title, reason: "duplicate" });
      continue;
    }
    books.push(book);
    if (books.length >= target) break;
  }
}

if (books.length < 150) throw new Error(`Собрано только ${books.length} новых художественных книг: требуется не менее 150`);

const result = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "Издательство «Самокат»",
    categoryUrl,
    descriptionPolicy: "Официальные издательские аннотации сохранены без генерации.",
  },
  books,
  enrichments,
  rejected,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Собрано новых книг: ${books.length}; дополнено существующих: ${enrichments.length}; просмотрено карточек: ${books.length + rejected.length}; отклонено: ${rejected.length}`);
