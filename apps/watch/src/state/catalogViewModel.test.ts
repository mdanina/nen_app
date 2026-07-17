import { describe, expect, it } from "vitest";
import sampleCatalog from "../../data/catalog.sample.json";
import { emptyCartoonFilters, emptyMovieFilters } from "../domain/catalog/filters";
import { serializeFiltersToUrl } from "../domain/catalog/url";
import { validateCatalog } from "../domain/catalog/validation";
import { buildCatalogResult, findDetailTitle, toggleFilterValue } from "./catalogViewModel";

const titles = validateCatalog(sampleCatalog).items;

describe("catalog view model", () => {
  it("shows exact results when available", () => {
    expect(buildCatalogResult(titles, { ...emptyMovieFilters(), themes: ["природа"] }).kind).toBe("exact");
  });

  it("shows nearby results instead of an empty exact list", () => {
    expect(buildCatalogResult(titles, { ...emptyCartoonFilters(), age: 7, themes: ["дружба", "космос"] }).kind).toBe("nearby");
  });

  it("does not relax age when building UI state", () => {
    expect(buildCatalogResult(titles, { ...emptyMovieFilters(), age: 3, themes: ["семья"] })).toEqual({ kind: "empty", results: [] });
  });

  it("switches a chip and serializes the resulting URL", () => {
    const themes = toggleFilterValue([], "космос");
    const filters = { ...emptyCartoonFilters(), themes };
    expect(serializeFiltersToUrl(filters)).toContain("theme=%D0%BA%D0%BE%D1%81%D0%BC%D0%BE%D1%81");
    expect(toggleFilterValue(themes, "космос")).toEqual([]);
  });

  it("returns a separate not-found state for an unknown or wrong-type slug", () => {
    expect(findDetailTitle(titles, "missing", "movie")).toBeNull();
    expect(findDetailTitle(titles, "lesnaya-komanda", "movie")).toBeNull();
    expect(findDetailTitle(titles, "lesnaya-komanda", "cartoon")?.id).toBe("demo-cartoon-forest");
  });
});
