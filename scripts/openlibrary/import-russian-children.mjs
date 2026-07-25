#!/usr/bin/env node
import { runRussianChildrenImport } from "./russian-children-import.mjs";

const options = { output: "data/import/openlibrary/russian-children-staging", seed: 20260722 };
for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const args = process.argv.slice(2);
  const key = args[index];
  const value = args[++index];
  if (key === "--output") options.output = value;
  else if (key === "--stage") options.stage = value;
  else if (key === "--seed") options.seed = Number(value);
  else if (key === "--retrieved-at") options.retrievedAt = value;
  else throw new Error(`Unknown argument: ${key}`);
}
const report = await runRussianChildrenImport(options);
console.log(JSON.stringify(report, null, 2));
