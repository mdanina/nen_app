// Заголовки страниц собираются и на сборке (постоянные страницы), и в приложении.
// Правило одно: аудиторию называем по возрастной рекомендации, а не одним шаблоном.

export function audienceLabel({ ageMin, ageMax }) {
  if (ageMin >= 12) return "книга для подростков";
  if (ageMax <= 6) return "книга для дошкольников";
  return "книга для детей";
}

export function bookTitleTag(book) {
  const age = book.ageLabel ? ` ${book.ageLabel}` : "";
  return `${book.title} — ${audienceLabel(book)}${age} | НЭН`;
}

export function catalogAudience(books) {
  const ages = books.map((book) => book.ageMin).filter(Number.isFinite);
  if (!ages.length) return "";
  return `В каталоге ${books.length} книг с рекомендациями от ${Math.min(...ages)} лет.`;
}
