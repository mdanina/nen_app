import { describe, expect, it } from "vitest";
import sampleCatalog from "../../../data/catalog.sample.json";
import type { WatchTitle } from "./types";
import { filterSeriesTitles } from "./series";

const titles = sampleCatalog as WatchTitle[];

describe("series catalog", () => {
  it("includes series from both main catalogs", () => {
    const result = filterSeriesTitles(titles, { query: "", category: "all", age: null, country: "" });
    expect(result.every((title) => title.releaseForm === "series")).toBe(true);
    expect(result.some((title) => title.contentType === "cartoon")).toBe(true);
  });

  it("filters by localized search, age and type", () => {
    const animated = filterSeriesTitles(titles, { query: "космос", category: "animated", age: 7, country: "" });
    expect(animated.map((title) => title.id)).toEqual(["demo-cartoon-space-series"]);
  });

  it("ignores invalid combinations instead of leaking standalone works", () => {
    const result = filterSeriesTitles(titles, { query: "", category: "live-action", age: 4, country: "Япония" });
    expect(result).toEqual([]);
  });
});
