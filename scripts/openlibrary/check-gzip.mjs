#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

const path = process.argv[2];
if (!path) throw new Error("Usage: node check-gzip.mjs <file.txt.gz>");

let uncompressedBytes = 0;
const stream = createReadStream(path).pipe(createGunzip());
stream.on("data", (chunk) => { uncompressedBytes += chunk.length; });
await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
console.log(JSON.stringify({ path, uncompressedBytes, valid: true }));
