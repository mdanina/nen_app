#!/usr/bin/env node
import { runPipeline, DEFAULT_SEED } from "./pipeline.mjs";

function parseArguments(argv) {
  const result = { inputs: [], limit: 1000, seed: DEFAULT_SEED, fixture: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") result.inputs.push(argv[++index]);
    else if (argument === "--output") result.output = argv[++index];
    else if (argument === "--dump-date") result.dumpDate = argv[++index];
    else if (argument === "--limit") result.limit = Number(argv[++index]);
    else if (argument === "--seed") result.seed = Number(argv[++index]);
    else if (argument === "--fixture") result.fixture = true;
    else if (argument === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  console.log("node scripts/openlibrary/import-pilot.mjs --input <dump.txt|dump.txt.gz> [--input <...>] --output <directory> --dump-date YYYY-MM-DD [--limit 1000] [--seed 20260721]");
  process.exit(0);
}
if (!options.output) throw new Error("--output is required");
const result = await runPipeline(options);
console.log(JSON.stringify(result.qualitySummary, null, 2));

