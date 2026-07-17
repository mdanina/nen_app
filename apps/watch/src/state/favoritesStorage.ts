export const FAVORITES_STORAGE_KEY = "nen-watch:favorites";

export interface StorageReader {
  getItem(key: string): string | null;
}

export interface StorageWriter {
  setItem(key: string, value: string): void;
}

export function readFavoriteIds(storage: StorageReader): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
  } catch {
    return [];
  }
}

export function writeFavoriteIds(storage: StorageWriter, ids: readonly string[]) {
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}
