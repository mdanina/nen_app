#!/usr/bin/env node
import { runBnfImport } from "./pipeline.mjs";

function args(values) {
  const result = { output: "data/import/bnf/staging", maxBooks: 3000, workTarget: 4500, sparqlPageSize: 100, sruBatchSize: 40, seed: 20260722 };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[++index];
    if (key === "--output") result.output = value;
    else if (key === "--max-books") result.maxBooks = Number(value);
    else if (key === "--work-target") result.workTarget = Number(value);
    else if (key === "--sparql-page-size") result.sparqlPageSize = Number(value);
    else if (key === "--sru-batch-size") result.sruBatchSize = Number(value);
    else if (key === "--retrieved-at") result.retrievedAt = value;
    else if (key === "--seed") result.seed = Number(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!Number.isInteger(result.maxBooks) || result.maxBooks < 1 || result.maxBooks > 3000) throw new Error("--max-books must be between 1 and 3000");
  if (!Number.isInteger(result.workTarget) || result.workTarget < result.maxBooks) throw new Error("--work-target must be at least --max-books");
  return result;
}

const result = await runBnfImport(args(process.argv.slice(2)));
console.log(JSON.stringify(result.summary, null, 2));
