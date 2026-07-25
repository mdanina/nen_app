#!/usr/bin/env node
import { runImportPipeline } from "../../packages/import-core/src/index.mjs";
import { OpenLibraryAdapter } from "./universal-adapter.mjs";

function argumentsFrom(argv) {
  const options = { inputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.inputs.push(argv[++index]);
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--retrieved-at") options.retrievedAt = argv[++index];
    else if (argument === "--batch-id") options.batchId = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const options = argumentsFrom(process.argv.slice(2));
if (options.help) {
  console.log("node scripts/openlibrary/import-universal.mjs --input <dump-fragment> [--input <...>] --output <staging-directory> --retrieved-at <ISO timestamp> --batch-id <id>");
  process.exit(0);
}
if (!options.output || !options.batchId) throw new Error("--output and --batch-id are required");
const result = await runImportPipeline({ adapter: OpenLibraryAdapter, ...options });
console.log(JSON.stringify({
  authors: result.authors.length,
  works: result.works.length,
  editions: result.editions.length,
  candidates: result.candidates.length,
  validationIssues: result.validation.issues.length,
  readErrors: result.readErrors.length,
}, null, 2));

