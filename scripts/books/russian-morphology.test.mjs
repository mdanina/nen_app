import assert from "node:assert/strict";
import test from "node:test";
import { fixGeneratedAuthorCases, inflectRussianNameGenitive } from "./russian-morphology.mjs";

test("склоняет русские фамилии по морфологическим правилам", () => {
  assert.equal(inflectRussianNameGenitive("Иван Крылов"), "Ивана Крылова");
  assert.equal(inflectRussianNameGenitive("Александр Пушкин"), "Александра Пушкина");
  assert.equal(inflectRussianNameGenitive("Виктор Драгунский"), "Виктора Драгунского");
  assert.equal(inflectRussianNameGenitive("Николай Носов"), "Николая Носова");
  assert.equal(inflectRussianNameGenitive("Агния Барто"), "Агнии Барто");
});

test("исправляет только автоматически сформированные сочетания с именем автора", () => {
  assert.equal(fixGeneratedAuthorCases("В книгу вошли басни Иван Крылов.", "Иван Крылов"), "В книгу вошли басни Ивана Крылова.");
  assert.equal(fixGeneratedAuthorCases("Здесь сказки Александр Пушкин.", "Александр Пушкин"), "Здесь сказки Александра Пушкина.");
  assert.equal(fixGeneratedAuthorCases("Стихи уже описаны корректно.", "Агния Барто"), "Стихи уже описаны корректно.");
});
