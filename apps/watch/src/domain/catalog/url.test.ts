import { describe, expect, it } from "vitest";
import { emptyCartoonFilters, emptyMovieFilters, type CartoonFilters } from "./filters";
import { parseFiltersFromUrl, serializeFiltersToUrl } from "./url";

describe("catalog filter URLs", () => {
  it("round-trips filters with stable parameter and value order", () => {
    const filters: CartoonFilters = {
      ...emptyCartoonFilters(), age: 7, themes: ["космос", "дружба"], moods: ["thoughtful", "calm"],
      contentFormats: ["animated-series"], releaseForms: ["series"],
      episodeDurationMinutes: { min: 8, max: 15 }, episodeCountKnown: true,
    };
    const url = serializeFiltersToUrl(filters);
    expect(url).toBe("?age=7&mood=calm%2Cthoughtful&theme=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0%2C%D0%BA%D0%BE%D1%81%D0%BC%D0%BE%D1%81&format=animated-series&release=series&episodeMin=8&episodeMax=15&episodeCountKnown=1");
    expect(parseFiltersFromUrl("cartoon", url)).toEqual({ ...filters, moods: ["calm", "thoughtful"], themes: ["дружба", "космос"] });
  });

  it("ignores unknown parameters and invalid values", () => {
    const parsed = parseFiltersFromUrl("movie", "?age=nope&format=animated-series&durationMin=-5&unknown=x&officialRating=maybe");
    expect(parsed).toEqual(emptyMovieFilters());
  });

  it("does not serialize empty filters", () => {
    expect(serializeFiltersToUrl(emptyCartoonFilters())).toBe("");
    expect(serializeFiltersToUrl(emptyMovieFilters())).toBe("");
  });
});
