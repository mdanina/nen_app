import type { Book } from "./types";

// Один шаблон на весь каталог обещал «книгу для детей» и там, где книга подростковая.
// Аудиторию называем по возрастной рекомендации НЭН.
export function audienceLabel(book: Pick<Book, "ageMin" | "ageMax">) {
  if (book.ageMin >= 12) return "книга для подростков";
  if (book.ageMax <= 6) return "книга для дошкольников";
  return "книга для детей";
}

export function bookTitleTag(book: Pick<Book, "title" | "ageMin" | "ageMax" | "ageLabel">) {
  const age = book.ageLabel ? ` ${book.ageLabel}` : "";
  return `${book.title} — ${audienceLabel(book)}${age} | НЭН`;
}

export function bookDescriptionTag(book: Pick<Book, "title" | "author" | "shortDescription" | "ageMin" | "ageMax">) {
  const description = book.shortDescription?.trim();
  if (description) return description;
  const author = book.author ? `${book.author}. ` : "";
  return `${author}${book.title} — ${audienceLabel(book)} в каталоге рекомендаций НЭН.`;
}
