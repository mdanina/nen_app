import type { MouseEvent, ReactNode } from "react";

export type Navigate = (href: string) => void;

export function Link({ href, navigate, children, className, ariaLabel }: { href: string; navigate: Navigate; children: ReactNode; className?: string; ariaLabel?: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={onClick} className={className} aria-label={ariaLabel}>{children}</a>;
}
