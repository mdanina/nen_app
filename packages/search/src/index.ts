export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^a-zа-я0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

export function searchTokens(value: string): string[] {
  return normalizeSearch(value).split(" ").filter(Boolean);
}

export function matchesText(haystack: string, query: string): boolean {
  const source = normalizeSearch(haystack);
  return searchTokens(query).every((token) => source.includes(token));
}
