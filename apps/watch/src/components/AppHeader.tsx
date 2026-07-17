import { Link, type Navigate } from "./Link";

const items = [
  ["/", "Главная"],
  ["/cartoons", "Мультфильмы"],
  ["/movies", "Фильмы"],
  ["/favorites", "Избранное"],
] as const;

const isActive = (pathname: string, href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

export function AppHeader({ pathname, navigate, favoriteCount }: { pathname: string; navigate: Navigate; favoriteCount: number }) {
  return <>
    <a className="skip-link" href="#main-content">К основному содержимому</a>
    <header className="app-header">
      <Link href="/" navigate={navigate} className="wordmark" ariaLabel="НЭН — на главную">НЭН<span>смотрим</span></Link>
      <nav className="header-nav" aria-label="Основная навигация">
        {items.map(([href, label]) => <Link key={href} href={href} navigate={navigate} className={isActive(pathname, href) ? "active" : undefined}>{label}{href === "/favorites" && favoriteCount ? ` ${favoriteCount}` : ""}</Link>)}
      </nav>
    </header>
    <nav className="bottom-nav" aria-label="Мобильная навигация">
      {items.map(([href, label]) => <Link key={href} href={href} navigate={navigate} className={isActive(pathname, href) ? "active" : undefined}><span aria-hidden="true">{href === "/" ? "⌂" : href === "/cartoons" ? "✦" : href === "/movies" ? "▶" : "♡"}</span>{label}</Link>)}
    </nav>
  </>;
}
