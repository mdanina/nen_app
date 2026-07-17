import { useState } from "react";
import { readFavoriteIds, toggleFavoriteId, writeFavoriteIds } from "../state/favoritesStorage";

export function useFavorites() {
  const storage = () => {
    try { return window.localStorage; } catch { return null; }
  };
  const [favorites, setFavorites] = useState<string[]>(() => {
    const currentStorage = storage();
    return currentStorage ? readFavoriteIds(currentStorage) : [];
  });
  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = toggleFavoriteId(current, id);
    const currentStorage = storage();
    if (currentStorage) writeFavoriteIds(currentStorage, next);
    return next;
  });
  return { favorites, toggleFavorite };
}
