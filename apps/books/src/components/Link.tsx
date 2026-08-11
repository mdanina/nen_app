import type { MouseEvent, ReactNode } from "react";
import { href } from "../app/routes";

// href получает внутренний маршрут, в разметку уходит адрес с префиксом сайта:
// ссылка должна остаться рабочей и при открытии в новой вкладке.
export function AppLink({ href: route, navigate, children, className, ariaLabel }: { href: string; navigate: (path: string) => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(route);
  };
  return <a href={href(route)} onClick={click} className={className} aria-label={ariaLabel}>{children}</a>;
}
