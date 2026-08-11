// Русские числительные: 1 книга, 2 книги, 5 книг, 11 книг, 21 книга, 24 книги.

export function pluralForm(count: number, [one, few, many]: readonly [string, string, string]) {
  const value = Math.abs(Math.trunc(count));
  const tens = value % 100;
  if (tens >= 11 && tens <= 14) return many;
  const units = value % 10;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

export const plural = (count: number, forms: readonly [string, string, string]) => `${count} ${pluralForm(count, forms)}`;

export const BOOKS = ["книга", "книги", "книг"] as const;
export const RECOMMENDATIONS = ["рекомендация", "рекомендации", "рекомендаций"] as const;
export const PAGES = ["страница", "страницы", "страниц"] as const;
