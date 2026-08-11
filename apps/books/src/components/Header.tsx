import { useEffect, useState } from "react";
import { ROUTES } from "../app/routes";
import { AppLink } from "./Link";

// Шапку и подвал рисует сайт: сервис живёт внутри страницы n-e-n.ru.
// Здесь только навигация самого раздела — полоса вкладок в потоке страницы
// на широком экране и панель снизу на телефоне.
const LINKS = [
  [ROUTES.catalog, "Каталог", "▤"],
  [ROUTES.collections, "Подборки", "◇"],
  [ROUTES.recommend, "Подбор книги", "✦"],
  [ROUTES.favorites, "Избранное", "♡"],
] as const;

/**
 * Панель прячется, когда человек дочитал до подвала сайта: иначе она
 * перекрывает форму подписки и нижние ссылки. Баннер про куки сайт крепит
 * снизу с z-index 1000, поэтому панель держится ниже него.
 */
function useHiddenNearSiteFooter() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { rootMargin: "0px 0px -40px 0px" });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  return hidden;
}

export function Header({ navigate, favoriteCount, route }: { navigate: (path: string) => void; favoriteCount: number; route: string }) {
  const hiddenNearFooter = useHiddenNearSiteFooter();
  const isActive = (target: string) => route === target
    || route.startsWith(`${target}/`)
    || (target === ROUTES.catalog && route.startsWith(`${ROUTES.book}/`));

  return <>
    <nav className="service-nav" aria-label="Разделы сервиса «Что почитать с детьми»">
      <div className="service-nav__inner">
        {/* На главной это же название стоит заголовком страницы — второй раз не повторяем. */}
        {route !== ROUTES.home && (
          <AppLink href={ROUTES.home} navigate={navigate} className="service-nav__title">
            Что почитать с детьми
          </AppLink>
        )}
        <div className="service-nav__links">
          {LINKS.map(([target, label]) => (
            <AppLink key={target} href={target} navigate={navigate} className={isActive(target) ? "active" : ""}>
              {label}
              {target === ROUTES.favorites && favoriteCount > 0 && <i aria-hidden="true">{favoriteCount}</i>}
            </AppLink>
          ))}
        </div>
      </div>
    </nav>
    <nav className={`service-tabbar${hiddenNearFooter ? " is-hidden" : ""}`} aria-label="Разделы сервиса">
      {LINKS.map(([target, label, icon]) => (
        <AppLink key={target} href={target} navigate={navigate} className={isActive(target) ? "active" : ""}>
          <span aria-hidden="true">{icon}</span>
          <small>{label}{target === ROUTES.favorites && favoriteCount > 0 ? ` (${favoriteCount})` : ""}</small>
        </AppLink>
      ))}
    </nav>
  </>;
}
