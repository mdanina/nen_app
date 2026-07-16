import { describe, expect, it } from "vitest";
import { matchesSearch, paramsToQuery, queryToParams } from "./catalog";
import { recommend } from "./recommendations";
import { catalog } from "../data/catalog";
import { editorialCollections } from "../data/collections";
import { confirmedOfficialRating, contentByType, contentItems, contentPath } from "./content";
import type { CatalogItem, CatalogQuery } from "../types";

const item = {
  id: "1", slug: "test", title: "Ёжик в тумане", originalTitle: null, contentType: "cartoon", categoryLabel: "Мультфильм",
  creator: "Юрий Норштейн", contributor: null, studioOrPublisher: "Союзмультфильм", countryOrTradition: "СССР", originalYear: 1975,
  referenceEditionOrRelease: null, isbnOrIdentifier: null, pageCount: null, durationMinutes: 10, officialAgeRatingRu: "0+", officialAgeRatingSource: null,
  recommendedAgeMin: 4, recommendedAgeMax: 8, ageGroups: [], genres: ["сказка"], interests: ["дружба", "животные"], moods: ["спокойное"],
  suitableForBedtime: true, suitableForFamily: true, suitableForIndependentUse: false, durationCategory: "до 15 минут", imageUrl: null,
  shortDescription: null, editorialNote: null, metadataSource: null, verificationStatus: null, annotationStatus: null, note: null,
} satisfies CatalogItem;

const query: CatalogQuery = { age: 6, format: "cartoon", interests: ["дружба"], moods: [], situation: "family", duration: null, search: "" };

describe("catalog logic", () => {
  it("normalizes ё/е in search", () => expect(matchesSearch(item, "ежик")).toBe(true));
  it("keeps strict matches separate", () => expect(recommend([item], query).exact).toHaveLength(1));
  it("round-trips URL filters", () => expect(paramsToQuery(queryToParams(query))).toEqual(query));
  it("loads all 80 unique works", () => {
    expect(catalog).toHaveLength(80);
    expect(new Set(catalog.map((entry) => entry.id))).toHaveLength(80);
  });
  it("finds a work from the additions", () => {
    expect(catalog.filter((entry) => matchesSearch(entry, "голодная гусеница")).map((entry) => entry.id)).toContain("nen-051");
  });
  it("understands a natural bedtime reading request", () => {
    const matches = catalog.filter((entry) => matchesSearch(entry, "почитать перед сном"));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((entry) => (entry.contentType === "book" || entry.contentType === "fairy-tale") && entry.suitableForBedtime)).toBe(true);
  });
  it("understands a request for an anxious child", () => {
    const matches = catalog.filter((entry) => matchesSearch(entry, "для тревожного ребёнка"));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((entry) => entry.moods.includes("спокойное") || entry.moods.includes("уютное"))).toBe(true);
  });
  it("keeps classic and modern books in the reading filter", () => {
    const reading = recommend(catalog, { ...query, age: null, format: "reading", interests: [], situation: null });
    const categories = new Set(reading.exact.map(({ item: entry }) => entry.categoryLabel));
    expect(categories.has("Классическая книга")).toBe(true);
    expect(categories.has("Современная книга")).toBe(true);
  });
  it("filters short cartoons by their duration category", () => {
    const shortCartoons = recommend(catalog, { ...query, age: null, interests: [], situation: null, duration: "до 15 минут" });
    expect(shortCartoons.exact.length).toBeGreaterThan(0);
    expect(shortCartoons.exact.every(({ item: entry }) => entry.contentType === "cartoon" && entry.durationCategory === "до 15 минут")).toBe(true);
  });
  it("returns many exact results when several works satisfy every condition", () => {
    const second = { ...item, id: "2", slug: "second", title: "Второй мультфильм" };
    expect(recommend([item, second], query).exact).toHaveLength(2);
  });
  it("keeps a single exact result separate from nearby recommendations", () => {
    const older = { ...item, id: "2", slug: "older", title: "Для старших", recommendedAgeMin: 10, recommendedAgeMax: 12 };
    const result = recommend([item, older], query);
    expect(result.exact).toHaveLength(1);
    expect(result.exact[0].item.id).toBe("1");
  });
  it("returns nearby recommendations when exact results are absent", () => {
    const result = recommend([item], { ...query, moods: ["таинственное"] });
    expect(result.exact).toHaveLength(0);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0].missed).toContain("Настроение отличается от выбранного");
  });
  it("handles an interest that is not represented in the catalog", () => {
    const result = recommend([item], { ...query, interests: ["роботы"] });
    expect(result.exact).toHaveLength(0);
    expect(result.partial[0].missed).toContain("Выбранный интерес пока не представлен в базе");
  });
  it("uses a neighbouring duration when duration removes exact results", () => {
    const result = recommend([item], { ...query, duration: "до 30 минут" });
    expect(result.exact).toHaveLength(0);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0].missed.some((reason) => reason.includes("длительности"))).toBe(true);
  });
  it("ranks the candidate with the maximum number of matches first", () => {
    const weaker = { ...item, id: "2", slug: "weaker", title: "Менее точный", interests: ["дружба"], moods: ["таинственное"] };
    const result = recommend([weaker, item], { ...query, interests: ["дружба", "животные"], moods: ["спокойное"], duration: "до 30 минут" });
    expect(result.exact).toHaveLength(0);
    expect(result.partial[0].item.id).toBe("1");
  });
  it("adapts the shared database into three independent catalogs", () => {
    expect(contentItems).toHaveLength(80);
    expect(contentByType.book).toHaveLength(39);
    expect(contentByType.cartoon).toHaveLength(26);
    expect(contentByType.movie).toHaveLength(15);
  });
  it("routes every content type to its own readable URL", () => {
    expect(contentPath(contentByType.book[0])).toMatch(/^\/books\//);
    expect(contentPath(contentByType.cartoon[0])).toMatch(/^\/cartoons\//);
    expect(contentPath(contentByType.movie[0])).toMatch(/^\/movies\//);
  });
  it("does not present an unverified age label as an official rating", () => {
    const unverified = catalog.find((entry) => entry.officialAgeRatingRu?.includes("требует"));
    expect(unverified).toBeDefined();
    expect(confirmedOfficialRating(unverified!)).toBeUndefined();
  });
  it("keeps editorial collections linked to existing works", () => {
    const ids = new Set(contentItems.map((entry) => entry.id));
    expect(editorialCollections.length).toBeGreaterThan(0);
    expect(editorialCollections.every((collection) => collection.itemIds.every((id) => ids.has(id)))).toBe(true);
  });
});
