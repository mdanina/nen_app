import { normalizeLanguage, normalizedIsbn, validPages, validYear } from "./core.mjs";

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "iu"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "iu"))?.[1]
    ?? "",
  ).replaceAll("&amp;", "&").trim();
}

function text(html = "") {
  return String(html).replace(/<script\b[\s\S]*?<\/script>/giu, " ").replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"").replace(/&laquo;/giu, "«").replace(/&raquo;/giu, "»").replace(/\s+/gu, " ").trim();
}

function jsonLd(html = "") {
  const result = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const value = queue.shift();
        if (!value || typeof value !== "object") continue;
        result.push(value);
        if (Array.isArray(value["@graph"])) queue.push(...value["@graph"]);
      }
    } catch { /* invalid analytics block */ }
  }
  return result;
}

function names(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
}

function imageUrl(value, baseUrl) {
  const raw = Array.isArray(value) ? value[0] : typeof value === "object" ? value?.url : value;
  try { return raw ? new URL(raw, baseUrl).href : undefined; } catch { return undefined; }
}

export function parseBookPage(html, url, fallback = {}) {
  const visible = text(html);
  const structured = jsonLd(html).find((item) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return types.some((type) => /^(?:book|product)$/iu.test(String(type ?? "")));
  }) ?? {};
  const title = String(structured.name ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? meta(html, "og:title"))
    .replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  const isbnCandidates = [structured.isbn, ...visible.matchAll(/97[89](?:[\s-]*\d){10}/gu)].flatMap((value) => {
    const raw = Array.isArray(value) ? value[0] : value?.[0] ?? value;
    return normalizedIsbn(raw) ?? [];
  });
  const yearText = structured.datePublished
    ?? visible.match(/(?:год\s+(?:издания|выпуска|публикации)|издано)\D{0,30}((?:19|20)\d{2})/iu)?.[1];
  const pagesText = structured.numberOfPages
    ?? visible.match(/(?:количество\s+страниц|объ[её]м|страниц)\D{0,20}(\d{1,4})/iu)?.[1];
  const publisher = String(structured.publisher?.name ?? structured.brand?.name ?? fallback.publisher ?? "").trim() || undefined;
  const seriesName = String(structured.isPartOf?.name ?? "").trim() || undefined;
  const image = imageUrl(structured.image ?? meta(html, "og:image"), url);
  const structuredAuthors = names(structured.author);
  const visibleAuthor = visible.match(/(?:^|\s)Автор(?:ы)?\s+(.{2,100}?)(?=\s+(?:Художник|Иллюстратор|Перевод|Издательство|ISBN|Серия|Возраст|Количество|Кол-во|Артикул)\b)/iu)?.[1]?.trim();
  return {
    title,
    authors: structuredAuthors.length ? structuredAuthors : visibleAuthor ? [visibleAuthor] : [],
    evidenceText: visible.slice(0, 25_000),
    isbn13: isbnCandidates[0],
    publisher,
    publicationYear: validYear(yearText),
    pages: validPages(pagesText),
    seriesName,
    language: normalizeLanguage(structured.inLanguage) ?? "ru",
    coverUrl: image && !/(?:logo|favicon|default|placeholder)/iu.test(image) ? image : undefined,
  };
}
