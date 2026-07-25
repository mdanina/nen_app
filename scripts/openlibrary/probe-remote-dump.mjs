#!/usr/bin/env node
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const url = process.argv[2];
const limit = Number(process.argv[3] ?? 1000);
if (!url) throw new Error("Usage: node probe-remote-dump.mjs <url> [line-limit]");

const controller = new AbortController();
const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "NEN-Books-Import/0.1 (staging research)" } });
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} ${response.statusText}`);
const source = Readable.fromWeb(response.body);
const gunzip = createGunzip();
source.pipe(gunzip);
const reader = createInterface({ input: gunzip, crlfDelay: Infinity });
const types = new Map();
const transitions = [];
let previousType = null;
let lines = 0;
try {
  for await (const line of reader) {
    lines += 1;
    const type = line.split("\t", 1)[0] || "unknown";
    types.set(type, (types.get(type) ?? 0) + 1);
    if (type !== previousType) transitions.push({ line: lines, type });
    previousType = type;
    if (lines >= limit) break;
  }
} finally {
  reader.close();
  controller.abort();
  source.destroy();
  gunzip.destroy();
}
console.log(JSON.stringify({ url: response.url, lines, types: Object.fromEntries(types), transitions: transitions.slice(0, 100) }, null, 2));
