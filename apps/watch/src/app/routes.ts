export const routes = {
  home: "/",
  cartoons: "/cartoons",
  movies: "/movies",
  series: "/series",
  collections: "/collections",
  recommend: "/recommend",
  favorites: "/favorites",
} as const;

export type WatchRoute = (typeof routes)[keyof typeof routes];

export function normalizeRoute(pathname: string): string {
  return pathname.replace(/\/+$/, "") || routes.home;
}

export type ResolvedRoute =
  | { kind: "home" }
  | { kind: "cartoons" }
  | { kind: "cartoon-detail"; slug: string }
  | { kind: "movies" }
  | { kind: "series" }
  | { kind: "movie-detail"; slug: string }
  | { kind: "collections" }
  | { kind: "collection-detail"; slug: string }
  | { kind: "recommend" }
  | { kind: "favorites" }
  | { kind: "not-found" };

const decodeSlug = (value: string) => {
  try { return decodeURIComponent(value); } catch { return ""; }
};

export function resolveRoute(pathname: string): ResolvedRoute {
  const route = normalizeRoute(pathname);
  if (route === routes.home) return { kind: "home" };
  if (route === routes.cartoons) return { kind: "cartoons" };
  if (route === routes.movies) return { kind: "movies" };
  if (route === routes.series) return { kind: "series" };
  if (route === routes.collections) return { kind: "collections" };
  if (route === routes.recommend) return { kind: "recommend" };
  if (route === routes.favorites) return { kind: "favorites" };
  for (const [prefix, kind] of [
    ["/cartoons/", "cartoon-detail"],
    ["/movies/", "movie-detail"],
    ["/collections/", "collection-detail"],
  ] as const) {
    if (route.startsWith(prefix)) {
      const slug = decodeSlug(route.slice(prefix.length));
      return slug && !slug.includes("/") ? { kind, slug } : { kind: "not-found" };
    }
  }
  return { kind: "not-found" };
}
