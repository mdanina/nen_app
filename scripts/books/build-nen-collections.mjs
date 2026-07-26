import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "data/source/nen-book-collections.json");
const catalogPath = resolve(root, "data/generated/books.json");
const targetPath = resolve(root, "apps/books/src/data/collections.ts");
const reportPath = resolve(root, "data/reports/nen-collections-coverage.json");

function normalize(value = "") {
  return String(value).toLocaleLowerCase("ru").replaceAll("ё", "е")
    .replace(/[«»„“”"'…]/g, " ").replace(/\b(?:серия|трилогия|книга)\b/gu, " ")
    .replace(/[^a-zа-я0-9]+/giu, " ").trim();
}

function matchBook(title, books) {
  const needle = normalize(title);
  const exact = books.filter((book) => normalize(book.title) === needle);
  if (exact.length === 1) return exact[0];
  const contains = books.filter((book) => {
    const candidate = normalize(book.title);
    return candidate.length >= 5 && (candidate.includes(needle) || needle.includes(candidate));
  }).sort((left, right) => Math.abs(normalize(left.title).length - needle.length) - Math.abs(normalize(right.title).length - needle.length));
  return contains[0];
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const books = JSON.parse(await readFile(catalogPath, "utf8"));
const report = [];
const collections = source.collections.map((collection) => {
  const matched = [];
  const missing = [];
  for (const title of collection.titles) {
    const book = matchBook(title, books);
    if (book && !matched.some((item) => item.id === book.id)) matched.push({ id: book.id, title: book.title });
    else missing.push(title);
  }
  report.push({
    slug: collection.slug,
    sourceUrl: collection.sourceUrl,
    sourceTitleCount: collection.titles.length,
    matchedCount: matched.length,
    matched,
    missing,
  });
  return {
    slug: collection.slug,
    title: collection.title,
    description: collection.description,
    introduction: collection.introduction,
    bookIds: matched.map((item) => item.id),
    ageLabel: collection.ageLabel,
    updatedAt: source.updatedAt,
    sourceUrl: collection.sourceUrl,
  };
});

const incompleteCollections = report.filter((collection) => collection.missing.length);
if (incompleteCollections.length) {
  throw new Error(`Подборки НЭН восстановлены не полностью: ${incompleteCollections.map((item) => `${item.slug} (${item.matchedCount}/${item.sourceTitleCount})`).join(", ")}`);
}

const serialized = JSON.stringify(collections, null, 2)
  .replace(/"([^"]+)":/g, "$1:")
  .replace(/^/gm, "  ");
const output = `export interface BookCollection {
  slug: string;
  title: string;
  description: string;
  introduction: string;
  bookIds: string[];
  ageLabel?: string;
  updatedAt: string;
  sourceUrl?: string;
}

export const collections: BookCollection[] = ${serialized.trimStart()};
`;

await writeFile(targetPath, output, "utf8");
await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), collections: report }, null, 2)}\n`, "utf8");
console.log(`Сформировано подборок НЭН: ${collections.length}`);
for (const item of report) console.log(`${item.slug}: ${item.matchedCount}/${item.sourceTitleCount}`);
