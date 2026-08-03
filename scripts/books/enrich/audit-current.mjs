#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { currentEditionStatus, legacyCurrentEditionStatus } from "./core.mjs";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function auditCurrentEditions(root = resolve(import.meta.dirname, "../../.."), now = new Date()) {
  const [catalog, metadataItems, coverItems, config] = await Promise.all([
    readJson(resolve(root, "data/generated/books.json"), []),
    readJson(resolve(root, "data/source/official-metadata-overrides.json"), []),
    readJson(resolve(root, "data/source/official-cover-overrides.json"), []),
    readJson(resolve(root, "data/source/books-enrichment-config.json"), { freshnessDays: 180 }),
  ]);
  const metadata = new Map(metadataItems.map((item) => [item.id, item]));
  const covers = new Map(coverItems.map((item) => [item.id, item]));
  const reasonCounts = {};
  const statusChanges = [];
  const current = [];
  const requiresEnrichment = [];

  for (const book of catalog) {
    const oldCurrent = legacyCurrentEditionStatus(book, metadata.get(book.id), covers.get(book.id), config.freshnessDays, now);
    const status = currentEditionStatus(book, metadata.get(book.id), covers.get(book.id), config.freshnessDays, now);
    const item = { id: book.id, title: book.title, author: book.author, reasons: status.reasons };
    if (status.current) current.push(item);
    else {
      requiresEnrichment.push(item);
      for (const reason of status.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
    if (oldCurrent !== status.current) statusChanges.push({ ...item, before: oldCurrent ? "already_current" : "requires_enrichment", after: status.current ? "already_current" : "requires_enrichment" });
  }

  const report = {
    generatedAt: now.toISOString(),
    mode: "local_status_audit_no_network",
    summary: {
      catalogSize: catalog.length,
      alreadyCurrent: current.length,
      requiresEnrichment: requiresEnrichment.length,
      statusChanged: statusChanges.length,
    },
    reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])),
    current,
    statusChanges,
  };
  await writeJsonAtomic(resolve(root, "data/reports/books-enrichment-readiness.json"), report);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const report = await auditCurrentEditions();
  console.log(JSON.stringify({ summary: report.summary, reasonCounts: report.reasonCounts }, null, 2));
}
