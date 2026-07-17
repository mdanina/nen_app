import { useEffect, useState } from "react";
import { resolveBookCover } from "../domain/books/cover";
import type { Book } from "../domain/books/types";

export function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const presentation = resolveBookCover(book);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const source = presentation.kind === "image" ? presentation.url : "placeholder";
  useEffect(() => { setFailed(false); setLoaded(false); }, [book.id, source]);
  useEffect(() => {
    if (presentation.kind !== "image" || loaded || failed) return;
    const timeout = window.setTimeout(() => setFailed(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [presentation.kind, source, loaded, failed]);

  if (presentation.kind === "image" && !failed) {
    return <img className={`book-cover${large ? " book-cover--large" : ""}`} src={presentation.url} alt={`Обложка книги «${book.title}»`} loading={large ? "eager" : "lazy"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />;
  }

  const tone = presentation.kind === "placeholder" ? presentation.tone : [...book.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  return <div className={`book-cover book-cover--placeholder tone-${tone}${large ? " book-cover--large" : ""}`} role="img" aria-label={`Фирменная обложка НЭН для книги «${book.title}»`}>
    <small>НЭН рекомендует</small><strong>{book.title}</strong><span>{book.author}</span>
  </div>;
}
