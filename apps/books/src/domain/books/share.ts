export function getBookPermalink(slug: string, origin = window.location.origin) {
  return new URL(`/books/${encodeURIComponent(slug)}`, origin).href;
}

export function getShareActionLabel(canShare: boolean) {
  return canShare ? "Поделиться" : "Скопировать ссылку";
}
