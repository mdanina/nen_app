import fs from "node:fs/promises";

const sourcePath = "data/source/watch-v2.json";

const removals = new Map([
  ["Boy Eats Girl", "horror"],
  ["Hello Mary Lou: Prom Night II", "horror"],
  ["Городские легенды", "horror"],
  ["Поворот не туда", "horror"],
  ["Сестра оборотня", "horror"],
  ["Чёрное Рождество", "horror"],
  ["Отель «Нью-Хэмпшир»", "adult-sexual-content"],
  ["На самом дне", "adult-sexual-content"],
  ["Wish You Were Here", "adult-sexual-content"],
  ["The Rachel Papers", "adult-sexual-content"],
  ["Отель «Цветок страсти»", "adult-sexual-content"],
  ["Рай", "adult-sexual-content"],
  ["Losin' It", "adult-sexual-content"],
  ["Intern Academy", "adult-sexual-content"],
  ["The Long Weekend", "adult-sexual-content"],
  ["Daydream Nation", "adult-sexual-content"],
]);

const corrections = new Map([
  ["Повелитель мух", { sensitiveTopics: ["психологическое насилие", "гибель детей", "групповая жестокость"] }],
  ["Если…", { sensitiveTopics: ["авторитарное насилие", "вооружённое насилие", "гибель людей"] }],
  ["Кес", { sensitiveTopics: ["травля", "жестокость взрослых", "гибель животного"] }],
  ["The Year My Voice Broke", { sensitiveTopics: ["сексуальное взросление", "ревность", "утрата"] }],
  ["Posledice", { sensitiveTopics: ["насилие", "манипуляция", "жизнь в исправительном учреждении"] }],
  ["L’Animale", { sensitiveTopics: ["давление сверстников", "семейный кризис", "рискованное поведение"] }],
  ["Квадрофения", { sensitiveTopics: ["наркотики", "насилие", "рискованное поведение"] }],
  ["Looking for Alibrandi", { sensitiveTopics: ["депрессия", "самоубийство", "семейный конфликт"] }],
  ["Империя солнца", { sensitiveTopics: ["война", "разлука с родителями", "истощение", "гибель людей"] }],
  ["The White Death of the Black Wizard", { sensitiveTopics: ["расизм", "полицейское насилие", "гибель человека"] }],
  ["Calling Mr. Smith", { sensitiveTopics: ["война", "нацизм", "массовое насилие"] }],
  ["Нулевой размер", { sensitiveTopics: ["расстройство пищевого поведения", "давление на внешность"] }],
]);

const localizations = new Map([
  ["The Year My Voice Broke", "Год, когда у меня ломался голос"],
  ["Looking for Alibrandi", "Тинейджер года"],
]);

const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const removed = [];
const kept = [];

for (const item of catalog) {
  const reason = removals.get(item.title) ?? removals.get(item.originalTitle);
  if (reason) removed.push({ id: item.id, title: item.title, year: item.year, reason });
  else kept.push(item);
}

if (removed.length !== removals.size) {
  const found = new Set(removed.map((item) => item.title));
  const missing = [...removals.keys()].filter((title) => !found.has(title));
  throw new Error(`Не найдены записи для удаления: ${missing.join(", ")}`);
}

let corrected = 0;
let localized = 0;
for (const item of kept) {
  const correction = corrections.get(item.title) ?? corrections.get(item.originalTitle);
  if (correction) {
    Object.assign(item, correction);
    corrected += 1;
  }
  const russianTitle = localizations.get(item.originalTitle);
  if (russianTitle && item.titleLocalization === "original-only") {
    item.title = russianTitle;
    item.titleLocalization = "official-ru";
    localized += 1;
  }
}

const duplicateIds = kept.filter((item, index) => kept.findIndex((other) => other.id === item.id) !== index);
const duplicateSlugs = kept.filter((item, index) => kept.findIndex((other) => other.slug === item.slug) !== index);
if (duplicateIds.length || duplicateSlugs.length) throw new Error("После чистки обнаружены дубли id или slug");

await fs.writeFile(sourcePath, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: catalog.length, after: kept.length, removed, corrected, localized }, null, 2));
