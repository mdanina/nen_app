#!/usr/bin/env node
import { runMassImport } from "./mass-import.mjs";

function parse(argv) {
  const options = { inputs: [], batchSize: 5000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.inputs.push(argv[++index]);
    else if (argument === "--database") options.databasePath = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--dump-date") options.dumpDate = argv[++index];
    else if (argument === "--retrieved-at") options.retrievedAt = argv[++index];
    else if (argument === "--batch-id") options.batchId = argv[++index];
    else if (argument === "--batch-size") options.batchSize = Number(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const options = parse(process.argv.slice(2));
if (options.help) {
  console.log("node scripts/openlibrary/import-large.mjs --input <authors.txt.gz> --input <works.txt.gz> --input <editions.txt.gz> --database <state.sqlite> --output <staging-dir> --dump-date YYYY-MM-DD --retrieved-at <ISO> --batch-id <id>");
  process.exit(0);
}
for (const required of ["databasePath", "output", "dumpDate", "retrievedAt", "batchId"]) if (!options[required]) throw new Error(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLocaleLowerCase("en")}`)} is required`);
const report = await runMassImport(options);
console.log(JSON.stringify(report, null, 2));

