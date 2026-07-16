import type { Book } from "./types";

export interface SimilarBook { book: Book; score: number; reasons: string[]; }
export function getSimilarBooks(source: Book, books: Book[], limit = 4): SimilarBook[] {
  const explicit = new Set(source.similarBookIds ?? []);
  return books.filter((book) => book.id !== source.id && book.status === "published").map((book) => {
    const reasons: string[] = []; let score = explicit.has(book.id) ? 1000 : 0;
    const ageOverlap = Math.max(0, Math.min(source.ageMax, book.ageMax) - Math.max(source.ageMin, book.ageMin) + 1);
    if (ageOverlap) { score += ageOverlap * 4; reasons.push("похожий возраст"); }
    const themes = book.themes.filter((v) => source.themes.includes(v)); if (themes.length) { score += themes.length * 8; reasons.push(`общие темы: ${themes.slice(0, 2).join(", ")}`); }
    const genres = book.genres.filter((v) => source.genres.includes(v)); if (genres.length) { score += genres.length * 5; reasons.push(`похожий жанр`); }
    const moods = book.moods.filter((v) => source.moods.includes(v)); if (moods.length) { score += moods.length * 3; reasons.push("близкое настроение"); }
    if (book.readingMode === source.readingMode || book.readingMode === "both") { score += 5; reasons.push("тот же формат чтения"); }
    if (book.lengthCategory && book.lengthCategory === source.lengthCategory) score += 3;
    return { book, score, reasons };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title, "ru")).slice(0, limit);
}
