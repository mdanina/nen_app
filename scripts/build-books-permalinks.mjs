import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps", "books", "dist");
const template = await readFile(path.join(dist, "index.html"), "utf8");
const books = JSON.parse(await readFile(path.join(root, "data", "generated", "books.json"), "utf8"));

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const origin = (process.env.BOOKS_PUBLIC_ORIGIN || (productionHost ? `https://${productionHost}` : "http://localhost:4173")).replace(/\/$/, "");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

function withMetadata(html, { title, description, canonicalPath, noIndex = false, type = "website" }) {
  const canonical = `${origin}${canonicalPath}`;
  const tags = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${noIndex ? "noindex,follow" : "index,follow"}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    '<meta property="og:locale" content="ru_RU" />',
    '<meta property="og:site_name" content="НЭН" />',
  ].join("\n    ");

  return html
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/>/s, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace("  </head>", `    ${tags}\n  </head>`);
}

async function writeRoute(route, metadata) {
  const relative = route === "/" ? "index.html" : `${route.replace(/^\//, "")}.html`;
  const destination = path.join(dist, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, withMetadata(template, metadata), "utf8");
}

const sharedRoutes = [
  ["/", "Что почитать с детьми — рекомендации НЭН", "Книги для детей по возрасту, интересам и настроению ребёнка."],
  ["/books", "Каталог детских книг — НЭН", "Книги для детей по возрасту, темам, настроению и формату чтения."],
  ["/catalog", "Каталог детских книг — НЭН", "Книги для детей по возрасту, темам, настроению и формату чтения."],
  ["/collections", "Подборки НЭН", "Редакционные подборки детских книг для разных возрастов и семейных запросов."],
  ["/recommend", "Подбор книги — НЭН", "Ответьте на несколько вопросов и получите рекомендации с объяснением."],
  ["/favorites", "Избранное — НЭН", "Сохранённые книги и рекомендации НЭН.", true],
];

for (const [route, title, description, noIndex = false] of sharedRoutes) {
  await writeRoute(route, { title, description, canonicalPath: route === "/catalog" ? "/books" : route, noIndex });
}

for (const book of books) {
  const canonicalPath = `/books/${book.slug}`;
  const metadata = {
    title: `${book.title} — книга для детей | НЭН`,
    description: book.shortDescription,
    canonicalPath,
    type: "book",
  };
  await writeRoute(canonicalPath, metadata);
  await writeRoute(`/catalog/${book.slug}`, metadata);
}

const collectionsSource = await readFile(path.join(root, "apps", "books", "src", "data", "collections.ts"), "utf8");
const collectionSlugs = [...collectionsSource.matchAll(/\{\s*slug:\s*"([^"]+)"/g)].map((match) => match[1]);
for (const slug of collectionSlugs) {
  await writeRoute(`/collections/${slug}`, {
    title: "Подборка НЭН",
    description: "Редакционная подборка детских книг НЭН.",
    canonicalPath: `/collections/${slug}`,
  });
}

await writeFile(path.join(dist, "404.html"), withMetadata(template, {
  title: "Страница не найдена — НЭН",
  description: "Такой страницы нет. Вернитесь на главную книжного сервиса НЭН.",
  canonicalPath: "/404",
  noIndex: true,
}), "utf8");

console.log(`Сформировано постоянных страниц книг: ${books.length}`);
