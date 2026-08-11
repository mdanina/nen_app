// Локальное превью сервиса в обрамлении боевого сайта.
//
// На проде шапку и подвал рисует Yii (раскладка new_nen), и меню там приходит
// из базы. Здесь мы один раз забираем свёрстанную страницу n-e-n.ru, вырезаем
// из неё шапку, подвал и стили и подставляем внутрь наш контейнер. Это только
// для просмотра: в сборку обрамление не попадает.
//
//   node scripts/books/preview-in-site.mjs            # http://localhost:5199/knigi/
//   node scripts/books/preview-in-site.mjs --port 5300

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "apps/books/dist");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const port = Number(option("port", 5199));
const base = `/${option("base", "knigi").replace(/^\/+|\/+$/gu, "")}`;
const site = option("site", "https://n-e-n.ru").replace(/\/$/u, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const section = (html, tag) => html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "iu"))?.[0] ?? "";

// Ссылки на сайте относительные — уводим их на боевой домен, иначе картинки
// и шрифты обрамления не подтянутся.
const absolutize = (html) => html
  .replace(/(src|href|xlink:href)="\/(?!\/)/gu, `$1="${site}/`)
  .replace(/url\(\/(?!\/)/gu, `url(${site}/`);

async function buildShell() {
  // Заголовок только из ASCII: undici не пропускает кириллицу в user-agent.
  const response = await fetch(`${site}/`, { headers: { "user-agent": "Mozilla/5.0 (n-e-n.ru books preview)" } });
  if (!response.ok) throw new Error(`не удалось забрать ${site}: HTTP ${response.status}`);
  const page = await response.text();

  const styles = [...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/giu)].map((match) => absolutize(match[0])).join("\n    ");
  const header = absolutize(section(page, "header"));
  const footer = absolutize(section(page, "footer"));
  if (!header || !footer) throw new Error("на странице сайта не нашлись шапка и подвал");

  const app = await readFile(join(dist, "index.html"), "utf8");
  const ours = [...app.matchAll(/<(?:script|link)[^>]*(?:src|href)="[^"]*\/assets\/[^"]*"[^>]*>(?:<\/script>)?/giu)].map((match) => match[0]).join("\n    ");

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Что почитать с детьми — НЭН (превью в вёрстке сайта)</title>
    ${styles}
    ${ours}
  </head>
  <body>
    ${header}
    <main><div id="root"></div></main>
    ${footer}
  </body>
</html>
`;
}

const shell = await buildShell();

createServer(async (request, response) => {
  const path = decodeURIComponent(request.url.split("?")[0]);
  const relative = path.startsWith(base) ? path.slice(base.length) || "/" : path;
  const file = join(dist, relative);
  const extension = extname(relative);

  if (extension && extension !== ".html") {
    try {
      if ((await stat(file)).isFile()) {
        response.writeHead(200, { "content-type": TYPES[extension] ?? "application/octet-stream" });
        response.end(await readFile(file));
        return;
      }
    } catch { /* отдадим оболочку ниже */ }
  }

  // Любой маршрут раздела показывает оболочку сайта: разберётся приложение.
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(shell);
}).listen(port, "127.0.0.1", () => {
  console.log(`Превью в вёрстке сайта: http://localhost:${port}${base}/`);
  console.log(`Обрамление взято с ${site} — на проде его рисует Yii, меню приходит из базы.`);
});
