// Сервис живёт внутри страницы n-e-n.ru, где шапку и подвал рисует сайт.
// Его собственные стили трогают body, main, footer, h1–h3, img — без изоляции
// они переломают чужую вёрстку. Здесь стили заворачиваются в один контейнер.

export const SCOPE = ".knigi";

// Эти конструкции обязаны остаться глобальными: шрифты, анимации и переменные
// внутри вложенного правила либо невалидны, либо перестают работать.
const GLOBAL_AT_RULES = /^@(font-face|keyframes|-webkit-keyframes|import|charset|property|namespace)\b/;
const GLOBAL_SELECTORS = new Set(["html", ":root", "html, :root", ":root, html"]);

/** Делит таблицу стилей на конструкции верхнего уровня, не путаясь в строках и комментариях. */
function splitTopLevel(css) {
  const chunks = [];
  let depth = 0;
  let start = 0;
  let index = 0;

  while (index < css.length) {
    const char = css[index];
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index += 1;
      while (index < css.length && css[index] !== char) index += css[index] === "\\" ? 2 : 1;
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        chunks.push(css.slice(start, index + 1));
        start = index + 1;
      }
    } else if (char === ";" && depth === 0) {
      chunks.push(css.slice(start, index + 1));
      start = index + 1;
    }
    index += 1;
  }

  const tail = css.slice(start);
  if (tail.trim()) chunks.push(tail);
  return chunks;
}

const prelude = (chunk) => chunk.slice(0, chunk.indexOf("{") === -1 ? chunk.length : chunk.indexOf("{")).trim();

export function scopeCss(css, scope = SCOPE) {
  const global = [];
  const scoped = [];

  for (const chunk of splitTopLevel(css)) {
    if (!chunk.trim()) continue;
    const head = prelude(chunk);
    if (GLOBAL_AT_RULES.test(head) || GLOBAL_SELECTORS.has(head.replace(/\s+/gu, " "))) {
      global.push(chunk);
      continue;
    }
    // body внутри вложенности превратилось бы в «.knigi body» и не нашло элемента:
    // это правила самого контейнера.
    scoped.push(head === "body" ? chunk.replace(/^[^{]*/u, "&") : chunk);
  }

  if (!scoped.length) return global.join("\n");
  return `${global.join("\n")}\n${scope} {\n${scoped.join("\n")}\n}\n`;
}

/** Плагин Vite: применяется и в dev, и в сборке, чтобы превью совпадало с продом. */
export function scopeCssPlugin(files = ["styles.css", "share.css"]) {
  return {
    name: "nen-scope-css",
    enforce: "pre",
    transform(code, id) {
      const [path] = id.split("?");
      if (!path.endsWith(".css") || !files.some((file) => path.endsWith(`/${file}`))) return null;
      return { code: scopeCss(code), map: null };
    },
  };
}
