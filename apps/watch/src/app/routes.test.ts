import { describe, expect, it } from "vitest";
import { normalizeRoute, resolveRoute, routes } from "./routes";

describe("watch routes", () => {
  it("normalizes the root route", () => {
    expect(normalizeRoute("/")).toBe(routes.home);
  });

  it("removes trailing slashes", () => {
    expect(normalizeRoute("/movies/")).toBe(routes.movies);
  });

  it("resolves catalogs and detail slugs", () => {
    expect(resolveRoute("/cartoons")).toEqual({ kind: "cartoons" });
    expect(resolveRoute("/movies/svet-mayaka")).toEqual({ kind: "movie-detail", slug: "svet-mayaka" });
  });

  it("resolves unknown and malformed routes to 404", () => {
    expect(resolveRoute("/unknown")).toEqual({ kind: "not-found" });
    expect(resolveRoute("/movies/%E0%A4%A")).toEqual({ kind: "not-found" });
  });
});
