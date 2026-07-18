import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateWatchV2Catalog, formatWatchV2Report } from "./watch-v2-generator.mjs";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(await readFile(resolve(root, "data/source/watch-v2.json"), "utf8"));
const { report } = generateWatchV2Catalog(source);
if (report.total !== 200) throw new Error(`Ожидалось 200 произведений, получено ${report.total}`);
console.log(formatWatchV2Report(report));
