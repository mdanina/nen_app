import { describe, expect, it } from "vitest";
import { FAVORITES_STORAGE_KEY, readFavoriteIds, toggleFavoriteId, writeFavoriteIds } from "./favoritesStorage";

describe("watch favorites storage", () => {
  it("reads unique ids and ignores invalid entries", () => {
    const storage = { getItem: () => '["a","a",3,"b"]' };
    expect(readFavoriteIds(storage)).toEqual(["a", "b"]);
  });

  it("survives malformed localStorage", () => {
    expect(readFavoriteIds({ getItem: () => "not-json" })).toEqual([]);
    expect(readFavoriteIds({ getItem: () => '{"id":"a"}' })).toEqual([]);
  });

  it("adds and removes ids without storing full records", () => {
    expect(toggleFavoriteId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavoriteId(["a", "b"], "a")).toEqual(["b"]);
    let saved = "";
    writeFavoriteIds({ setItem: (key, value) => { expect(key).toBe(FAVORITES_STORAGE_KEY); saved = value; } }, ["a", "b"]);
    expect(saved).toBe('["a","b"]');
  });
});
