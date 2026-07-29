import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatWatchV2Report,
  generateWatchV2Catalog,
  serializeWatchV2Catalog,
} from "./watch-v2-generator.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "data/source/watch-v2.json");
const targetPath = resolve(root, "data/generated/watch.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const { items, report } = generateWatchV2Catalog(source);

if (items.length < 1000) throw new Error(`Production-каталог должен содержать не менее 1000 произведений, получено ${items.length}`);
await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, serializeWatchV2Catalog(items), "utf8");
console.log(formatWatchV2Report(report));

export { generateWatchV2Catalog, validateWatchV2Catalog } from "./watch-v2-generator.mjs";
