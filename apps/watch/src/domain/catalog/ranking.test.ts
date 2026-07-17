import { describe, expect, it } from "vitest";
import sampleCatalog from "../../../data/catalog.sample.json";
import { emptyCartoonFilters, emptyMovieFilters } from "./filters";
import { findNearbyMatches, rankExactMatches } from "./ranking";
import { validateCatalog } from "./validation";

const titles = validateCatalog(sampleCatalog).items;

describe("catalog ranking and nearby results", () => {
  it("ranks exact matches with explanations", () => {
    const result = rankExactMatches(titles, { ...emptyMovieFilters(), age: 8, themes: ["природа"], durationMinutes: { max: 60 } });
    expect(result.map((item) => item.title.id)).toEqual(["demo-movie-river"]);
    expect(result[0].relaxedConditions).toEqual([]);
    expect(result[0].matchedConditions.map((item) => item.key)).toEqual(expect.arrayContaining(["age", "theme:природа", "duration"]));
  });

  it("returns no exact matches for incompatible conditions", () => {
    const result = rankExactMatches(titles, { ...emptyCartoonFilters(), themes: ["дружба", "космос"] });
    expect(result).toEqual([]);
  });

  it("explains every relaxed nearby condition", () => {
    const filters = { ...emptyCartoonFilters(), age: 7, contentFormats: ["animated-series" as const], themes: ["дружба"] };
    const nearby = findNearbyMatches(titles, filters);
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby.every((item) => item.relaxedConditions.length > 0)).toBe(true);
    expect(nearby.flatMap((item) => item.relaxedConditions).map((item) => item.key)).toEqual(expect.arrayContaining(["contentFormat", "theme:дружба"]));
  });

  it("never relaxes age or sensitive topics", () => {
    const ageBlocked = findNearbyMatches(titles, { ...emptyMovieFilters(), age: 3, themes: ["семья"] });
    const topicBlocked = findNearbyMatches(titles, { ...emptyMovieFilters(), age: 12, excludedSensitiveTopics: ["разлука с близкими"], themes: ["семья"] });
    expect(ageBlocked).toEqual([]);
    expect(topicBlocked.every((item) => item.title.id !== "demo-movie-lighthouse")).toBe(true);
    expect([...ageBlocked, ...topicBlocked].flatMap((item) => item.relaxedConditions).some((item) => item.key === "age" || item.key === "sensitiveTopics")).toBe(false);
  });

  it("is deterministic for repeated requests", () => {
    const filters = { ...emptyCartoonFilters(), age: 7, themes: ["несуществующая тема"] };
    const first = findNearbyMatches(titles, filters).map((item) => item.title.id);
    const second = findNearbyMatches([...titles].reverse(), filters).map((item) => item.title.id);
    expect(first).toEqual(second);
  });
});
