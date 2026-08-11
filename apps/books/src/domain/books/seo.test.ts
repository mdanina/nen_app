import { describe, expect, it } from "vitest";
import { audienceLabel, bookDescriptionTag, bookTitleTag } from "./seo";

describe("заголовок страницы книги", () => {
  it("не называет подростковую антиутопию книгой для детей", () => {
    const title = bookTitleTag({ title: "451 градус по Фаренгейту", ageMin: 14, ageMax: 17, ageLabel: "14–17 лет" });
    expect(title).toBe("451 градус по Фаренгейту — книга для подростков 14–17 лет | НЭН");
    expect(title).not.toContain("для детей");
  });

  it("различает дошкольников, детей и подростков", () => {
    expect(audienceLabel({ ageMin: 2, ageMax: 4 })).toBe("книга для дошкольников");
    expect(audienceLabel({ ageMin: 7, ageMax: 12 })).toBe("книга для детей");
    expect(audienceLabel({ ageMin: 12, ageMax: 17 })).toBe("книга для подростков");
  });

  it("описание берётся из аннотации, а без неё собирается из автора и возраста", () => {
    expect(bookDescriptionTag({ title: "Колобок", author: "Народная сказка", shortDescription: "Колобок убегает от дедушки.", ageMin: 2, ageMax: 4 })).toBe("Колобок убегает от дедушки.");
    expect(bookDescriptionTag({ title: "Колобок", author: "Народная сказка", shortDescription: "", ageMin: 2, ageMax: 4 }))
      .toBe("Народная сказка. Колобок — книга для дошкольников в каталоге рекомендаций НЭН.");
  });
});
