import { describe, expect, it } from "vitest";
import { CatalogValidationError, createWatchRepository } from "./watchRepository";
import { StaticWatchDataSource } from "./watchDataSource";

describe("watch repository", () => {
  it("keeps cartoons and movies in separate queries", async () => {
    const repository = await createWatchRepository();
    expect(await repository.getAllCartoons()).toHaveLength(125);
    expect(await repository.getAllMovies()).toHaveLength(75);
  });

  it("finds by slug and returns null for an unknown slug", async () => {
    const repository = await createWatchRepository();
    expect((await repository.getBySlug("moy-sosed-totoro"))?.contentType).toBe("cartoon");
    expect(await repository.getBySlug("missing")).toBeNull();
  });

  it("returns requested ids in request order and skips unknown ids", async () => {
    const repository = await createWatchRepository();
    const items = await repository.getByIds(["nen-041", "missing", "nen-026"]);
    expect(items.map((item) => item.id)).toEqual(["nen-041", "nen-026"]);
  });

  it("does not expose demo or test records from the production data source", async () => {
    const repository = await createWatchRepository();
    const items = [...await repository.getAllCartoons(), ...await repository.getAllMovies()];
    const serviceMarker = /(?:^|[-_])(demo|test|sample)(?:[-_]|$)|демонстрацион|тестов/iu;
    expect(items).toHaveLength(200);
    expect(items.some((item) => serviceMarker.test([
      item.id, item.slug, item.title, item.shortDescription, item.whyRecommended, item.nenAgeRecommendation.rationale,
    ].join(" ")))).toBe(false);
  });

  it("builds filter dictionaries for one content type", async () => {
    const repository = await createWatchRepository();
    const dictionary = await repository.getFilterDictionary("movie");
    expect(dictionary.contentFormats).toEqual(["fiction"]);
    expect(dictionary.themes).toContain("семья");
    expect(dictionary.contentFormats).not.toContain("animated-feature");
  });

  it("refuses to initialize from invalid data", async () => {
    await expect(createWatchRepository(new StaticWatchDataSource([{ id: "broken" }]))).rejects.toBeInstanceOf(CatalogValidationError);
  });
});
