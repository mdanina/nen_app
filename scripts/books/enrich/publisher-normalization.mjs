import { normalize } from "./core.mjs";

const aliases = [
  [/(?:^|\s)(?:аст|ast|астрель|astrel)(?:\s|$)/u, "АСТ"],
  [/(?:азбука(?: аттикус)?|azbooka(?: atticus)?|махаон|machaon)/u, "Азбука-Аттикус"],
  [/(?:альпина(?: дети)?|alpina(?: children)?)/u, "Альпина.Дети"],
  [/(?:миф(?: детство)?|манн иванов и фербер|mann ivanov ferber)/u, "МИФ.Детство"],
  [/(?:розовый жираф|pink giraffe|rozovyi zhiraf)/u, "Розовый жираф"],
  [/(?:молодая гвардия|molodaya gvardiya|young guard)/u, "Молодая гвардия"],
  [/(?:мелик пашаев|melik pashaev)/u, "Мелик-Пашаев"],
];

export function normalizePublisherName(value) {
  if (!String(value ?? "").trim()) return undefined;
  const key = normalize(value);
  return aliases.find(([pattern]) => pattern.test(key))?.[1] ?? String(value).trim();
}
