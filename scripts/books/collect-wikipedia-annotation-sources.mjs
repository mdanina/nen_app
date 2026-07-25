import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const books = JSON.parse(await readFile(resolve(root, "data/generated/books.json"), "utf8"))
  .filter((book) => !book.shortDescription);
const output = resolve(root, "data/import/annotation-enrichment/wikipedia.json");

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

async function summary(title) {
  const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll("/", " "))}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "NEN-books-annotation-enrichment/1.0 (contact: https://nen.ru)",
      accept: "application/json",
    },
  });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    return null;
  }
  if (!response.ok) throw new Error(`Wikipedia REST API ${response.status}`);
  return response.json();
}

async function search(title, author) {
  const url = new URL("https://api.wikimedia.org/core/v1/wikipedia/ru/search/page");
  url.searchParams.set("q", `${title} ${author}`);
  url.searchParams.set("limit", "5");
  const response = await fetch(url, {
    headers: {
      "user-agent": "NEN-books-annotation-enrichment/1.0 (contact: https://nen.ru)",
      accept: "application/json",
    },
  });
  if (response.status === 403 || response.status === 429) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    return [];
  }
  if (!response.ok) return [];
  return (await response.json()).pages ?? [];
}

await mkdir(dirname(output), { recursive: true });
let results = [];
try {
  results = JSON.parse(await readFile(output, "utf8")).results ?? [];
} catch {
  results = [];
}
const resultById = new Map(results.map((item) => [item.id, item]));
for (let index = 0; index < books.length; index += 1) {
  const book = books[index];
  if (resultById.get(book.id)?.match) continue;
  const authorSurname = normalize(book.author).split(" ").filter((token) => token.length > 2).at(-1) ?? "";
  let page = await summary(book.title);
  let pageUrl = page?.content_urls?.desktop?.page;
  const exactAuthor = page && authorSurname && normalize(page.extract).includes(authorSurname);
  if (!exactAuthor) {
    const candidates = await search(book.title, book.author);
    const candidate = candidates.find((item) => {
      if (overlap(book.title, item.title) < 0.75) return false;
      if (/\((?:фильм|мультфильм|мультсериал|телесериал)\)/iu.test(item.title)) return false;
      return normalize(`${item.excerpt ?? ""} ${item.description ?? ""}`).includes(authorSurname);
    });
    if (candidate) {
      page = await summary(candidate.key);
      pageUrl = page?.content_urls?.desktop?.page;
    }
  }
  let match = null;
  if (page) {
    const extract = String(page.extract ?? "").trim();
    const authorConfirmed = authorSurname && normalize(extract).includes(authorSurname);
    const titleConfirmed = overlap(book.title, page.title) >= 0.8;
    const distinctiveTitle = tokens(book.title).size >= 3;
    if (extract && titleConfirmed && (authorConfirmed || distinctiveTitle)) {
      match = {
        pageTitle: page.title,
        url: pageUrl,
        extract,
        authorConfirmed,
        titleConfirmed,
        license: "CC BY-SA 4.0",
      };
    }
  }
  resultById.set(book.id, { id: book.id, title: book.title, author: book.author, match });
  results = books.map((item) => resultById.get(item.id)).filter(Boolean);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  if (results.length % 10 === 0) {
    await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
  }
  if (results.length % 25 === 0) console.log(`${results.length}/${books.length}`);
}

await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ processed: results.length, matched: results.filter((item) => item.match).length }, null, 2));
