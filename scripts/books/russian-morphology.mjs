function preserveCase(source, value) {
  if (source === source.toLocaleUpperCase("ru")) return value.toLocaleUpperCase("ru");
  if (source[0] === source[0]?.toLocaleUpperCase("ru")) return `${value[0].toLocaleUpperCase("ru")}${value.slice(1)}`;
  return value;
}

function inflectToken(token, { surname = false, feminine = false } = {}) {
  if (!token || /^[А-ЯЁA-Z]\.?$/u.test(token) || /[^\p{L}-]/u.test(token)) return token;
  const lower = token.toLocaleLowerCase("ru");
  let result;
  if (/(?:ская|цкая)$/u.test(lower)) result = lower.replace(/ая$/u, "ой");
  else if (/яя$/u.test(lower)) result = lower.replace(/яя$/u, "ей");
  else if (surname && /(?:ова|ева|ёва|ина|ына)$/u.test(lower)) result = `${lower.slice(0, -1)}ой`;
  else if (/(?:ский|цкий)$/u.test(lower)) result = `${lower.slice(0, -2)}ого`;
  else if (/ой$/u.test(lower)) result = `${lower.slice(0, -2)}ого`;
  else if (/ый$/u.test(lower)) result = `${lower.slice(0, -2)}ого`;
  else if (feminine && surname && /[бвгджзклмнпрстфхцчшщ]$/u.test(lower)) result = lower;
  else if (/[оеиуыэю]$/u.test(lower)) result = lower;
  else if (/а$/u.test(lower)) result = `${lower.slice(0, -1)}${/[гкхжчшщц]$/u.test(lower.slice(0, -1)) ? "и" : "ы"}`;
  else if (/я$/u.test(lower)) result = `${lower.slice(0, -1)}и`;
  else if (/ий$/u.test(lower)) result = `${lower.slice(0, -2)}ия`;
  else if (/ей$/u.test(lower)) result = `${lower.slice(0, -2)}ея`;
  else if (/й$/u.test(lower)) result = `${lower.slice(0, -1)}я`;
  else if (/ь$/u.test(lower)) result = `${lower.slice(0, -1)}я`;
  else if (/[бвгджзклмнпрстфхцчшщ]$/u.test(lower)) result = `${lower}а`;
  else result = lower;
  return preserveCase(token, result);
}

export function inflectRussianNameGenitive(name) {
  const parts = String(name).trim().split(/\s+/);
  if (!parts.length) return name;
  const firstWord = parts.find((part) => !/^[А-ЯЁA-Z]\.?$/u.test(part)) ?? "";
  const feminine = /[ая]$/iu.test(firstWord);
  return parts.map((part, index) => inflectToken(part, { surname: index === parts.length - 1, feminine })).join(" ");
}

export function fixGeneratedAuthorCases(value, author) {
  if (!value || !author || author.includes(";")) return value;
  const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(басни|сказки|рассказы|произведения|стихи)\\s+${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  return value.replace(pattern, (_, noun) => `${noun} ${inflectRussianNameGenitive(author)}`);
}
