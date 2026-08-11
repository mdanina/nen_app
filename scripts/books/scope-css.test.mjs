import assert from "node:assert/strict";
import test from "node:test";
import { scopeCss } from "./scope-css.mjs";

test("правила элементов перестают доставать до вёрстки сайта", () => {
  const css = scopeCss("footer{background:#000}h1{font-size:3rem}img{max-width:100%}");
  // всё уехало внутрь контейнера: снаружи не осталось ни одного правила
  assert.equal(css.slice(0, css.indexOf(".knigi {")).trim(), "");
  for (const rule of ["footer{background:#000}", "h1{font-size:3rem}", "img{max-width:100%}"]) {
    assert.ok(css.includes(rule), rule);
  }
});

test("правила body становятся правилами контейнера", () => {
  const css = scopeCss("body{margin:0;color:red}");
  assert.match(css, /&\{margin:0;color:red\}/u);
  assert.ok(!/\bbody\{/u.test(css), css);
});

test("шрифты, анимации и переменные остаются глобальными", () => {
  const css = scopeCss('@font-face{font-family:"A";src:url(a.woff2)}:root{--x:1px}html{scroll-padding-top:88px}.card{color:red}');
  const container = css.indexOf(".knigi {");
  assert.ok(css.indexOf("@font-face") < container, "шрифт должен быть вне контейнера");
  assert.ok(css.indexOf(":root") < container, "переменные должны быть вне контейнера");
  assert.ok(css.indexOf("html{") < container, "html остаётся глобальным");
  assert.ok(css.indexOf(".card") > container, "остальное — внутри");
});

test("@keyframes не уезжает внутрь контейнера", () => {
  const css = scopeCss("@keyframes skeleton{to{background-position:-200% 0}}.skeleton{animation:skeleton 1s}");
  assert.ok(css.indexOf("@keyframes") < css.indexOf(".knigi {"), css);
});

test("@media попадает внутрь контейнера целиком", () => {
  const css = scopeCss("@media (min-width:900px){.grid{display:grid}}");
  assert.match(css, /\.knigi \{\n@media \(min-width:900px\)\{\.grid\{display:grid\}\}/u);
});

test("фигурные скобки в строках и комментариях не сбивают разбор", () => {
  const css = scopeCss('.a{content:"}"}/* } */.b{color:red}');
  assert.ok(css.includes('.a{content:"}"}'), css);
  assert.ok(css.includes(".b{color:red}"), css);
});

test("пустая таблица стилей не порождает пустой контейнер", () => {
  assert.equal(scopeCss("").trim(), "");
});
