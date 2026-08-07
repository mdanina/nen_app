import assert from "node:assert/strict";
import test from "node:test";
import { parseBookPage } from "./page-parser.mjs";

test("uses an official product-gallery image when structured cover metadata is absent", () => {
  const html = `
    <html><body>
      <h1>Дом, в котором...</h1>
      <p>Автор Мариам Петросян Издательство Livebook</p>
      <img class="product-gallery img-fluid" src="/uploads/images/books/books_30.webp" alt="Дом, в котором...">
    </body></html>`;
  const parsed = parseBookPage(html, "https://livebooks.ru/books/dom-v-kotorom/", { publisher: "Livebook" });
  assert.equal(parsed.coverUrl, "https://livebooks.ru/uploads/images/books/books_30.webp");
});
