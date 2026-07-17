import type { ValidatedData, ValidationIssue } from "@nen/data-core";
import type { Book, LengthCategory, ReadingMode } from "./types";
import { bookFormats, emotionalStates, genres, lifeSituations, moods, themes } from "./dictionaries";

const readings = new Set<ReadingMode>(["independent", "together", "both"]);
const lengths = new Set<LengthCategory>(["very-short", "short", "medium", "long"]);
const v2Vocabularies = {
  bookFormats: new Set<string>(bookFormats), genres: new Set<string>(genres), themes: new Set<string>(themes),
  lifeSituations: new Set<string>(lifeSituations), emotionalStates: new Set<string>(emotionalStates), moods: new Set<string>(moods),
};
const displayableCoverRights = new Set(["licensed", "open-license", "public-domain", "external-display-only"]);
const normalize = (value: string) => value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();

export function validateBooks(input: unknown): ValidatedData<Book> {
  if (!Array.isArray(input)) return { items: [], issues: [{ index: -1, field: "catalog", message: "Каталог должен быть массивом" }] };
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const isbns = new Set<string>();
  const works = new Set<string>();
  const items: Book[] = [];
  input.forEach((value, index) => {
    if (!value || typeof value !== "object") { issues.push({ index, field: "record", message: "Запись должна быть объектом" }); return; }
    const item = value as Partial<Book>;
    const recordIssues: ValidationIssue[] = [];
    for (const field of ["id", "slug", "title", "author", "shortDescription", "whyRecommended"] as const) {
      if (typeof item[field] !== "string" || !item[field]?.trim()) recordIssues.push({ index, field, message: "Обязательное непустое поле" });
    }
    if (!Number.isFinite(item.ageMin) || !Number.isFinite(item.ageMax) || Number(item.ageMin) > Number(item.ageMax)) recordIssues.push({ index, field: "age", message: "Некорректный возрастной диапазон" });
    if (!item.readingMode || !readings.has(item.readingMode)) recordIssues.push({ index, field: "readingMode", message: "Неизвестный формат чтения" });
    if (item.lengthCategory && !lengths.has(item.lengthCategory)) recordIssues.push({ index, field: "lengthCategory", message: "Неизвестная категория объёма" });
    if (item.id && ids.has(item.id)) recordIssues.push({ index, field: "id", message: "Повторяющийся id" });
    if (item.slug && slugs.has(item.slug)) recordIssues.push({ index, field: "slug", message: "Повторяющийся slug" });
    if (item.isbn13 && (!/^97[89]\d{10}$/.test(item.isbn13) || isbns.has(item.isbn13))) recordIssues.push({ index, field: "isbn13", message: "Некорректный или повторяющийся ISBN-13" });
    if (item.title && item.author) {
      const workKey = `${normalize(item.title)}|${normalize(item.author)}`;
      if (works.has(workKey)) recordIssues.push({ index, field: "title", message: "Повторяющееся сочетание названия и автора" });
    }
    if (item.identificationStatus === "identified" && !item.isbn13) recordIssues.push({ index, field: "identificationStatus", message: "Для identified требуется ISBN-13" });
    if (item.identificationStatus) {
      for (const [field, vocabulary] of Object.entries(v2Vocabularies)) {
        const values = (item as unknown as Record<string, unknown>)[field];
        if (!Array.isArray(values) || values.some((entry) => typeof entry !== "string" || !vocabulary.has(entry))) recordIssues.push({ index, field, message: "Значение отсутствует в редакционном словаре" });
      }
      if (item.sensitiveTopicsReviewed !== true) recordIssues.push({ index, field: "sensitiveTopicsReviewed", message: "Чувствительные темы не проверены" });
    }
    if (item.cover && item.cover.kind !== "placeholder") {
      if (!item.cover.url || !displayableCoverRights.has(item.cover.rightsStatus)) recordIssues.push({ index, field: "cover", message: "Обложка не разрешена для показа" });
      if (item.cover.kind === "external" && (item.cover.rightsStatus !== "external-display-only" || !item.cover.temporary || item.cover.isbn13 !== item.isbn13)) recordIssues.push({ index, field: "cover", message: "Внешняя обложка не подтверждена точным ISBN" });
    }
    issues.push(...recordIssues);
    if (recordIssues.length) return;
    ids.add(item.id!); slugs.add(item.slug!);
    if (item.isbn13) isbns.add(item.isbn13);
    works.add(`${normalize(item.title!)}|${normalize(item.author!)}`);
    items.push({ ...item, genres: item.genres ?? [], themes: item.themes ?? [], moods: item.moods ?? [], sensitiveTopics: item.sensitiveTopics ?? [], status: item.status ?? "published" } as Book);
  });
  return { items, issues };
}
