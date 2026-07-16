import { useState } from "react";
const key = "nen-books-favorites";
function read() { try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; } }
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(read);
  const toggle = (id: string) => setFavorites((current) => { const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]; localStorage.setItem(key, JSON.stringify(next)); return next; });
  return { favorites, toggle };
}
