import { describe, expect, it } from "vitest";
import rawBooks from "../../../../../data/generated/books.json";
import { collections } from "../../data/collections";
import { emptyFilters, searchBooks } from "./filters";
import { filtersFromUrl, filtersToUrl } from "./url";
import { getPublicOfficialAgeRating } from "./ageRating";
import { getSimilarBooks } from "./similarity";
import { canUseNativeShare, copyTextWithFallback, getBookPermalink, getShareActionLabel, shareWithCopyFallback, tryNativeShare } from "./share";
import type { Book } from "./types";
import { validateBooks } from "./validation";

const book = (overrides: Partial<Book> = {}): Book => ({
  id: "1", slug: "one", title: "Первая", author: "Автор", shortDescription: "История о дружбе", whyRecommended: "Для разговора", ageMin: 6, ageMax: 9, ageLabel: "6–9 лет", readingMode: "both", genres: ["приключения"], themes: ["дружба", "школа"], moods: ["спокойное"], lengthCategory: "short", sensitiveTopics: [], status: "published", ...overrides,
});

describe("validateBooks", () => {
  it("не ломает каталог из-за одной плохой записи", () => { const result = validateBooks([book(), { id: "bad" }]); expect(result.items).toHaveLength(1); expect(result.issues.length).toBeGreaterThan(0); });
  it("отклоняет повторяющиеся slug", () => { const result = validateBooks([book(), book({ id: "2" })]); expect(result.items).toHaveLength(1); expect(result.issues.some((issue) => issue.field === "slug")).toBe(true); });
  it("отклоняет дубль произведения даже с другим id и slug", () => { const result = validateBooks([book(), book({ id: "2", slug: "two" })]); expect(result.items).toHaveLength(1); expect(result.issues.some((issue) => issue.field === "title")).toBe(true); });
  it("не принимает identified без ISBN", () => { const result = validateBooks([book({ identificationStatus: "identified", bookFormats: ["повесть"], lifeSituations: [], emotionalStates: [] })]); expect(result.items).toHaveLength(0); expect(result.issues.some((issue) => issue.field === "identificationStatus")).toBe(true); });
  it("не показывает внешнюю обложку без совпадающего ISBN", () => { const result = validateBooks([book({ identificationStatus: "identified", isbn13: "9785000000001", bookFormats: ["повесть"], lifeSituations: [], emotionalStates: [], sensitiveTopicsReviewed: true, cover: { kind: "external", url: "https://covers.openlibrary.org/b/isbn/9785000000002-L.jpg", rightsStatus: "external-display-only", isbn13: "9785000000002", temporary: true } })]); expect(result.items).toHaveLength(0); expect(result.issues.some((issue) => issue.field === "cover")).toBe(true); });
  it("разрешает пустую аннотацию, если достоверного источника нет", () => { const result = validateBooks([book({ shortDescription: "" })]); expect(result.issues).toEqual([]); expect(result.items).toHaveLength(1); });
});

describe("searchBooks", () => {
  const books = [book({ suitableForBedtime: true }), book({ id: "2", slug: "two", title: "Вторая", themes: ["животные"], moods: ["смешное"], lengthCategory: "medium" }), book({ id: "3", slug: "three", title: "Третья", ageMin: 10, ageMax: 12 })];
  it("возвращает много точных результатов", () => expect(searchBooks(books, { ...emptyFilters, age: 7 }).exact).toHaveLength(2));
  it("возвращает один точный результат", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["животные"] }).exact).toHaveLength(1));
  it("не ослабляет возраст", () => { const result = searchBooks(books, { ...emptyFilters, age: 11, themes: ["несуществующая"] }); expect(result.exact).toHaveLength(0); expect(result.nearby.every((item) => item.book.ageMin <= 11 && item.book.ageMax >= 11)).toBe(true); });
  it("объясняет неизвестную тему", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["космос"] }).nearby[0].relaxed.some((reason) => reason.includes("темы"))).toBe(true));
  it("фильтрует по новым понятным темам", () => {
    const themed = [book({ themes: ["братья и сёстры", "эмоции"] }), book({ id: "2", slug: "two", themes: ["животные"] })];
    expect(searchBooks(themed, { ...emptyFilters, age: 7, themes: ["эмоции"] }).exact.map(({ book: item }) => item.id)).toEqual(["1"]);
  });
  it("предпочитает соседнюю длительность", () => expect(searchBooks(books, { ...emptyFilters, age: 7, lengths: ["very-short"], themes: ["нет"] }).nearby[0].book.lengthCategory).toBe("short"));
  it("выбирает максимальное число совпадений", () => expect(searchBooks(books, { ...emptyFilters, age: 7, themes: ["дружба", "животные"], moods: ["спокойное"] }).nearby[0].book.id).toBe("1"));
  it("понимает запрос перед сном", () => expect(searchBooks(books, { ...emptyFilters, age: 7, search: "почитать перед сном" }).exact[0].book.id).toBe("1"));
  it("фильтрует по издательству", () => {
    const booksByPublisher = [book({ publisher: "Самокат" }), book({ id: "2", slug: "two", title: "Вторая", publisher: "КомпасГид" })];
    expect(searchBooks(booksByPublisher, { ...emptyFilters, publishers: ["Самокат"] }).exact.map((item) => item.book.id)).toEqual(["1"]);
  });
});

describe("publisher filter URL", () => {
  it("сохраняет издательства в постоянных параметрах фильтра", () => {
    const query = filtersToUrl({ ...emptyFilters, publishers: ["Самокат", "Белая ворона"] });
    expect(filtersFromUrl(query).publishers).toEqual(["Самокат", "Белая ворона"]);
  });
});

describe("getSimilarBooks", () => {
  it("не показывает текущую и объясняет сходство", () => { const source = book(); const result = getSimilarBooks(source, [source, book({ id: "2", slug: "two" }), book({ id: "3", slug: "draft", status: "draft" })]); expect(result).toHaveLength(1); expect(result[0].book.id).toBe("2"); expect(result[0].reasons.length).toBeGreaterThan(0); });
});

describe("getPublicOfficialAgeRating", () => {
  it("показывает подтверждённую маркировку с источником", () => expect(getPublicOfficialAgeRating(book({ officialAgeRating: "6+", officialAgeRatingSource: "https://example.com/book" }))).toBe("6+"));
  it("скрывает служебную пометку о необходимости сверки", () => expect(getPublicOfficialAgeRating(book({ officialAgeRating: "0+ — требует сверки по ISBN", officialAgeRatingSource: "https://example.com/book" }))).toBeNull());
  it("не показывает маркировку без источника", () => expect(getPublicOfficialAgeRating(book({ officialAgeRating: "12+" }))).toBeNull());
});

describe("collections", () => {
  it("содержат только существующие книги", () => {
    const bookIds = new Set((rawBooks as Book[]).map((item) => item.id));
    expect(collections.flatMap((collection) => collection.bookIds).filter((id) => !bookIds.has(id))).toEqual([]);
  });
});

describe("book permalinks", () => {
  it("создаёт уникальную постоянную ссылку для каждой книги", () => {
    const books = rawBooks as Book[];
    const paths = books.map((item) => `/books/${item.slug}`);
    expect(new Set(paths).size).toBe(books.length);
    expect(paths.every((path) => /^\/books\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))).toBe(true);
  });

  it("не включает поиск и фильтры в постоянную ссылку", () => {
    expect((rawBooks as Book[]).every((item) => !item.slug.includes("?") && !item.slug.includes("#"))).toBe(true);
    expect(getBookPermalink("451-gradus-po-farengeytu", "https://books.example.test/catalog?q=поиск")).toBe("https://books.example.test/books/451-gradus-po-farengeytu");
    expect(getShareActionLabel(true)).toBe("Поделиться");
    expect(getShareActionLabel(false)).toBe("Скопировать ссылку");
  });
});

describe("book sharing compatibility", () => {
  const data = { title: "Книга", url: "https://books.example.test/books/kniga" };

  it("использует системное меню в Safari на iPhone", async () => {
    let shareCalled = false;
    expect(canUseNativeShare(data, { secure: true, share: async () => undefined })).toBe(true);
    expect(await tryNativeShare(data, { secure: true, share: async () => { shareCalled = true; } })).toBe(true);
    expect(shareCalled).toBe(true);
  });

  it("проверяет данные перед системным меню в Chrome на Android", () => {
    expect(canUseNativeShare(data, { secure: true, share: async () => undefined, canShare: () => true })).toBe(true);
    expect(canUseNativeShare(data, { secure: true, share: async () => undefined, canShare: () => false })).toBe(false);
  });

  it("выбирает копирование в десктопном браузере без Web Share API", () => {
    expect(canUseNativeShare(data, { secure: true })).toBe(false);
  });

  it("переходит к копированию, если webview отклоняет Web Share", async () => {
    expect(await tryNativeShare(data, { secure: true, share: async () => { throw new Error("blocked"); } })).toBe(false);
  });

  it("копирует ссылку тем же первым кликом, если desktop Chrome не поддерживает Web Share", async () => {
    let copied = "";
    expect(await shareWithCopyFallback(data, { secure: true }, {
      clipboardWrite: async (text) => { copied = text; },
      legacyCopy: () => false,
    })).toBe("copied");
    expect(copied).toBe(data.url);
  });

  it("копирует ссылку тем же первым кликом, если desktop Safari отклоняет Web Share", async () => {
    let copied = "";
    expect(await shareWithCopyFallback(data, {
      secure: true,
      share: async () => { throw new Error("not supported in this context"); },
    }, {
      clipboardWrite: async (text) => { copied = text; },
      legacyCopy: () => false,
    })).toBe("copied");
    expect(copied).toBe(data.url);
  });

  it("использует DOM-fallback, если Clipboard API отклоняет запись", async () => {
    let fallbackCalled = false;
    const copied = await copyTextWithFallback(data.url, {
      clipboardWrite: async () => { throw new Error("denied"); },
      legacyCopy: () => { fallbackCalled = true; return true; },
    });
    expect(copied).toBe(true);
    expect(fallbackCalled).toBe(true);
  });
});
