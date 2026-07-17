import { describe, expect, it } from "vitest";
import { shouldResetScroll } from "./navigation";

describe("catalog navigation scroll", () => {
  it("preserves scroll when only filters in the query string change", () => {
    expect(shouldResetScroll("/movies", "/movies")).toBe(false);
    expect(shouldResetScroll("/cartoons", "/cartoons")).toBe(false);
  });

  it("resets scroll when navigating to another page", () => {
    expect(shouldResetScroll("/movies", "/movies/demo-title")).toBe(true);
    expect(shouldResetScroll("/cartoons", "/favorites")).toBe(true);
  });
});
