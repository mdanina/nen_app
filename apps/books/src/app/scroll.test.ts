import { describe, expect, it, vi } from "vitest";
import { resetScrollPosition } from "./scroll";

describe("resetScrollPosition", () => {
  it("opens every new route at the top without a delayed animation", () => {
    const scrollTo = vi.fn();

    resetScrollPosition({ scrollTo });

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
