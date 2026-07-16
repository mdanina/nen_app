import { useEffect, useState } from "react";

const STORAGE_KEY = "nen-family-favorites";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // The app remains usable when storage is unavailable.
    }
  }, [favorites]);
  const toggle = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return { favorites, toggle };
}
