import { describe, expect, it } from "vitest";
import sampleCatalog from "../../../data/catalog.sample.json";
import { validateCatalog } from "./validation";

const clone = () => structuredClone(sampleCatalog) as unknown[];

describe("watch catalog validation", () => {
  it("accepts the sample catalog", () => {
    const result = validateCatalog(clone());
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(4);
  });

  it.each([
    ["duplicate id", (items: any[]) => { items[1].id = items[0].id; }, "id"],
    ["duplicate slug", (items: any[]) => { items[1].slug = items[0].slug; }, "slug"],
    ["unknown content type", (items: any[]) => { items[0].contentType = "book"; }, "contentType"],
    ["missing required field", (items: any[]) => { delete items[0].title; }, "title"],
    ["invalid age range", (items: any[]) => { items[0].nenAgeRecommendation.maxAge = 3; }, "nenAgeRecommendation.maxAge"],
    ["invalid duration", (items: any[]) => { items[0].duration.minutes = 0; }, "duration.minutes"],
    ["mixed official rating", (items: any[]) => { items[0].officialRating = { system: "Demo", value: "6+", sourceUrl: "https://example.test", rationale: "wrong layer" }; }, "officialRating.rationale"],
    ["mixed NEN recommendation", (items: any[]) => { items[0].nenAgeRecommendation.system = "Demo"; }, "nenAgeRecommendation.system"],
  ])("rejects %s", (_name, mutate, field) => {
    const items = clone();
    mutate(items);
    expect(validateCatalog(items).issues.some((item) => item.field === field)).toBe(true);
  });
});
