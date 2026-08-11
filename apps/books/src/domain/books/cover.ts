import { href } from "../../app/routes";
import type { Book, BookCoverData } from "./types";

const displayableRights = new Set(["licensed", "open-license", "public-domain", "external-display-only"]);

export type CoverPresentation =
  | { kind: "image"; url: string; temporary: boolean; attribution?: string }
  | { kind: "placeholder"; tone: number };

export function placeholderTone(id: string): number {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
}

function approvedCover(cover?: BookCoverData): cover is BookCoverData & { url: string } {
  if (!cover?.url || cover.kind === "placeholder") return false;
  if (!displayableRights.has(cover.rightsStatus)) return false;
  if (cover.kind === "external") return cover.rightsStatus === "external-display-only";
  return cover.kind === "local";
}

export function resolveBookCover(book: Book): CoverPresentation {
  if (approvedCover(book.cover)) {
    // Копия в кеше НЭН надёжнее исходника: чужой CDN может закрыть хотлинк
    // или переименовать файл, и витрина каталога опустеет.
    const url = book.cover.cachedPath ? href(book.cover.cachedPath) : book.cover.url;
    return { kind: "image", url, temporary: Boolean(book.cover.temporary), attribution: book.cover.attribution };
  }
  if (!book.cover && book.coverUrl) return { kind: "image", url: book.coverUrl, temporary: true };
  return { kind: "placeholder", tone: placeholderTone(book.id) };
}
