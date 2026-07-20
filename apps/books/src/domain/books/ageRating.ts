import type { Book } from "./types";

const publicAgeRating = /^(0|6|12|16|18)\+$/;

export function getPublicOfficialAgeRating(book: Book): string | null {
  if (!book.officialAgeRatingSource || !book.officialAgeRating) return null;
  return publicAgeRating.test(book.officialAgeRating.trim()) ? book.officialAgeRating.trim() : null;
}
