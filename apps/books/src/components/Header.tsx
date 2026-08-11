import { href, ROUTES } from "../app/routes";
import { AppLink } from "./Link";

const LINKS = [
  [ROUTES.catalog, "Каталог", "▤"],
  [ROUTES.collections, "Подборки НЭН", "◇"],
  [ROUTES.recommend, "Подбор книги", "✦"],
  [ROUTES.favorites, "Избранное", "♡"],
] as const;

export function Header({ navigate, favoriteCount, route }: { navigate: (path: string) => void; favoriteCount: number; route: string }) {
  const isActive = (target: string) => route === target || route.startsWith(`${target}/`) || (target === ROUTES.catalog && route.startsWith(`${ROUTES.book}/`));
  const badge = (target: string, wrap: (value: number) => string) => (target === ROUTES.favorites && favoriteCount > 0 ? wrap(favoriteCount) : "");

  return <>
    <header className="site-header">
      <AppLink href={ROUTES.home} navigate={navigate} className="brand" ariaLabel="НЭН — на главную">
        <img src={href("/brand/nen-logo.png")} alt="" />
        <b>Что почитать с детьми</b>
      </AppLink>
      <nav className="desktop-nav" aria-label="Основная навигация">
        {LINKS.map(([target, label]) => (
          <AppLink key={target} href={target} navigate={navigate} className={isActive(target) ? "active" : ""}>
            {label}{badge(target, (value) => ` ${value}`)}
          </AppLink>
        ))}
      </nav>
    </header>
    <nav className="mobile-nav" aria-label="Мобильная навигация">
      {LINKS.map(([target, label, icon]) => (
        <AppLink key={target} href={target} navigate={navigate} className={isActive(target) ? "active" : ""}>
          <span aria-hidden="true">{icon}</span>
          <small>{label}{badge(target, (value) => ` (${value})`)}</small>
        </AppLink>
      ))}
    </nav>
  </>;
}
