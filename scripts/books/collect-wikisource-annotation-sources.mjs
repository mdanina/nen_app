import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const books = JSON.parse(await readFile(resolve(root, "data/generated/books.json"), "utf8"))
  .filter((book) => !book.shortDescription);
const output = resolve(root, "data/import/annotation-enrichment/wikisource.json");

const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("ru")
  .replace(/ё/gu, "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();
const tokens = (value) => new Set(normalize(value).split(" ").filter((token) => token.length > 2));
const overlap = (left, right) => {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / Math.max(1, leftTokens.size);
};
const decode = (value) => value
  .replace(/<script[\s\S]*?<\/script>/giu, " ")
  .replace(/<style[\s\S]*?<\/style>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/gu, " ")
  .replace(/&quot;/gu, "\"")
  .replace(/&laquo;/gu, "«")
  .replace(/&raquo;/gu, "»")
  .replace(/&amp;/gu, "&")
  .replace(/&#39;|&apos;/gu, "'")
  .replace(/\s+/gu, " ")
  .trim();

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "NEN-books-annotation-enrichment/1.0 (contact: https://nen.ru)", accept: "application/json" },
  });
  if (response.status === 403 || response.status === 429) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    return null;
  }
  if (!response.ok) return null;
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "NEN-books-annotation-enrichment/1.0 (contact: https://nen.ru)", accept: "text/html" },
  });
  if (!response.ok) return "";
  return response.text();
}

await mkdir(dirname(output), { recursive: true });
const results = [];
for (let index = 0; index < books.length; index += 1) {
  const book = books[index];
  const authorSurname = normalize(book.author).split(" ").filter((token) => token.length > 2).at(-1) ?? "";
  const searchUrl = new URL("https://api.wikimedia.org/core/v1/wikisource/ru/search/page");
  searchUrl.searchParams.set("q", `${book.title} ${book.author}`);
  searchUrl.searchParams.set("limit", "5");
  const data = await getJson(searchUrl);
  const candidate = (data?.pages ?? []).find((item) => {
    if (item.title.includes("/Версия")) return false;
    if (overlap(book.title, item.title) < 0.65) return false;
    const combined = normalize(`${item.title} ${item.description ?? ""}`);
    if (combined.includes(authorSurname)) return true;
    const parenthetical = item.title.match(/\(([^)]+)\)/u)?.[1];
    if (parenthetical && !normalize(parenthetical).includes(authorSurname)) return false;
    return overlap(book.title, item.title) >= 0.9 && tokens(book.title).size >= 2;
  });
  let match = null;
  if (candidate) {
    const htmlUrl = `https://api.wikimedia.org/core/v1/wikisource/ru/page/${encodeURIComponent(candidate.key)}/html`;
    const html = await getText(htmlUrl);
    const sourceText = decode(html).slice(0, 8000);
    if (sourceText) {
      match = {
        pageTitle: candidate.title,
        url: `https://ru.wikisource.org/wiki/${encodeURIComponent(candidate.key)}`,
        description: candidate.description ?? null,
        excerpt: decode(candidate.excerpt ?? ""),
        sourceText,
        license: "Public-domain text or CC BY-SA page metadata; verify the page rights notice before verbatim reuse.",
      };
    }
  }
  results.push({ id: book.id, title: book.title, author: book.author, match });
  if ((index + 1) % 10 === 0) {
    await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
  }
  if ((index + 1) % 25 === 0) console.log(`${index + 1}/${books.length}`);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
}
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ processed: results.length, matched: results.filter((item) => item.match).length }, null, 2));
