import { describe, expect, it } from "vitest";
import sampleCatalog from "../../../data/catalog.sample.json";
import { emptyCartoonFilters, emptyMovieFilters, filterTitles } from "./filters";
import { validateCatalog } from "./validation";

const titles = validateCatalog(sampleCatalog).items;

describe("strict catalog filtering", () => {
  it("keeps content types separate", () => {
    expect(filterTitles(titles, emptyCartoonFilters()).every((item) => item.contentType === "cartoon")).toBe(true);
    expect(filterTitles(titles, emptyMovieFilters()).every((item) => item.contentType === "movie")).toBe(true);
  });

  it("includes both NEN age boundaries", () => {
    expect(filterTitles(titles, { ...emptyMovieFilters(), age: 10 }).map((item) => item.id)).toContain("demo-movie-lighthouse");
    expect(filterTitles(titles, { ...emptyMovieFilters(), age: 14 }).map((item) => item.id)).toContain("demo-movie-lighthouse");
    expect(filterTitles(titles, { ...emptyMovieFilters(), age: 9 }).map((item) => item.id)).not.toContain("demo-movie-lighthouse");
  });

  it("never returns a title with an excluded sensitive topic", () => {
    const filters = { ...emptyMovieFilters(), excludedSensitiveTopics: ["разлука с близкими"] };
    expect(filterTitles(titles, filters).map((item) => item.id)).not.toContain("demo-movie-lighthouse");
  });

  it("filters movie duration", () => {
    const result = filterTitles(titles, { ...emptyMovieFilters(), durationMinutes: { max: 60 } });
    expect(result.map((item) => item.id)).toEqual(["demo-movie-river"]);
  });

  it("filters episode duration and known episode count", () => {
    const result = filterTitles(titles, { ...emptyCartoonFilters(), episodeDurationMinutes: { min: 10, max: 15 }, episodeCountKnown: true });
    expect(result.map((item) => item.id)).toEqual(["demo-cartoon-space-series"]);
  });

  it("distinguishes standalone and series cartoons", () => {
    const standalone = filterTitles(titles, { ...emptyCartoonFilters(), releaseForms: ["standalone"] });
    const series = filterTitles(titles, { ...emptyCartoonFilters(), releaseForms: ["series"] });
    expect(standalone.map((item) => item.id)).toEqual(["demo-cartoon-forest"]);
    expect(series.map((item) => item.id)).toEqual(["demo-cartoon-space-series"]);
  });

  it("requires every selected theme and mood", () => {
    const exact = filterTitles(titles, { ...emptyCartoonFilters(), themes: ["дружба", "взаимопомощь"], moods: ["cheerful", "adventurous"] });
    const none = filterTitles(titles, { ...emptyCartoonFilters(), themes: ["дружба", "космос"], moods: ["cheerful", "calm"] });
    expect(exact.map((item) => item.id)).toEqual(["demo-cartoon-forest"]);
    expect(none).toEqual([]);
  });
});
