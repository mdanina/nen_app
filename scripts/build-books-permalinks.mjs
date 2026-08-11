import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bookTitleTag, catalogAudience } from "./books/page-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps", "books", "dist");
const template = await readFile(path.join(dist, "index.html"), "utf8");
const books = JSON.parse(await readFile(path.join(root, "data", "generated", "books.json"), "utf8"));

// Боевой адрес известен заранее: сервис живёт в подкаталоге n-e-n.ru.
// Раньше здесь подставлялся домен превью, и canonical всех 2500 страниц уезжал на него.
const DEFAULT_ORIGIN = "https://n-e-n.ru";
const origin = (process.env.BOOKS_PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");
const basePath = `/${(process.env.BOOKS_BASE_PATH ?? "/knigi/").replace(/^\/+|\/+$/g, "")}`;
// Слэш на конце — конвенция адресов сайта (urlManager suffix «/»).
const publicUrl = (route) => `${origin}${basePath}${route === "/" ? "/" : `${route}/`}`;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

function withMetadata(html, { title, description, canonicalPath, noIndex = false, type = "website" }) {
  const canonical = publicUrl(canonicalPath);
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

const indexedRoutes = [];
async function writeIndexedRoute(route, metadata) {
  await writeRoute(route, metadata);
  if (!metadata.noIndex) indexedRoutes.push({ route, priority: metadata.priority ?? 0.6 });
}

const sharedRoutes = [
  ["/", "Что почитать с детьми — рекомендации НЭН", "Книги для детей по возрасту, интересам и настроению ребёнка.", { priority: 1 }],
  ["/katalog", "Каталог детских книг — НЭН", `Книги для детей по возрасту, темам, настроению и формату чтения. ${catalogAudience(books)}`, { priority: 0.9 }],
  ["/podborki", "Подборки НЭН", "Редакционные подборки детских книг для разных возрастов и семейных запросов.", { priority: 0.8 }],
  ["/podbor", "Подбор книги — НЭН", "Ответьте на несколько вопросов и получите рекомендации с объяснением.", { priority: 0.7 }],
  ["/izbrannoe", "Избранное — НЭН", "Сохранённые книги и рекомендации НЭН.", { noIndex: true }],
];

for (const [route, title, description, options = {}] of sharedRoutes) {
  await writeIndexedRoute(route, { title, description, canonicalPath: route, ...options });
}

for (const book of books) {
  await writeIndexedRoute(`/kniga/${book.slug}`, {
    title: bookTitleTag(book),
    description: book.shortDescription,
    canonicalPath: `/kniga/${book.slug}`,
    type: "book",
    priority: 0.5,
  });
}

const collectionsSource = await readFile(path.join(root, "apps", "books", "src", "data", "collections.ts"), "utf8");
const collectionSlugs = [...collectionsSource.matchAll(/\{\s*slug:\s*"([^"]+)"/g)].map((match) => match[1]);
for (const slug of collectionSlugs) {
  await writeIndexedRoute(`/podborki/${slug}`, {
    title: "Подборка НЭН",
    description: "Редакционная подборка детских книг НЭН.",
    canonicalPath: `/podborki/${slug}`,
    priority: 0.7,
  });
}

await writeRoute("/404", {
  title: "Страница не найдена — НЭН",
  description: "Такой страницы нет. Вернитесь на главную книжного сервиса НЭН.",
  canonicalPath: "/404",
  noIndex: true,
});

// Без карты сайта поисковик не узнает про 2500 страниц: внутренних ссылок на них
// столько же, сколько карточек на экране, — остальные скрыты за фильтрами.
const lastModified = (process.env.BOOKS_SITEMAP_DATE ?? new Date().toISOString()).slice(0, 10);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexedRoutes.map(({ route, priority }) => `  <url><loc>${escapeHtml(publicUrl(route))}</loc><lastmod>${lastModified}</lastmod><priority>${priority.toFixed(1)}</priority></url>`),
  "</urlset>",
  "",
].join("\n");
await writeFile(path.join(dist, "sitemap.xml"), sitemap, "utf8");

// robots.txt отдаётся с корня домена, поэтому здесь он нужен только для случая,
// когда сервис разворачивают на отдельном поддомене или превью-стенде.
await writeFile(path.join(dist, "robots.txt"), [
  "User-agent: *",
  "Allow: /",
  `Sitemap: ${origin}${basePath}/sitemap.xml`,
  "",
].join("\n"), "utf8");

console.log(`Сформировано постоянных страниц книг: ${books.length}`);
console.log(`Карта сайта: ${indexedRoutes.length} адресов, база ${origin}${basePath}`);
