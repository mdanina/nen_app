import type { ValidatedData, ValidationIssue } from "@nen/data-core";
import type { Book, LengthCategory, ReadingMode } from "./types";

const readings = new Set<ReadingMode>(["independent", "together", "both"]);
const lengths = new Set<LengthCategory>(["very-short", "short", "medium", "long"]);

export function validateBooks(input: unknown): ValidatedData<Book> {
  if (!Array.isArray(input)) return { items: [], issues: [{ index: -1, field: "catalog", message: "Каталог должен быть массивом" }] };
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
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
    issues.push(...recordIssues);
    if (recordIssues.length) return;
    ids.add(item.id!); slugs.add(item.slug!);
    items.push({ ...item, genres: item.genres ?? [], themes: item.themes ?? [], moods: item.moods ?? [], sensitiveTopics: item.sensitiveTopics ?? [], status: item.status ?? "published" } as Book);
  });
  return { items, issues };
}
