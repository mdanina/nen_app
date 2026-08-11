// Скачивает обложки каталога в собственный кеш, который потом раздаётся с n-e-n.ru.
// Идемпотентен: повторный запуск трогает только новые и изменившиеся адреса.
//
//   node scripts/books/cache-covers.mjs                 # докачать недостающее
//   node scripts/books/cache-covers.mjs --limit 50      # выборочно, для проверки
//   node scripts/books/cache-covers.mjs --refresh       # перекачать всё заново

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { cacheName, isCacheable, requestUrl } from "./cover-cache.mjs";

// Издательства отдают неоптимизированные оригиналы — в среднем 200 КБ на обложку,
// то есть около 5 МБ на экран каталога. Приводим к ширине витрины и в webp.
const COVER_WIDTH = 480;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = resolve(root, "data/generated/books.json");
const cacheDir = resolve(root, "apps/books/public/covers");
const manifestPath = resolve(root, "data/generated/cover-cache.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};

const limit = option("limit", Infinity);
const concurrency = option("concurrency", 6);
const refresh = flag("refresh");

const books = JSON.parse(await readFile(catalogPath, "utf8"));
const existing = new Map(await readManifest());
await mkdir(cacheDir, { recursive: true });

const queue = [];
for (const book of books) {
  if (!isCacheable(book.cover)) continue;
  if (!refresh && existing.has(book.cover.url) && await isStored(existing.get(book.cover.url).file)) continue;
  queue.push(book);
  if (queue.length >= limit) break;
}

console.log(`Обложек в каталоге: ${books.filter((book) => isCacheable(book.cover)).length}; к загрузке: ${queue.length}`);

const failures = [];
let stored = 0;
let bytes = 0;

await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, async () => {
  while (queue.length) {
    const book = queue.shift();
    try {
      const response = await fetch(requestUrl(book.cover.url), {
        headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8", "user-agent": "n-e-n.ru cover cache" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) throw new Error(`ответ не картинка: ${contentType || "тип не указан"}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length < 1024) throw new Error(`подозрительно маленький файл: ${body.length} байт`);
      const optimized = await sharp(body)
        .resize({ width: COVER_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      const file = cacheName(book.cover.url, "image/webp");
      await writeFile(resolve(cacheDir, file), optimized);
      existing.set(book.cover.url, { file, bytes: optimized.length, source: book.cover.sourceName ?? null, storedAt: new Date().toISOString().slice(0, 10) });
      stored += 1;
      bytes += optimized.length;
    } catch (error) {
      failures.push({ id: book.id, title: book.title, url: book.cover.url, reason: String(error.message ?? error) });
    }
  }
}));

await writeFile(manifestPath, `${JSON.stringify(Object.fromEntries([...existing].sort(([left], [right]) => left.localeCompare(right))), null, 2)}\n`, "utf8");

console.log(`Сохранено: ${stored} (${(bytes / 1048576).toFixed(1)} МБ). Всего в кеше: ${existing.size}.`);
if (failures.length) {
  console.log(`Не удалось скачать: ${failures.length}`);
  for (const failure of failures.slice(0, 15)) console.log(`  ${failure.reason} — ${failure.title}`);
  if (failures.length > 15) console.log(`  …и ещё ${failures.length - 15}`);
}

async function readManifest() {
  try {
    return Object.entries(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch {
    return [];
  }
}

async function isStored(file) {
  try {
    return (await stat(resolve(cacheDir, file))).size > 0;
  } catch {
    return false;
  }
}

// Подсказка на случай пустого каталога кеша при сборке.
if (!stored && !existing.size) {
  const files = await readdir(cacheDir).catch(() => []);
  if (!files.length) console.log("Кеш пуст: каталог соберётся со ссылками на сайты издательств.");
}
