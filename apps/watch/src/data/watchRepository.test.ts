import { describe, expect, it } from "vitest";
import { CatalogValidationError, createWatchRepository } from "./watchRepository";
import { StaticWatchDataSource } from "./watchDataSource";

describe("watch repository", () => {
  it("keeps cartoons and movies in separate queries", async () => {
    const repository = await createWatchRepository();
    expect(await repository.getAllCartoons()).toHaveLength(2);
    expect(await repository.getAllMovies()).toHaveLength(2);
  });

  it("finds by slug and returns null for an unknown slug", async () => {
    const repository = await createWatchRepository();
    expect((await repository.getBySlug("lesnaya-komanda"))?.contentType).toBe("cartoon");
    expect(await repository.getBySlug("missing")).toBeNull();
  });

  it("returns requested ids in request order and skips unknown ids", async () => {
    const repository = await createWatchRepository();
    const items = await repository.getByIds(["demo-movie-river", "missing", "demo-cartoon-forest"]);
    expect(items.map((item) => item.id)).toEqual(["demo-movie-river", "demo-cartoon-forest"]);
  });

  it("builds filter dictionaries for one content type", async () => {
    const repository = await createWatchRepository();
    const dictionary = await repository.getFilterDictionary("movie");
    expect(dictionary.contentFormats).toEqual(["documentary", "fiction"]);
    expect(dictionary.themes).toContain("семья");
    expect(dictionary.contentFormats).not.toContain("animated-feature");
  });

  it("refuses to initialize from invalid data", async () => {
    await expect(createWatchRepository(new StaticWatchDataSource([{ id: "broken" }]))).rejects.toBeInstanceOf(CatalogValidationError);
  });
});
