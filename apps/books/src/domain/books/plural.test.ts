import { describe, expect, it } from "vitest";
import { BOOKS, plural, pluralForm, RECOMMENDATIONS } from "./plural";

describe("склонение числительных", () => {
  it("выбирает форму по последней цифре", () => {
    expect(pluralForm(1, BOOKS)).toBe("книга");
    expect(pluralForm(2, BOOKS)).toBe("книги");
    expect(pluralForm(4, BOOKS)).toBe("книги");
    expect(pluralForm(5, BOOKS)).toBe("книг");
    expect(pluralForm(0, BOOKS)).toBe("книг");
  });

  it("второй десяток — исключение", () => {
    for (const count of [11, 12, 13, 14]) expect(pluralForm(count, BOOKS)).toBe("книг");
  });

  it("правильно склоняет за пределами первой сотни", () => {
    expect(plural(21, BOOKS)).toBe("21 книга");
    expect(plural(22, BOOKS)).toBe("22 книги");
    expect(plural(25, BOOKS)).toBe("25 книг");
    expect(plural(101, BOOKS)).toBe("101 книга");
    expect(plural(111, BOOKS)).toBe("111 книг");
    expect(plural(2500, BOOKS)).toBe("2500 книг");
  });

  it("подборка не обещает «4 рекомендаций»", () => {
    expect(plural(4, RECOMMENDATIONS)).toBe("4 рекомендации");
    expect(plural(1, RECOMMENDATIONS)).toBe("1 рекомендация");
    expect(plural(10, RECOMMENDATIONS)).toBe("10 рекомендаций");
  });
});
