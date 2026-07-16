import type { ReactNode } from "react";

export function Icon({ name }: { name: "heart" | "search" | "close" | "filter" | "arrow" }) {
  const paths = {
    heart: <path d="M12 21s-7-4.4-9.4-8.4C.4 8.9 2.3 5 6.2 5c2.1 0 3.4 1.2 3.8 2 .4-.8 1.7-2 3.8-2 3.9 0 5.8 3.9 3.6 7.6C15 16.6 12 21 12 21Z" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
    filter: <><path d="M4 7h16M7 12h10M10 17h4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="empty-state" role="status"><h2>{title}</h2><div>{children}</div>{action}</section>;
}

export function SkeletonGrid() {
  return <div className="book-grid" aria-label="Загрузка книг">{Array.from({ length: 4 }, (_, i) => <div className="skeleton-card" key={i}><span/><i/><i/></div>)}</div>;
}
