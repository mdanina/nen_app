import { describe, expect, it } from "vitest";
// @ts-expect-error Transitional Node generator is an ESM JavaScript module outside the app source root.
import { formatWatchV2Report, generateWatchV2Catalog, serializeWatchV2Catalog } from "../../../../../scripts/watch-v2-generator.mjs";

const record = (id: string, kind: "movie" | "animated-feature" | "animated-short" | "animated-series" = "movie") => ({
  schemaVersion: 2,
  id,
  slug: id,
  title: `Произведение ${id}`,
  kind,
  shortDescription: "Содержательное описание реального произведения для семейного каталога НЭН.",
  whyRecommended: "Редакция рекомендует это произведение как повод для внимательного семейного разговора.",
  country: ["Россия"],
  year: 2020,
  duration: kind === "animated-series" ? { episodeMinutes: 12, episodeCount: 10 }
    : { minutes: kind === "animated-short" ? 40 : 90 },
  genres: ["семейный"],
  themes: ["семья"],
  discussionTopics: ["Как поступки героев меняют их отношения с близкими людьми?"],
  mood: ["вдумчивое"],
  sensitiveTopics: [],
  nenAgeRecommendation: { minAge: 8, maxAge: 14, rationale: "Темп, сюжет и эмоциональная нагрузка подходят детям указанного возраста." },
  officialRating: { value: "6+", sourceUrl: "https://example.org/rating" },
});

describe("watch-v2 production generator", () => {
  it("generates stable output and a report for every kind", () => {
    const input = [record("work-4", "animated-series"), record("work-2", "animated-feature"), record("work-1"), record("work-3", "animated-short")];
    const first = generateWatchV2Catalog(input);
    const second = generateWatchV2Catalog([...input].reverse());
    expect(serializeWatchV2Catalog(first.items)).toBe(serializeWatchV2Catalog(second.items));
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["work-1", "work-2", "work-3", "work-4"]);
    expect(first.report).toEqual({
      total: 4,
      movies: 1,
      cartoons: 3,
      byKind: { movie: 1, "animated-feature": 1, "animated-short": 1, "animated-series": 1, series: 0, documentary: 0 },
      withOfficialRating: 4,
      withoutOfficialRating: 0,
    });
    expect(formatWatchV2Report(first.report)).toContain("Всего произведений: 4");
  });

  it("publishes a valid title without an unconfirmed official rating", () => {
    const { officialRating: _rating, ...withoutRating } = record("without-rating");
    const result = generateWatchV2Catalog([withoutRating]);
    expect(result.items[0]).not.toHaveProperty("officialRating");
    expect(result.report.withoutOfficialRating).toBe(1);
  });

  it.each([
    ["duplicate id", [record("same"), { ...record("other"), id: "same" }], "id: дублирует"],
    ["duplicate slug", [record("one"), { ...record("two"), slug: "one" }], "slug: дублирует"],
    ["service record", [{ ...record("clean-id"), title: "Demo sample title" }], "служебные demo/test/sample"],
    ["required field", [{ ...record("missing-title"), title: "" }], "title: обязательная"],
    ["mood dictionary", [{ ...record("bad-mood"), mood: ["саркастическое"] }], "mood: значение"],
    ["genre dictionary", [{ ...record("bad-genre"), genres: ["вестерн"] }], "genres: значение"],
    ["theme dictionary", [{ ...record("bad-theme"), themes: ["неизвестное"] }], "themes: значение"],
    ["official rating", [{ ...record("bad-rating"), officialRating: { value: "PG", sourceUrl: "" } }], "officialRating.value"],
    ["rating source", [{ ...record("bad-source"), officialRating: { value: "6+", sourceUrl: "" } }], "officialRating.sourceUrl"],
    ["short duration", [{ ...record("long-short", "animated-short"), duration: { minutes: 41 } }], "не более 40"],
    ["feature duration", [{ ...record("short-feature", "animated-feature"), duration: { minutes: 40 } }], "более 40"],
    ["series duration", [{ ...record("bad-series", "animated-series"), duration: { minutes: 25 } }], "duration.episodeMinutes"],
  ])("fails for %s with record context", (_name, input, message) => {
    expect(() => generateWatchV2Catalog(input)).toThrow(message);
    try { generateWatchV2Catalog(input); } catch (error) {
      expect(String(error)).toContain("id=");
      expect(String(error)).toContain("slug=");
    }
  });
});
