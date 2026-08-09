import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sourcePath = "data/source/watch-v2.json";
const reportPath = "data/reports/watch-localization.json";
const cachePath = path.join(os.tmpdir(), "nen-watch-localization-wikidata.json");

const hasCyrillic = (value) => /[А-ЯЁа-яё]/u.test(value ?? "");
const hasLatin = (value) => /[A-Za-z]{3}/u.test(value ?? "");
const unique = (values) => [...new Set(values.filter(Boolean))];
const qidFromId = (id) => id.match(/^nen-wd-(q\d+)$/iu)?.[1]?.toUpperCase();

const languageByCountry = new Map([
  ["Испания", "es"], ["Франция", "fr"], ["Германия", "de"], ["Италия", "it"],
  ["Великобритания", "en"], ["США", "en"], ["Канада", "en"], ["Австралия", "en"],
  ["Новая Зеландия", "en"], ["Ирландия", "en"], ["Япония", "ja"],
  ["Республика Корея", "ko"], ["Польша", "pl"], ["Чехия", "cs"], ["Швеция", "sv"],
  ["Норвегия", "no"], ["Дания", "da"], ["Финляндия", "fi"], ["Нидерланды", "nl"],
  ["Мексика", "es"], ["Аргентина", "es"], ["Бразилия", "pt"], ["Индия", "hi"],
  ["Иран", "fa"], ["Россия", "ru"], ["СССР", "ru"], ["Австрия", "de"],
  ["Бельгия", "fr"], ["Швейцария", "de"], ["Китай", "zh"],
]);

const kindLabels = {
  movie: "Художественный фильм",
  "animated-feature": "Полнометражный мультфильм",
  "animated-short": "Короткометражный мультфильм",
  "animated-series": "Мультсериал",
  series: "Сериал",
  documentary: "Документальный фильм",
  "short-film": "Короткометражный фильм",
};

const durationLabel = (item) => "minutes" in item.duration
  ? `${item.duration.minutes} минут`
  : `${item.duration.episodeMinutes}${item.duration.episodeMinutesMax ? `–${item.duration.episodeMinutesMax}` : ""} минут на серию`;

async function fetchJson(url, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "NENWatchLocalization/1.0", accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 20_000));
        throw new Error(`Wikidata API: ${response.status}`);
      }
      if (!response.ok) throw new Error(`Wikidata API: ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function loadEntities(ids) {
  const cache = await fs.readFile(cachePath, "utf8").then(JSON.parse).catch(() => ({}));
  const pending = ids.filter((id) => !cache[id]);
  const languages = unique([...languageByCountry.values(), "ru", "en"]).join("|");
  for (let index = 0; index < pending.length; index += 25) {
    const batch = pending.slice(index, index + 25);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases|sitelinks&sitefilter=ruwiki&languages=${languages}&languagefallback=0&ids=${batch.join("|")}`;
    Object.assign(cache, (await fetchJson(url)).entities);
    await fs.writeFile(cachePath, JSON.stringify(cache), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return cache;
}

const cleanRussianTitle = (value) => String(value ?? "")
  .replace(/\s+\((?:фильм|мультфильм|телесериал|сериал|аниме)(?:,\s*\d{4})?\)$/iu, "")
  .trim();

function russianCandidate(entity) {
  const candidates = [
    entity?.labels?.ru?.value,
    entity?.sitelinks?.ruwiki?.title,
    ...(entity?.aliases?.ru ?? []).map((alias) => alias.value),
  ].map(cleanRussianTitle);
  return candidates.find(hasCyrillic);
}

function originalCandidate(item, entity) {
  if (item.originalTitle) return item.originalTitle.trim();
  const language = item.country.map((country) => languageByCountry.get(country)).find(Boolean);
  return entity?.labels?.[language]?.value?.trim()
    || entity?.labels?.en?.value?.trim()
    || item.title.trim();
}

function localizedDescription(item) {
  const countries = item.country.join(", ");
  const genres = item.genres.join(", ");
  const themes = item.themes.slice(0, 4).join(", ");
  return `${kindLabels[item.kind]} ${item.year} года, страна производства: ${countries}. Продолжительность — ${durationLabel(item)}; жанры: ${genres}. В центре внимания — ${themes}.`;
}

function localizedRecommendation(item) {
  const themes = item.themes.slice(0, 3).join("», «");
  return `Произведение подходит для совместного просмотра и содержательного разговора о темах «${themes}». Детали сюжета и поступки персонажей помогают сравнить разные точки зрения без готовых ответов.`;
}

function localizedDiscussion(item) {
  const [firstTheme, secondTheme = "выбор"] = item.themes;
  return [
    `Как тема «${firstTheme}» раскрывается через поступки персонажей и какой эпизод показывает это точнее всего?`,
    `Как связаны темы «${firstTheme}» и «${secondTheme}» и что изменилось бы при другом решении героев?`,
  ];
}

function localizedRationale(item) {
  return `Рекомендуем с ${item.nenAgeRecommendation.minAge} лет: продолжительность ${durationLabel(item)}, особенности жанра и темы «${item.themes.slice(0, 2).join("», «")}» требуют соответствующего внимания и эмоциональной готовности.`;
}

const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const ids = unique(catalog.map((item) => qidFromId(item.id)));
const entities = await loadEntities(ids);
let officialRussianAdded = 0;
let originalOnly = 0;
let descriptionsLocalized = 0;

for (const item of catalog) {
  const entity = entities[qidFromId(item.id)];
  const original = originalCandidate(item, entity);
  const russian = hasCyrillic(item.title) ? item.title.trim() : russianCandidate(entity);
  item.originalTitle = original;
  if (russian) {
    if (!hasCyrillic(item.title)) officialRussianAdded += 1;
    item.title = russian;
    item.titleLocalization = "official-ru";
  } else {
    item.title = original;
    item.titleLocalization = "original-only";
    originalOnly += 1;
  }

  if (item.id.startsWith("nen-wd-") && hasLatin(item.shortDescription)) {
    item.shortDescription = localizedDescription(item);
    descriptionsLocalized += 1;
  }
  if (item.id.startsWith("nen-wd-") && hasLatin(item.whyRecommended)) item.whyRecommended = localizedRecommendation(item);
  if (item.id.startsWith("nen-wd-") && item.discussionTopics.some(hasLatin)) item.discussionTopics = localizedDiscussion(item);
  if (item.id.startsWith("nen-wd-") && hasLatin(item.nenAgeRecommendation.rationale)) {
    item.nenAgeRecommendation.rationale = localizedRationale(item);
  }
}

const collisions = [];
const seen = new Map();
for (const item of catalog) {
  const key = `${item.title.toLocaleLowerCase("ru")}|${item.year}`;
  const previous = seen.get(key);
  if (previous && previous.id !== item.id) {
    if (item.titleLocalization === "official-ru" && item.originalTitle !== item.title) {
      collisions.push({ title: item.title, year: item.year, kept: previous.id, reverted: item.id });
      item.title = item.originalTitle;
      item.titleLocalization = "original-only";
      officialRussianAdded -= 1;
      originalOnly += 1;
    } else {
      collisions.push({ title: item.title, year: item.year, kept: previous.id, duplicate: item.id });
    }
  } else {
    seen.set(key, item);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  total: catalog.length,
  officialRussianTitles: catalog.filter((item) => item.titleLocalization === "official-ru").length,
  officialRussianAdded,
  originalOnly: catalog.filter((item) => item.titleLocalization === "original-only").length,
  descriptionsLocalized,
  collisions,
  originalOnlyTitles: catalog
    .filter((item) => item.titleLocalization === "original-only")
    .map((item) => ({ id: item.id, title: item.title, year: item.year })),
};

await fs.writeFile(sourcePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
