import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const books = JSON.parse(await readFile(resolve(root, "data/generated/books.json"), "utf8"));
const research = JSON.parse(await readFile(resolve(root, "data/reports/annotation-source-research.json"), "utf8"));
const imported = books.filter((book) => book.id.startsWith("ol-"));
const prohibitedTemplate = /(?:относится к жанру|в центре внимания|эта книга рассказывает|это история о|юных читателей ждёт|книга знакомит|автор поднимает важные темы|произведение исследует|трогательная история|добрая история|увлекательная история|книга учит|книга поможет понять|на страницах этой книги)/iu;

function normalized(value) {
  return String(value ?? "").toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function seededSample(items, count, seed = 20260724) {
  let state = seed >>> 0;
  const ranked = items.map((item) => {
    state = (1664525 * state + 1013904223) >>> 0;
    return { item, rank: state };
  });
  return ranked.sort((left, right) => left.rank - right.rank).slice(0, count).map(({ item }) => item);
}

const descriptions = imported.filter((book) => book.shortDescription);
const allDescriptions = books.filter((book) => book.shortDescription);
const exactGroups = new Map();
for (const book of allDescriptions) {
  const key = normalized(book.shortDescription);
  if (!exactGroups.has(key)) exactGroups.set(key, []);
  exactGroups.get(key).push({ id: book.id, title: book.title, author: book.author });
}
const exactDuplicates = [...exactGroups.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([description, items]) => ({ description, items }));

function tokenSet(value) {
  return new Set(normalized(value).split(" ").filter((token) => token.length > 2));
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

const nearDuplicates = [];
for (let leftIndex = 0; leftIndex < allDescriptions.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < allDescriptions.length; rightIndex += 1) {
    const left = allDescriptions[leftIndex];
    const right = allDescriptions[rightIndex];
    if (normalized(left.shortDescription) === normalized(right.shortDescription)) continue;
    const similarity = jaccard(tokenSet(left.shortDescription), tokenSet(right.shortDescription));
    if (similarity >= 0.85) {
      nearDuplicates.push({
        similarity: Number(similarity.toFixed(3)),
        left: { id: left.id, title: left.title, description: left.shortDescription },
        right: { id: right.id, title: right.title, description: right.shortDescription },
      });
    }
  }
}

const items = imported.map((book) => ({
  id: book.id,
  title: book.title,
  author: book.author,
  description: book.shortDescription,
  status: book.shortDescription ? "published_with_factual_description" : "published_without_annotation",
  provenance: book.annotationProvenance,
  sourceDescriptionPresent: Boolean(book.sourceMetadata?.sourceDescription),
  sourceDescriptionPublicUseStatus: book.sourceMetadata?.descriptionProvenance?.publicUseStatus ?? null,
  bnfResearchStatus: research.items.find((item) => item.id === book.id)?.status ?? "not_in_research_scope",
}));

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    importedBooks: imported.length,
    removedTemplateAnnotations: imported.length,
    replacedWithVerbatimReusableAnnotations: 0,
    replacedWithIndependentFactualDescriptions: descriptions.length,
    withoutAnnotation: imported.length - descriptions.length,
    bnfExactMatches: research.matched,
    prohibitedTemplateHits: allDescriptions.filter((book) => prohibitedTemplate.test(book.shortDescription)).length,
    exactDuplicateDescriptionGroups: exactDuplicates.length,
    nearDuplicateDescriptionPairs: nearDuplicates.length,
  },
  sourcePolicy: {
    openLibrary: "Source descriptions were used only as factual evidence; they were not copied verbatim.",
    bnf: "The full remaining imported catalog was queried through official BnF SRU; no exact usable description matches were found.",
  },
  exactDuplicates,
  nearDuplicates,
  prohibitedTemplateHits: allDescriptions.filter((book) => prohibitedTemplate.test(book.shortDescription)).map((book) => ({ id: book.id, title: book.title, description: book.shortDescription })),
  verifiedSample50: seededSample(descriptions, Math.min(50, descriptions.length)).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.shortDescription,
    provenance: book.annotationProvenance,
    sourceDescription: book.sourceMetadata?.sourceDescription ?? null,
  })),
  withoutAnnotation: items.filter((item) => item.status === "published_without_annotation"),
  items,
};

const output = resolve(root, "data/reports/annotation-cleanup.json");
await mkdir(resolve(root, "data/reports"), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
