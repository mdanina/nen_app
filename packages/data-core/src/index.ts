export interface ValidationIssue { index: number; field: string; message: string; }
export interface ValidatedData<T> { items: T[]; issues: ValidationIssue[]; }
export interface ReadonlyRepository<T, Q, R> {
  getAll(): Promise<T[]>;
  getBySlug(slug: string): Promise<T | null>;
  search(query: Q): Promise<R>;
}
export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}
