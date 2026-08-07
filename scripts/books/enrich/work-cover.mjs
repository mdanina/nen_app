import { resolve } from "node:path";
import { runWorkCoverEnrichment } from "./work-cover-pipeline.mjs";

const options = {};
for (const argument of process.argv.slice(2)) {
  if (argument === "--dry-run") options.dryRun = true;
  else if (argument.startsWith("--limit=")) options.limit = Number(argument.slice(8));
  else if (argument.startsWith("--concurrency=")) options.concurrency = Number(argument.slice(14));
  else throw new Error(`Неизвестный аргумент: ${argument}`);
}

const report = await runWorkCoverEnrichment({ root: resolve(import.meta.dirname, "../../.."), ...options });
console.log(JSON.stringify(report.summary, null, 2));
console.log(JSON.stringify(report.remainingReasons, null, 2));
