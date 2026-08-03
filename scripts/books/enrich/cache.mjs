import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TOOL_VERSION, stableKey } from "./core.mjs";

export class EnrichmentCache {
  constructor(root, ttlDays = 30) {
    this.path = resolve(root, "data/.cache/books-enrich/cache.json");
    this.ttlMs = ttlDays * 86_400_000;
    this.entries = {};
    this.dirty = false;
  }

  async load() {
    try { this.entries = JSON.parse(await readFile(this.path, "utf8")); } catch { this.entries = {}; }
  }

  key(source, book) { return stableKey(TOOL_VERSION, source, book.title, book.author); }

  get(source, book) {
    const entry = this.entries[this.key(source, book)];
    if (!entry || Date.now() - new Date(entry.cachedAt).getTime() > this.ttlMs) return undefined;
    return entry.value;
  }

  set(source, book, value) {
    this.entries[this.key(source, book)] = { cachedAt: new Date().toISOString(), value };
    this.dirty = true;
  }

  async save() {
    if (!this.dirty) return;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(this.entries, null, 2)}\n`, "utf8");
  }
}
