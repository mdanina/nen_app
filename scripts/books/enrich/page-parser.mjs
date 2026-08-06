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

function decodeHtml(value = "") {
  return String(value).replace(/&amp;/giu, "&").replace(/&quot;|&#34;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'").replace(/&nbsp;|&#160;/giu, " ");
}

function imageValues(value) {
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (value && typeof value === "object") return imageValues(value.url ?? value.contentUrl ?? value.thumbnailUrl);
  return value ? [String(value)] : [];
}

function imageAttributes(tag = "") {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/giu)].map((match) => [match[1].toLowerCase(), decodeHtml(match[2])]));
}

export function extractProductImages(html = "", baseUrl) {
  const candidates = [];
  const add = (raw, source, context = "", priority = 0, position = -1) => {
    for (const value of imageValues(raw)) {
      for (const part of String(value).split(/\s*,\s*/u)) {
        const src = part.trim().split(/\s+/u)[0];
        let url;
        try { url = new URL(src, baseUrl).href; } catch { continue; }
        if (!url.startsWith("https://") || /(?:logo|favicon|placeholder|no[-_]?image|item[-_]?no[-_]?cover|social[-_]?fb|avatar|sprite|icon)/iu.test(url)) continue;
        candidates.push({ url, source, context: decodeHtml(context), priority, position });
      }
    }
  };
  for (const item of jsonLd(html)) {
    const types = (Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]).map(String);
    if (types.some((type) => /^(?:book|product)$/iu.test(type))) add(item.image, "json_ld_product", item.name, 100);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    const attrs = imageAttributes(match[0]);
    const context = [attrs.alt, attrs.title, attrs.class].filter(Boolean).join(" ");
    const gallery = /(?:product|book|cover|gallery|woocommerce|wp-post-image)/iu.test(context);
    for (const key of ["data-zoom-image", "data-large_image", "data-src", "data-lazy-src", "data-original", "srcset", "data-srcset", "src"]) {
      if (attrs[key]) add(attrs[key], `img_${key}`, context, gallery ? 85 : 45, match.index);
    }
  }
  add(meta(html, "og:image"), "open_graph", meta(html, "og:title"), 25);
  const best = new Map();
  for (const item of candidates) if (!best.has(item.url) || best.get(item.url).priority < item.priority) best.set(item.url, item);
  return [...best.values()].sort((left, right) => right.priority - left.priority);
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
  const marketplaceImage = html.match(/<img[^>]+data-a-image-name=["']landingImage["'][^>]+(?:data-a-dynamic-image=["'][^"']*?(https:\/\/[^&"']+)|src=["'](https:\/\/[^"']+))/iu);
  const image = imageUrl(structured.image ?? meta(html, "og:image") ?? marketplaceImage?.[1] ?? marketplaceImage?.[2], url);
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
