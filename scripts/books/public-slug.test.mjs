import assert from "node:assert/strict";
import test from "node:test";
import { assignPublicSlugs, buildPublicSlug, RESERVED_SLUGS, slugify } from "./public-slug.mjs";

test("слаг строится из названия, а не из идентификатора поставщика", () => {
  assert.equal(buildPublicSlug({ id: "samokat-1", title: "История Эрнеста и Селестины", author: "Габриэль Венсан" }), "istoriya-ernesta-i-selestiny");
  assert.equal(buildPublicSlug({ id: "ol-1", title: "100 сказок", author: "Владимир Сутеев" }), "100-skazok");
});

test("технический хвост OpenLibrary в слаг не попадает", () => {
  const slug = buildPublicSlug({ id: "ol19978384", title: "100 сказок", author: "Владимир Сутеев" });
  assert.ok(!/-ol\d+w$/u.test(slug), slug);
});

test("буква ё нормализуется, кавычки и пунктуация выбрасываются", () => {
  assert.equal(slugify("«Ёжик в тумане»: истории"), "ezhik-v-tumane-istorii");
  assert.equal(slugify('"Как стать большим" и другие истории'), "kak-stat-bolshim-i-drugie-istorii");
});

test("длинное название обрезается по границе слова", () => {
  const slug = buildPublicSlug({ id: "x", title: "Слизь, ссоры и ларёк с шавермой: любимые книги редакции Альпина Дети про школу", author: "" });
  assert.ok(slug.length <= 72, slug);
  assert.ok(!slug.endsWith("-"), slug);
  assert.ok(!/[a-z]$/u.test(slug) || slug.split("-").at(-1).length > 1, slug);
});

test("совпадения разрешаются фамилией автора, затем номером", () => {
  const assigned = assignPublicSlugs([
    { id: "b", title: "Мышонок", author: "Астрид Линдгрен" },
    { id: "a", title: "Мышонок", author: "Туве Янссон" },
    { id: "c", title: "Мышонок", author: "Туве Янссон" },
    { id: "d", title: "Мышонок", author: "Туве Янссон" },
  ]);
  assert.equal(assigned.get("a"), "myshonok");
  assert.equal(assigned.get("b"), "myshonok-lindgren");
  assert.equal(assigned.get("c"), "myshonok-yansson");
  assert.equal(assigned.get("d"), "myshonok-2");
});

test("порядок входных данных не влияет на результат", () => {
  const books = [
    { id: "a", title: "Мышонок", author: "Туве Янссон" },
    { id: "b", title: "Мышонок", author: "Астрид Линдгрен" },
  ];
  assert.deepEqual([...assignPublicSlugs(books)], [...assignPublicSlugs([...books].reverse())]);
});

test("слаг не занимает маршрут приложения", () => {
  const assigned = assignPublicSlugs([{ id: "a", title: "Каталог", author: "" }]);
  assert.ok(!RESERVED_SLUGS.has(assigned.get("a")), assigned.get("a"));
  assert.equal(assigned.get("a"), "katalog-2");
});

test("название без латиницы и кириллицы не оставляет книгу без слага", () => {
  assert.equal(buildPublicSlug({ id: "nen-777", title: "???", author: "" }), "nen-777");
});
