import { describe, expect, it } from "vitest";
import { BASE_PATH, bookPath, href, ROUTES, toRoute } from "./routes";

describe("маршруты внутри подкаталога сайта", () => {
  it("собирает внешний адрес с префиксом сайта", () => {
    expect(href(ROUTES.home)).toBe(`${BASE_PATH}/`);
    expect(href(ROUTES.catalog)).toBe(`${BASE_PATH}/katalog/`);
    expect(href(bookPath("kolobok"))).toBe(`${BASE_PATH}/kniga/kolobok/`);
  });

  it("к файлам сборки слэш не приписывается", () => {
    expect(href("/data/catalog-index.json")).toBe(`${BASE_PATH}/data/catalog-index.json`);
    expect(href("/covers/ab12.webp")).toBe(`${BASE_PATH}/covers/ab12.webp`);
  });

  it("снимает префикс сайта с адреса браузера", () => {
    expect(toRoute(`${BASE_PATH}/`)).toBe("/");
    expect(toRoute(`${BASE_PATH}/katalog`)).toBe(ROUTES.catalog);
    expect(toRoute(`${BASE_PATH}/kniga/kolobok`)).toBe("/kniga/kolobok");
  });

  it("не путает завершающий слэш с отдельной страницей", () => {
    expect(toRoute(`${BASE_PATH}/katalog/`)).toBe(ROUTES.catalog);
    expect(toRoute(`${BASE_PATH}/podborki/`)).toBe(ROUTES.collections);
  });

  it("переводит устаревшие английские пути на действующие", () => {
    expect(toRoute("/books")).toBe(ROUTES.catalog);
    expect(toRoute("/catalog")).toBe(ROUTES.catalog);
    expect(toRoute("/books/kolobok")).toBe("/kniga/kolobok");
    expect(toRoute("/catalog/kolobok")).toBe("/kniga/kolobok");
    expect(toRoute("/collections/vybor-redakcii")).toBe("/podborki/vybor-redakcii");
    expect(toRoute("/recommend")).toBe(ROUTES.recommend);
    expect(toRoute("/favorites")).toBe(ROUTES.favorites);
  });

  it("незнакомый адрес остаётся собой — его разберёт страница 404", () => {
    expect(toRoute(`${BASE_PATH}/chego-to-net`)).toBe("/chego-to-net");
  });
});
