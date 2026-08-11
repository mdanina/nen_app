// Публичный слаг книги строится из названия, а не из служебного идентификатора импорта.
// Слаги попадают в индекс поисковика, поэтому в них не должно быть ни имени поставщика
// данных (samokat-, clever-), ни технических хвостов OpenLibrary (-ol19978384w).

const RUSSIAN_LATIN = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

// Маршруты приложения: книга с таким слагом перекрыла бы страницу раздела.
export const RESERVED_SLUGS = new Set([
  "katalog", "kniga", "knigi", "podborki", "podbor", "izbrannoe",
  "index", "sitemap", "robots", "assets", "brand", "data", "404",
]);

const MAX_LENGTH = 72;

export function slugify(value = "") {
  const latin = [...String(value).toLowerCase().replaceAll("ё", "е")]
    .map((letter) => RUSSIAN_LATIN[letter] ?? letter)
    .join("");
  return latin.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

// Обрезаем по границе слова: «istoriya-ernesta-i-sele» читается хуже, чем «istoriya-ernesta».
function trim(slug, limit = MAX_LENGTH) {
  if (slug.length <= limit) return slug;
  const cut = slug.slice(0, limit);
  const boundary = cut.lastIndexOf("-");
  return (boundary > limit / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/u, "");
}

function surname(author = "") {
  const first = String(author).split(/[;,]/u)[0].trim();
  const parts = first.split(/\s+/u).filter(Boolean);
  // «Астрид Линдгрен» — фамилия последняя; «Линдгрен А.» — первая.
  const candidate = parts.length > 1 && /^[А-ЯA-Z]\.?$/u.test(parts.at(-1)) ? parts[0] : parts.at(-1);
  return slugify(candidate ?? "");
}

export function buildPublicSlug(book) {
  const base = trim(slugify(book.title));
  return base || trim(slugify(book.author)) || String(book.id);
}

// Детерминированное разрешение совпадений: сначала фамилия автора, затем номер.
// Порядок обхода задан идентификатором, поэтому пересборка каталога даёт тот же результат.
export function assignPublicSlugs(books) {
  const ordered = [...books].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const taken = new Set(RESERVED_SLUGS);
  const assigned = new Map();

  for (const book of ordered) {
    const base = buildPublicSlug(book);
    let slug = base;
    if (taken.has(slug)) {
      const withAuthor = trim(`${base}-${surname(book.author)}`.replace(/-+$/u, ""));
      slug = taken.has(withAuthor) || withAuthor === base ? "" : withAuthor;
    }
    for (let index = 2; !slug || taken.has(slug); index += 1) slug = `${base}-${index}`;
    taken.add(slug);
    assigned.set(book.id, slug);
  }

  return assigned;
}
