import type { CatalogItem, CatalogQuery, FormatFilter, Situation } from "../types";

export const typeLabels: Record<CatalogItem["contentType"], string> = {
  "fairy-tale": "Сказка",
  book: "Книга",
  cartoon: "Мультфильм",
  movie: "Фильм",
};

export const formatLabels: Record<FormatFilter, string> = {
  all: "Всё",
  reading: "Книги и сказки",
  cartoon: "Мультфильмы",
  movie: "Фильмы",
};

export const situationLabels: Record<Situation, string> = {
  bedtime: "Перед сном",
  family: "Всей семьёй",
  independent: "Самостоятельно",
};

export const emptyQuery: CatalogQuery = {
  age: null,
  format: "all",
  interests: [],
  moods: [],
  situation: null,
  duration: null,
  search: "",
};

export function normalize(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function matchesSearch(item: CatalogItem, search: string): boolean {
  const needle = normalize(search);
  if (!needle) return true;
  const directMatch = [item.title, item.originalTitle, item.creator, item.studioOrPublisher, ...item.genres, ...item.interests, ...item.moods]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalize(value).includes(needle));
  if (directMatch) return true;

  const intents: boolean[] = [];
  if (/почитать|читать|чтение|книг|сказк/.test(needle)) intents.push(item.contentType === "book" || item.contentType === "fairy-tale");
  if (/посмотреть|мульт|фильм|кино/.test(needle)) intents.push(item.contentType === "cartoon" || item.contentType === "movie");
  if (/перед сном|на ночь|заснуть|засып/.test(needle)) intents.push(item.suitableForBedtime);
  if (/всей семь|семейный вечер|с родителями/.test(needle)) intents.push(item.suitableForFamily);
  if (/самостоятельно|самому|сама/.test(needle)) intents.push(item.suitableForIndependentUse);
  if (/тревож|волнуе|успок|боится|страшно/.test(needle)) intents.push(item.moods.includes("спокойное") || item.moods.includes("уютное"));

  for (const interest of item.interests) {
    if (needle.includes(normalize(interest))) intents.push(true);
  }
  for (const mood of item.moods) {
    if (needle.includes(normalize(mood))) intents.push(true);
  }

  const ageMatch = needle.match(/(\d{1,2})\s*(?:лет|год|года)/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    intents.push(age >= item.recommendedAgeMin && age <= item.recommendedAgeMax);
  }

  return intents.length > 0 && intents.every(Boolean);
}

export function queryToParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.age !== null) params.set("age", String(query.age));
  if (query.format !== "all") params.set("format", query.format);
  if (query.interests.length) params.set("interests", query.interests.join("|"));
  if (query.moods.length) params.set("moods", query.moods.join("|"));
  if (query.situation) params.set("situation", query.situation);
  if (query.duration) params.set("duration", query.duration);
  if (query.search) params.set("q", query.search);
  return params;
}

export function paramsToQuery(params: URLSearchParams): CatalogQuery {
  const age = Number(params.get("age"));
  const format = params.get("format");
  const situation = params.get("situation");
  return {
    age: Number.isFinite(age) && age >= 1 && age <= 17 ? age : null,
    format: format === "reading" || format === "cartoon" || format === "movie" ? format : "all",
    interests: params.get("interests")?.split("|").filter(Boolean) ?? [],
    moods: params.get("moods")?.split("|").filter(Boolean) ?? [],
    situation: situation === "bedtime" || situation === "family" || situation === "independent" ? situation : null,
    duration: params.get("duration"),
    search: params.get("q") ?? "",
  };
}

export function neutralDescription(item: CatalogItem): string {
  const provided = item.shortDescription?.trim();
  if (provided) return provided;
  const genre = item.genres[0]?.trim() || "Произведение";
  const heading = `${genre[0].toLocaleUpperCase("ru")}${genre.slice(1)} для детей ${item.recommendedAgeMin}–${item.recommendedAgeMax} лет.`;
  const attributes = [...item.interests, ...item.moods].filter(Boolean).slice(0, 4);
  return attributes.length ? `${heading} Темы и настроение: ${attributes.join(", ")}.` : heading;
}
