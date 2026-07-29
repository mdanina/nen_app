import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "data/source/watch-v2.json");
const reportPath = path.join(root, "data/reports/watch-frame-enrichment.json");
const tagBase = "https://n-e-n.ru/tag/9/%D0%BA%D0%B8%D0%BD%D0%BE+%D0%B8+%D0%BC%D1%83%D0%BB%D1%8C%D1%82%D1%84%D0%B8%D0%BB%D1%8C%D0%BC%D1%8B";

const decode = (value) => value
  .replaceAll("&nbsp;", " ")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&laquo;", "«")
  .replaceAll("&raquo;", "»");

const normalize = (value) => decode(value)
  .normalize("NFKD")
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "NEN watch catalog editorial importer/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function pooled(items, limit, task) {
  const output = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        output[index] = await task(items[index]);
      } catch (error) {
        output[index] = { error: String(error), url: items[index] };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}

function articleLinks(html) {
  const links = [...html.matchAll(/href="((?:https:\/\/n-e-n\.ru)?\/[^"#?]+\/)"/gu)]
    .map((match) => new URL(decode(match[1]), "https://n-e-n.ru").href);
  return links.filter((url) => {
    const pathName = new URL(url).pathname.split("/").filter(Boolean);
    return pathName.length === 1 && !["about", "contacts", "collaboration", "confidentiality"].includes(pathName[0]);
  });
}

function frames(html, articleUrl) {
  const found = [];
  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const captionMatch = tag.match(/\balt="([^"]*Кадр из[^"]*)"/iu);
    const urlMatch = tag.match(/\b(?:data-src|src)="(https?:\/\/[^"]+)"/iu);
    if (!captionMatch || !urlMatch) continue;
    const url = decode(urlMatch[1]);
    const caption = decode(captionMatch[1]).replace(/\s+/gu, " ").trim();
    const titleMatch = caption.match(/[«"]([^»"]+)[»"]/u);
    const studiosMatch = caption.match(/Студи(?:я|и|и производства|я производства)\s*:\s*(.+)$/iu);
    if (!titleMatch || !studiosMatch || !/^https?:\/\//u.test(url)) continue;
    const studios = studiosMatch[1].split(/\s*[|,]\s*/u).map((value) => value.trim()).filter(Boolean);
    if (!studios.length) continue;
    found.push({ title: titleMatch[1].trim(), url, studios, caption, articleUrl });
  }
  return found;
}

const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const tagUrls = Array.from({ length: 40 }, (_, index) => index === 0 ? `${tagBase}/` : `${tagBase}/page/${index + 1}/`);
const tagPages = await pooled(tagUrls, 5, async (url) => ({ url, html: await fetchText(url) }));
const articles = [...new Set(tagPages.flatMap((page) => page.html ? articleLinks(page.html) : []))];
const articlePages = await pooled(articles, 8, async (url) => ({ url, html: await fetchText(url) }));
const candidates = articlePages.flatMap((page) => page.html ? frames(page.html, page.url) : []);

const byTitle = new Map();
for (const candidate of candidates) {
  const key = normalize(candidate.title);
  if (!byTitle.has(key)) byTitle.set(key, candidate);
}

const matched = [];
for (const item of catalog) {
  if (item.frame) continue;
  const candidate = byTitle.get(normalize(item.title)) ?? (item.originalTitle ? byTitle.get(normalize(item.originalTitle)) : undefined);
  if (!candidate) continue;
  item.frame = { url: candidate.url, studios: candidate.studios };
  matched.push({ id: item.id, slug: item.slug, title: item.title, ...candidate });
}

const report = {
  generatedAt: new Date().toISOString(),
  source: "Публичные материалы n-e-n.ru с редакционными подписями «Кадр из…»",
  tagPagesChecked: tagPages.filter((page) => page.html).length,
  articlesChecked: articlePages.filter((page) => page.html).length,
  frameCandidates: candidates.length,
  matchedCards: catalog.filter((item) => item.frame).length,
  newlyMatchedCards: matched.length,
  placeholdersRemaining: catalog.filter((item) => !item.frame).length,
  matches: matched,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(sourcePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ matchedCards: report.matchedCards, newlyMatchedCards: report.newlyMatchedCards, placeholdersRemaining: report.placeholdersRemaining, articlesChecked: report.articlesChecked }, null, 2));
