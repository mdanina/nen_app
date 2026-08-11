import assert from "node:assert/strict";
import test from "node:test";
import { cacheName, isCacheable, requestUrl } from "./cover-cache.mjs";

test("имя в кеше устойчиво и зависит только от адреса", () => {
  const url = "https://cdn.ast.ru/v2/ASE000000000867582/COVER/cover1__w340.jpg";
  assert.equal(cacheName(url), cacheName(url));
  assert.notEqual(cacheName(url), cacheName(`${url}?v=2`));
  assert.match(cacheName(url), /^[0-9a-f]{20}\.jpg$/u);
});

test("расширение берётся из типа ответа, а при его отсутствии — из адреса", () => {
  assert.ok(cacheName("https://example.test/cover", "image/webp").endsWith(".webp"));
  assert.ok(cacheName("https://example.test/cover.png", "").endsWith(".png"));
  assert.ok(cacheName("https://example.test/cover.jpeg", "").endsWith(".jpg"));
  assert.ok(cacheName("https://example.test/cover", "text/html").endsWith(".jpg"));
});

test("кириллица в адресе кодируется — иначе CDN отвечает 403", () => {
  const url = "https://static.insales-cdn.com/images/products/1/2537/978-5-00154-750-1_имаг.jpg";
  assert.ok(!/[^\x00-\x7F]/u.test(requestUrl(url)), requestUrl(url));
  assert.ok(requestUrl(url).includes("%D0%B8%D0%BC%D0%B0%D0%B3"));
});

test("уже закодированный адрес не кодируется дважды", () => {
  const encoded = "https://example.test/%D0%B8.jpg";
  assert.equal(requestUrl(encoded), encoded);
});

test("кешируются только внешние обложки", () => {
  assert.equal(isCacheable({ kind: "external", url: "https://example.test/a.jpg" }), true);
  assert.equal(isCacheable({ kind: "placeholder" }), false);
  assert.equal(isCacheable({ kind: "external" }), false);
  assert.equal(isCacheable(undefined), false);
});
