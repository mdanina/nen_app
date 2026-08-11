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

// Ниже этой отметки от конца страницы панель уступает место подвалу сайта.
const BOTTOM_GAP = 120;
// Пока страница едва прокручивается, прятать нечего: панель нужна всё время.
const MIN_SCROLLABLE = 240;

/**
 * Панель уступает место подвалу сайта, но только у самого низа страницы.
 * Раньше она пряталась, как только подвал попадал в кадр, — на короткой
 * странице вроде подбора книги он виден сразу, и панель исчезала совсем.
 * Баннер про куки сайт крепит снизу с z-index 1000, поэтому панель ниже него.
 */
function useHiddenAtPageBottom() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const { scrollHeight } = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const scrollable = scrollHeight - window.innerHeight;
      setHidden(scrollable > MIN_SCROLLABLE && scrolled >= scrollHeight - BOTTOM_GAP);
    };
    const schedule = () => { frame ||= requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return hidden;
}

export function Header({ navigate, favoriteCount, route }: { navigate: (path: string) => void; favoriteCount: number; route: string }) {
  const hiddenAtBottom = useHiddenAtPageBottom();
  const isActive = (target: string) => route === target
    || route.startsWith(`${target}/`)
    || (target === ROUTES.catalog && route.startsWith(`${ROUTES.book}/`));

  return <>
    <nav className="service-nav" aria-label="Разделы сервиса «Что почитать с детьми»">
      <div className="service-nav__inner">
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
    <nav className={`service-tabbar${hiddenAtBottom ? " is-hidden" : ""}`} aria-label="Разделы сервиса">
      {LINKS.map(([target, label, icon]) => (
        <AppLink key={target} href={target} navigate={navigate} className={isActive(target) ? "active" : ""}>
          <span aria-hidden="true">{icon}</span>
          <small>{label}{target === ROUTES.favorites && favoriteCount > 0 ? ` (${favoriteCount})` : ""}</small>
        </AppLink>
      ))}
    </nav>
  </>;
}
