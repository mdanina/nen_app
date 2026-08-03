#!/usr/bin/env node
import { resolve } from "node:path";
import { runEnrichment } from "./pipeline.mjs";

function argumentsOf(values) {
  const result = {};
  for (const argument of values) {
    if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--force") result.force = true;
    else if (argument === "--missing-cover-only") result.missingCoverOnly = true;
    else if (argument === "--no-build") result.build = false;
    else if (argument.startsWith("--limit=")) result.limit = Number(argument.slice(8));
    else if (argument.startsWith("--book-id=")) result.bookId = argument.slice(10);
    else if (argument.startsWith("--concurrency=")) result.concurrency = Number(argument.slice(14));
    else if (argument.startsWith("--match-level=")) result.matchLevel = Number(argument.slice(14));
    else if (argument.startsWith("--sources=")) result.sources = argument.slice(10).split(",").map((value) => value.trim()).filter(Boolean);
    else if (argument.startsWith("--publisher-keys=")) result.publisherKeys = argument.slice(17).split(",").map((value) => value.trim()).filter(Boolean);
    else throw new Error(`Неизвестный аргумент: ${argument}`);
  }
  if (result.limit !== undefined && (!Number.isInteger(result.limit) || result.limit <= 0)) throw new Error("--limit должен быть положительным целым числом");
  if (result.matchLevel !== undefined && (![1, 2, 3].includes(result.matchLevel))) throw new Error("--match-level должен быть равен 1, 2 или 3");
  return result;
}

const root = resolve(import.meta.dirname, "../../..");
try {
  const report = await runEnrichment({ root, ...argumentsOf(process.argv.slice(2)) });
  console.log(JSON.stringify(report.summary, null, 2));
  if (Object.keys(report.failureReasons).length) console.log("Причины без обновления:", JSON.stringify(report.failureReasons, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
