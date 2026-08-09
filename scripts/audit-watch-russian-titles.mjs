import fs from "node:fs/promises";

const sourcePath = "data/source/watch-v2.json";
const outputPath = "data/reports/watch-localization-stage-2.json";

const confirmed = new Map(Object.entries({
  "nen-668": {
    title: "З-О-М-Б-И",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/1068115/" },
    ],
    note: "Карточка фиксирует российскую премьеру и русский дубляж.",
  },
  "nen-669": {
    title: "З-О-М-Б-И 2",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/1273167/" },
    ],
    note: "Карточка фиксирует цифровой релиз Walt Disney Company CIS.",
  },
  "nen-670": {
    title: "З-О-М-Б-И 3",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/4522598/" },
      { name: "Okko", url: "https://blog.okko.tv/selections/luchshie-filmi-i-serialy-pro-zombi-2022-goda-ot-frantsuzskoj-komedii-do-disneevskogo-myuzikla" },
    ],
  },
  "nen-wd-q3519757": {
    title: "Изумительный мистер Бланден",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/93166/" },
      { name: "Афиша", url: "https://www.afisha.ru/movie/izumitelniy-mister-blanden-188072/" },
    ],
    alternatives: ["Удивительный мистер Бланден"],
  },
  "nen-wd-q1753929": {
    title: "Жаркое лето",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/15068/" },
      { name: "Афиша", url: "https://www.afisha.ru/movie/zharkoe-leto-198234/" },
      { name: "Бюллетень кинопрокатчика", url: "https://www.kinobusiness.com/movies/zharkoe-leto/" },
    ],
  },
  "nen-wd-q103791249": {
    title: "Рождественское желание Ангелы",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/1447236/" },
      { name: "JustWatch", url: "https://www.justwatch.com/ru/фильм/angelas-christmas-wish" },
    ],
    alternatives: ["Рождественское желание Анджелы"],
    note: "Основной вариант выбран по российскому кинокаталогу.",
  },
  "nen-wd-q2546045": {
    title: "Заботливые мишки",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/27129/" },
      { name: "Русскоязычный каталог франшизы", url: "https://ru.wikifur.com/wiki/Care_Bears" },
    ],
  },
  "nen-wd-q15270669": {
    title: "Кентервильское привидение",
    basis: "official-russian-release",
    sources: [
      { name: "Бюллетень кинопрокатчика", url: "https://www.kinometro.ru/release/card/id/48076" },
      { name: "Бюллетень кинопрокатчика — карточка фильма", url: "https://www.kinobusiness.com/movies/kentervilskoe-prividenie23/" },
      { name: "Афиша", url: "https://www.afisha.ru/movie/kentervilskoe-prividenie-273683/" },
    ],
    alternatives: ["Призрак Кентервиля"],
    note: "Российский прокат TenLetters, 7 декабря 2023 года.",
  },
  "nen-wd-q57803374": {
    title: "Вояджер: Дальше планет",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/1016418/" },
      { name: "Афиша", url: "https://www.afisha.ru/movie/voyadzher-dalshe-planet-232603/" },
    ],
  },
  "nen-wd-q1604316": {
    title: "Миссия Одиссея",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/series/1006562/" },
      { name: "Кинопоиск — каталог сериалов", url: "https://www.kinopoisk.ru/lists/movies/genre--animation/country--3/?b=series" },
    ],
    note: "Название устойчиво используется в российском каталоге сериала.",
  },
  "nen-wd-q2011263": {
    title: "Паника в деревне",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/464296/" },
      { name: "Афиша", url: "https://www.afisha.ru/movie/panika-v-derevne-197026/" },
    ],
  },
  "nen-wd-q522518": {
    title: "Франклин и сокровища Озера Черепахи",
    basis: "editorially-confirmed",
    sources: [
      { name: "Кинопоиск", url: "https://www.kinopoisk.ru/film/274956/" },
    ],
    note: "Название соответствует русской карточке известной детской франшизы.",
  },
}));

const requiresManualReview = [
  "Riverdance: The Animated Adventure",
  "The Care Bears Adventure in Wonderland",
  "Care Bears Nutcracker Suite",
  "The Little Bear Movie",
  "Santa Claus: The Movie",
  "Mickey Mouse and the Roadster Racers",
  "72 Dangerous Places to Live",
  "Brave Bunnies",
  "Pink Floyd: Live at Pompeii",
];

const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const pendingBefore = catalog.filter(
  (item) => item.titleLocalization === "original-only" || confirmed.has(item.id),
);
const changed = [];

for (const item of catalog) {
  const decision = confirmed.get(item.id);
  if (!decision) continue;
  const previousTitle = item.originalTitle;
  if (item.titleLocalization === "original-only") {
    item.title = decision.title;
    item.titleLocalization = "official-ru";
  }
  if (item.title !== decision.title) {
    throw new Error(`${item.id}: текущее название расходится с редакционным решением`);
  }
  changed.push({
    id: item.id,
    previousTitle,
    originalTitle: item.originalTitle,
    title: item.title,
    year: item.year,
    ...decision,
  });
}

const duplicateKeys = [];
const seen = new Map();
for (const item of catalog) {
  const key = `${item.title.toLocaleLowerCase("ru")}|${item.year}`;
  if (seen.has(key)) duplicateKeys.push({ key, ids: [seen.get(key), item.id] });
  else seen.set(key, item.id);
}
if (duplicateKeys.length) {
  throw new Error(`Локализация создала дубли: ${JSON.stringify(duplicateKeys)}`);
}

const remaining = catalog.filter((item) => item.titleLocalization === "original-only");
const manualReviewItems = remaining
  .filter((item) => requiresManualReview.includes(item.originalTitle))
  .map((item) => ({ id: item.id, originalTitle: item.originalTitle, year: item.year }));

const report = {
  generatedAt: new Date().toISOString(),
  strategy: "priority-rightsholders-and-well-known-titles",
  pendingBefore: pendingBefore.length,
  reviewed: changed.length + manualReviewItems.length,
  localized: changed.length,
  officialRussianRelease: changed.filter((item) => item.basis === "official-russian-release").length,
  editoriallyConfirmed: changed.filter((item) => item.basis === "editorially-confirmed").length,
  remainingOriginalOnly: remaining.length,
  changed,
  requiresManualReview: manualReviewItems,
  skippedRareTitles: remaining.length - manualReviewItems.length,
  duplicateKeys,
};

await fs.writeFile(sourcePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
