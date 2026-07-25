#!/usr/bin/env node
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { isChildSubject, normalizeLanguage } from "./pipeline.mjs";

const url = process.argv[2];
const limit = Number(process.argv[3] ?? 100000);
if (!url) throw new Error("Usage: node probe-book-dump.mjs <url> [line-limit]");
const array = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const ref = (value) => typeof value === "string" ? value : value?.key;

const controller = new AbortController();
const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "NEN-Books-Import/0.1 (staging research)" } });
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} ${response.statusText}`);
const source = Readable.fromWeb(response.body);
const gunzip = createGunzip();
source.pipe(gunzip);
const reader = createInterface({ input: gunzip, crlfDelay: Infinity });
const counts = { lines: 0, parsed: 0, withTitle: 0, withAuthor: 0, withWork: 0, withLanguage: 0, russian: 0, child: 0, russianAndChild: 0 };
const languageCounts = new Map();
try {
  for await (const line of reader) {
    counts.lines += 1;
    try {
      const value = JSON.parse(line.split("\t").slice(4).join("\t"));
      counts.parsed += 1;
      const title = typeof value.title === "string" && value.title.trim();
      const authors = array(value.authors).map((entry) => ref(entry?.author ?? entry)).filter(Boolean);
      const works = array(value.works).map(ref).filter(Boolean);
      const languages = array(value.languages).map(normalizeLanguage);
      const subjects = array(value.subjects).filter((entry) => typeof entry === "string");
      const russian = languages.includes("ru");
      const child = subjects.some(isChildSubject);
      if (title) counts.withTitle += 1;
      if (authors.length) counts.withAuthor += 1;
      if (works.length) counts.withWork += 1;
      if (languages.filter(Boolean).length) counts.withLanguage += 1;
      for (const language of languages.filter(Boolean)) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
      if (russian) counts.russian += 1;
      if (child) counts.child += 1;
      if (russian && child) counts.russianAndChild += 1;
    } catch {}
    if (counts.lines >= limit) break;
  }
} finally {
  reader.close();
  controller.abort();
  source.destroy();
  gunzip.destroy();
}
console.log(JSON.stringify({ url: response.url, ...counts, languages: Object.fromEntries([...languageCounts].sort((a, b) => b[1] - a[1]).slice(0, 20)) }, null, 2));
