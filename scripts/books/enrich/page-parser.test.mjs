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

test("prefers the product gallery over a technical social preview", () => {
  const html = `
    <html><head><meta property="og:image" content="/social-fb-book-preview.png"></head><body>
      <h1>Мама Му и снегокат</h1>
      <img class="product-main-thumbnail" src="/covers/mama-mu-i-snegokat.png" alt="Мама Му и снегокат">
    </body></html>`;
  const parsed = parseBookPage(html, "https://publisher.example/product/mama-mu/");
  assert.equal(parsed.coverUrl, "https://publisher.example/covers/mama-mu-i-snegokat.png");
});

test("accepts a portrait cover with a social filename when publisher marks it as the main product image", () => {
  const html = `
    <html><body>
      <h1>Джейн, лиса и я</h1>
      <img class="product-main-thumbnail" src="/covers/social-fb-book-035.png" alt="Джейн, лиса и я">
      <img class="product-thumbnail" src="/covers/related-book.png" alt="Луи среди призраков">
    </body></html>`;
  const parsed = parseBookPage(html, "https://publisher.example/product/jane-lisa-i-ya/");
  assert.equal(parsed.coverUrl, "https://publisher.example/covers/social-fb-book-035.png");
  assert.equal(parsed.coverEvidence, "product_main");
});

test("reads a nested JSON-LD product image URL and ignores preload graphics", () => {
  const html = `
    <html><body>
      <script type="application/ld+json">{"@type":"Product","name":"Милые кости","image":{"url":{"contentUrl":"https://publisher.example/covers/lovely-bones.jpg"}}}</script>
      <img class="product-main-image" src="https://publisher.example/assets/img-preload.gif">
    </body></html>`;
  const parsed = parseBookPage(html, "https://publisher.example/book/lovely-bones/");
  assert.equal(parsed.coverUrl, "https://publisher.example/covers/lovely-bones.jpg");
});
