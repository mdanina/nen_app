import type { MouseEvent, ReactNode } from "react";
export function AppLink({ href, navigate, children, className, ariaLabel }: { href: string; navigate: (path: string) => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => { if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(href); } };
  return <a href={href} onClick={click} className={className} aria-label={ariaLabel}>{children}</a>;
}
