type ScrollTarget = Pick<Window, "scrollTo">;

export function resetScrollPosition(target: ScrollTarget = window) {
  target.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
