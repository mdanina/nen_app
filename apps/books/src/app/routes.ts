// Сервис живёт в подкаталоге основного сайта: n-e-n.ru/knigi/.
// Внутри приложения маршруты хранятся без префикса, наружу отдаются вместе с ним.

export const BASE_PATH = normalizeBase(import.meta.env.BASE_URL ?? "/");

export const ROUTES = {
  home: "/",
  catalog: "/katalog",
  book: "/kniga",
  collections: "/podborki",
  recommend: "/podbor",
  favorites: "/izbrannoe",
} as const;

// Ранние ссылки (в том числе из превью на Vercel) вели на английские пути.
const LEGACY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["/books", ROUTES.catalog],
  ["/catalog", ROUTES.catalog],
  ["/collections", ROUTES.collections],
  ["/recommend", ROUTES.recommend],
  ["/favorites", ROUTES.favorites],
];

function normalizeBase(base: string) {
  const withSlashes = `/${base.replace(/^\/+|\/+$/gu, "")}`;
  return withSlashes === "/" ? "" : withSlashes;
}

/**
 * Внутренний маршрут → адрес, по которому страница доступна снаружи.
 *
 * Со слэшем на конце: у сайта в urlManager стоит suffix «/» и нормализатор
 * с постоянным редиректом, поэтому адрес без слэша ловил бы 301 на каждой
 * ссылке. Файлы сборки (data, covers, assets) слэшем не дополняются.
 */
export function href(route: string) {
  const path = route.startsWith("/") ? route : `/${route}`;
  if (path === "/") return `${BASE_PATH}/`;
  const isFile = /\.[a-z0-9]+$/iu.test(path);
  return `${BASE_PATH}${path}${isFile ? "" : "/"}`;
}

/** Адрес в браузере → внутренний маршрут. Префикс сайта и устаревшие пути снимаются. */
export function toRoute(pathname: string) {
  const withoutBase = BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  const trimmed = withoutBase.replace(/\/+$/u, "") || "/";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  for (const [legacy, actual] of LEGACY_PREFIXES) {
    if (path === legacy) return actual;
    if (path.startsWith(`${legacy}/`)) {
      const tail = path.slice(legacy.length);
      // Устаревшая карточка книги жила на /books/<слаг> и /catalog/<слаг>.
      return actual === ROUTES.catalog ? `${ROUTES.book}${tail}` : `${actual}${tail}`;
    }
  }
  return path;
}

export const bookPath = (slug: string) => `${ROUTES.book}/${slug}`;
export const collectionPath = (slug: string) => `${ROUTES.collections}/${slug}`;
