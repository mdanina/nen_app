import { createHash } from "node:crypto";

// Обложки лежат на сорока чужих CDN. Любая защита от хотлинка или переименование
// файла у издательства разом обнуляет витрину каталога, поэтому картинки
// складываются в собственный кеш и отдаются с домена НЭН.

const EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

/** Имя в кеше зависит только от исходного адреса: пересборка не переименовывает файлы. */
export function cacheName(url, contentType = "image/jpeg") {
  const digest = createHash("sha256").update(String(url)).digest("hex").slice(0, 20);
  const fromUrl = String(url).split("?")[0].match(/\.(jpe?g|png|webp|gif)$/iu)?.[1]?.toLowerCase();
  const extension = EXTENSIONS.get(String(contentType).split(";")[0].trim().toLowerCase())
    ?? (fromUrl === "jpeg" ? "jpg" : fromUrl)
    ?? "jpg";
  return `${digest}.${extension}`;
}

/**
 * 450 адресов содержат кириллицу. Браузер кодирует её сам, а серверная загрузка,
 * прокси и оптимизаторы картинок получают 403, если этого не сделать.
 */
export function requestUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return encodeURI(String(url));
  }
}

export function isCacheable(cover) {
  return Boolean(cover?.url) && cover.kind === "external";
}
