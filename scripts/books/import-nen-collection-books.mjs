import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const collectionsPath = resolve(root, "data/source/nen-book-collections.json");
const catalogPath = resolve(root, "data/generated/books.json");
const outputPath = resolve(root, "data/source/nen-collection-books.json");
const checkedAt = new Date().toISOString().slice(0, 10);

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

function text(value = "") {
  return decode(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalize(value = "") {
  return text(value).toLocaleLowerCase("ru").replaceAll("ё", "е")
    .replace(/[«»„“”"'…]/g, " ").replace(/\b(?:серия|трилогия|книга)\b/gu, " ")
    .replace(/[^a-zа-я0-9]+/giu, " ").trim();
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
    headers: { "user-agent": "NEN catalog collections restorer/1.0", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function headings(html) {
  return [...html.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/giu)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length, label: text(match[2]) }))
    .filter((item) => item.label);
}

function findHeading(title, list) {
  const needle = normalize(title);
  return list
    .map((item) => ({ item, score: normalize(item.label) === needle ? 3 : normalize(item.label).includes(needle) ? 2 : needle.includes(normalize(item.label)) ? 1 : 0 }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || Math.abs(normalize(left.item.label).length - needle.length) - Math.abs(normalize(right.item.label).length - needle.length))[0]?.item;
}

function matchExistingBook(title, books) {
  const needle = normalize(title);
  const exact = books.filter((book) => normalize(book.title) === needle);
  if (exact.length === 1) return exact[0];
  return books
    .filter((book) => {
      const candidate = normalize(book.title);
      return candidate.length >= 5 && (candidate.includes(needle) || needle.includes(candidate));
    })
    .sort((left, right) => Math.abs(normalize(left.title).length - needle.length) - Math.abs(normalize(right.title).length))[0];
}

function paragraphTexts(html) {
  return [...html.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/giu)]
    .map((match) => text(match[1])).filter(Boolean);
}

function imageBefore(html, start) {
  const window = html.slice(Math.max(0, start - 7000), start + 1200);
  const images = [...window.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/giu)]
    .map((match) => decode(match[1])).filter((url) => !/(?:logo|avatar|icon|emoji|pixel|data:image)/iu.test(url));
  const value = images.at(-1);
  if (!value) return undefined;
  try {
    return new URL(value, "https://n-e-n.ru/").href;
  } catch {
    return undefined;
  }
}

function cleanTitle(value) {
  return text(value)
    .replace(/^\d+[.)]\s*/u, "")
    .replace(/^«([\s\S]+)»$/u, "$1")
    .replace(/^"([\s\S]+)"$/u, "$1")
    .trim();
}

function authorsFrom(heading, title, paragraphs) {
  const label = cleanTitle(heading);
  const joined = paragraphs.slice(0, 6).join("\n");
  const explicit = joined.match(/(?:^|\n)(?:Авторы? и иллюстраторы?|Авторы?)\s*:?\s*([^\n]{2,100})/iu)?.[1];
  if (explicit) return explicit.replace(/\s*(?:Издательство|Возраст)\b[\s\S]*$/iu, "").trim();

  const escapedTitle = cleanTitle(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const withoutTitle = label
    .replace(new RegExp(`[«"]?${escapedTitle}[»"]?`, "iu"), " ")
    .replace(/^\d+[.)]\s*/u, "")
    .replace(/^[\s,:;|—–-]+|[\s,:;|—–-]+$/gu, "")
    .trim();
  if (
    withoutTitle
    && withoutTitle.length <= 100
    && normalize(withoutTitle) !== normalize(label)
    && !/[.!?]$/u.test(withoutTitle)
  ) return withoutTitle;

  const short = paragraphs.slice(0, 4).find((value) => (
    value.length >= 3 && value.length <= 80
    && !/(?:издательств|возраст|\d+\+|иллюстрац|перевод)/iu.test(value)
    && !normalize(value).includes(normalize(title))
  ));
  return short?.trim();
}

function publisherFrom(paragraphs) {
  const joined = paragraphs.slice(0, 8).join("\n");
  return joined.match(/(?:^|\n)Издательство\s*[«"]?([^»"\n]{2,80})/iu)?.[1]?.replace(/[.,:]$/u, "").trim();
}

function annotationFrom(paragraphs, title, author) {
  const prohibited = /^(?:автор|издательств|возраст|перевод|иллюстратор|\d+\+|image\b|фото\b)/iu;
  const selected = paragraphs.filter((paragraph) => (
    paragraph.length >= 70 && paragraph.length <= 1400
    && !prohibited.test(paragraph)
    && !normalize(paragraph).startsWith(normalize(title))
    && (!author || normalize(paragraph) !== normalize(author))
  ));
  return selected.slice(0, 2).join("\n\n").trim();
}

function ageFrom(paragraphs, ageLabel) {
  const joined = paragraphs.slice(0, 8).join(" ");
  const explicit = joined.match(/(?:Возраст\s*)?(\d{1,2})\+/iu);
  if (explicit) {
    const min = Math.max(2, Number(explicit[1]));
    return [min, Math.min(17, min + (min < 7 ? 4 : 5))];
  }
  const values = [...String(ageLabel).matchAll(/\d+/g)].map((match) => Number(match[0]));
  return values.length >= 2 ? [values[0], Math.min(17, values[1])] : [6, 12];
}

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
  if (/энциклопед|научн|факт|познават/iu.test(value)) result.push("научно-популярная литература");
  if (!result.length) result.push("реалистическая проза");
  return [...new Set(result)].slice(0, 3);
}

const topicRules = [
  ["дружба", /друж|друз|приятел/iu], ["семья", /семь|мам[а-я]|пап[а-я]|родител|бабуш|дедуш|брат|сестр/iu],
  ["школа", /школ|учени|класс|урок/iu], ["животные", /животн|кот|кошк|собак|п[её]с|лис[а-я]|медвед|звер|птиц/iu],
  ["природа", /природ|лес|море|океан|река|гор[аы]|дерев|растен/iu], ["наука", /наук|уч[её]н|исследован|факт/iu],
  ["история", /историческ|прошл|войн|древн/iu], ["искусство", /искусств|худож|рисов|картин/iu],
  ["путешествия", /путеше|дорог|экспедиц|странств/iu], ["взросление", /взросл|подрост|перемен|самостоятель/iu],
  ["отношения", /отношен|влюб|любов|ссор|примир/iu], ["юмор", /юмор|смешн|вес[её]л/iu],
  ["волшебство", /волшеб|маг|чарод|колдун/iu], ["приключения", /приключ|путеше|опасност|спас[а-я]+/iu],
  ["музыка", /музык|песн|оркестр|скрип|пиан/iu], ["театр", /театр|сцен[а-я]|спектак/iu],
];

function themes(value, mappedGenres) {
  const result = topicRules.filter(([, rule]) => rule.test(value)).map(([theme]) => theme);
  if (!result.length) result.push(mappedGenres.includes("сказка") || mappedGenres.includes("фэнтези") ? "волшебство" : "отношения");
  return [...new Set(result)].slice(0, 5);
}

function lengthCategory(annotation) {
  return annotation.length > 800 ? "long" : annotation.length > 350 ? "medium" : "short";
}

const verifiedMetadata = new Map([
  ["про лиса и поросенка", { authors: ["Бьёрн Рёрвик"], publisher: "Самокат" }],
  ["питер пэн", { authors: ["Джеймс Барри"] }],
  ["стихи маши рупасовой", { authors: ["Маша Рупасова"] }],
  ["семейный альбом тираннозавра тони", { authors: ["Майк Бентон"] }],
  ["мейделин финн и собака из приюта", { authors: ["Лиза Папп"] }],
  ["человеткин", { authors: ["Джулия Дональдсон"] }],
  ["мартын и барсик", { authors: ["Маша Рупасова"], publisher: "Альпина.Дети" }],
  ["все о муми троллях", { authors: ["Туве Янссон"] }],
  ["королевство кривых зеркал", { authors: ["Виталий Губарев"] }],
  ["гном и лис", {
    authors: ["Астрид Линдгрен"],
    publisher: "Белая ворона",
    description: "Однажды морозной ночью Лис отправляется на хутор, чтобы раздобыть себе ужин. Но в этот раз он встречает там Гнома, который не собирается давать обитателей хутора в обиду.",
  }],
  ["что нужно маленькой кошке", { authors: ["Наталья Шалошвили"] }],
  ["брат дракона", { authors: ["Лариса Романовская"] }],
  ["хейтеры", { authors: ["Джесси Эндрюс"] }],
  ["щепотка магии", { authors: ["Мишель Харрисон"] }],
  ["горстка волшебства", { authors: ["Мишель Харрисон"] }],
  ["клубок заклинаний", { authors: ["Мишель Харрисон"] }],
  ["6 минут для детей", { authors: ["Доминик Спенст"] }],
  ["истории про пярта", { authors: ["Анти Саар"] }],
  ["школа рисования горошка", { authors: ["Давид Кали"] }],
  ["и кто то сказал привет", { authors: ["Нихан Темиз"] }],
  ["самое первое новогоднее дерево", { authors: ["Овила Фонтен"] }],
  ["вьюжик и упавшая звезда", { authors: ["Анна Моховая"] }],
]);

const source = JSON.parse(await readFile(collectionsPath, "utf8"));
const catalog = JSON.parse(await readFile(catalogPath, "utf8")).filter((book) => !String(book.id).startsWith("curated-nen-collection-"));
const articles = new Map();
for (const collection of source.collections) {
  if (!articles.has(collection.sourceUrl)) articles.set(collection.sourceUrl, await fetchText(collection.sourceUrl));
}

const candidates = new Map();
for (const collection of source.collections) {
  for (const title of collection.titles) {
    const key = normalize(title);
    if (!matchExistingBook(title, catalog) && !candidates.has(key)) candidates.set(key, { title, collections: [collection] });
    else if (candidates.has(key)) candidates.get(key).collections.push(collection);
  }
}

const books = [];
const unresolved = [];
for (const candidate of candidates.values()) {
  let parsed;
  for (const collection of candidate.collections) {
    const html = articles.get(collection.sourceUrl);
    const list = headings(html);
    const heading = findHeading(candidate.title, list);
    if (!heading) continue;
    const next = list.find((item) => item.start > heading.start);
    const section = html.slice(heading.end, next?.start ?? Math.min(html.length, heading.end + 16000));
    const paragraphs = paragraphTexts(section);
    const metadata = verifiedMetadata.get(normalize(candidate.title));
    const author = metadata?.authors.join("; ") ?? authorsFrom(heading.label, candidate.title, paragraphs);
    const annotation = metadata?.description ?? annotationFrom(paragraphs, candidate.title, author);
    if (!author || !annotation) continue;
    const title = cleanTitle(candidate.title);
    const [ageMin, ageMax] = ageFrom(paragraphs, collection.ageLabel);
    const value = `${title} ${annotation}`;
    const mappedGenres = genres(value);
    const mappedThemes = themes(value, mappedGenres);
    const slug = `nen-collection-${slugify(title)}-${slugify(author).split("-").slice(-2).join("-")}`.slice(0, 118).replace(/-+$/u, "");
    parsed = {
      id: `curated-${slug}`,
      slug,
      title,
      authors: metadata?.authors ?? author.split(/\s*(?:;| и )\s*/u).filter(Boolean),
      publisher: metadata?.publisher ?? publisherFrom(paragraphs),
      shortDescription: annotation,
      fullDescription: annotation,
      ageMin,
      ageMax,
      readingMode: ageMin <= 7 ? "both" : "independent",
      genres: mappedGenres,
      themes: mappedThemes,
      moods: [],
      languageDifficulty: ageMin <= 6 ? "easy" : ageMin <= 10 ? "medium" : "advanced",
      lengthCategory: lengthCategory(annotation),
      sensitiveTopics: [],
      sensitiveTopicsReviewed: false,
      coverUrl: imageBefore(html, heading.start),
      annotationProvenance: {
        source: "НЭН",
        sourceUrl: collection.sourceUrl,
        method: "nen_editorial_description",
        verifiedAt: checkedAt,
        copiedVerbatim: true,
      },
      bibliographicSources: [collection.sourceUrl],
      sourceMetadata: {
        sourceUrl: collection.sourceUrl,
        collectionSlugs: candidate.collections.map((item) => item.slug),
      },
      status: "published",
    };
    break;
  }
  if (parsed) books.push(parsed);
  else unresolved.push({ title: candidate.title, sourceUrls: candidate.collections.map((item) => item.sourceUrl), reason: "author_or_description_not_resolved" });
}

const duplicateSlugs = books.filter((book, index) => books.findIndex((candidate) => candidate.slug === book.slug) !== index);
if (duplicateSlugs.length) throw new Error(`Повторяющиеся slug: ${duplicateSlugs.map((book) => book.slug).join(", ")}`);

await writeFile(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourcePolicy: "Карточки восстановлены из редакционных книжных подборок НЭН; отсутствующие сведения не выдумываются.",
  books,
  unresolved,
}, null, 2)}\n`, "utf8");
console.log(`Карточек НЭН создано: ${books.length}; не разрешено: ${unresolved.length}`);
