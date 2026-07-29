import { describe, expect, it } from "vitest";
import type { WatchV2Title } from "./watchV2";
import { isWatchV2Title, validateWatchV2Record } from "./watchV2Validation";

const fullRecord: WatchV2Title = {
  schemaVersion: 2,
  id: "watch-cartoon-spirited-away",
  slug: "unesennye-prizrakami",
  title: "Унесённые призраками",
  originalTitle: "Sen to Chihiro no kamikakushi",
  kind: "animated-feature",
  shortDescription: "Тихиро оказывается в мире духов и ищет способ спасти родителей и вернуться домой.",
  whyRecommended: "История помогает поговорить о самостоятельности, страхе и ответственности за свои решения.",
  country: ["Япония"],
  year: 2001,
  duration: { minutes: 125 },
  genres: ["фэнтези", "приключения"],
  themes: ["семья", "смелость", "взросление"],
  discussionTopics: ["Что помогло Тихиро стать увереннее?", "Почему герои меняются в сложных обстоятельствах?"],
  mood: ["приключенческое", "вдумчивое"],
  sensitiveTopics: ["превращение родителей", "пугающие существа"],
  nenAgeRecommendation: { minAge: 8, maxAge: 14, rationale: "Сложный образный сюжет и несколько тревожных сцен требуют обсуждения со взрослым." },
  officialRating: { value: "12+", sourceUrl: "https://example.org/official-rating", sourceTitle: "Карточка российского релиза" },
};

const minimalRecord: WatchV2Title = {
  schemaVersion: 2,
  id: "watch-movie-minimal",
  slug: "minimalnyi-film",
  title: "Минимальная production-запись",
  kind: "movie",
  shortDescription: "Проверенное краткое описание сюжета произведения без формальных редакционных заглушек.",
  whyRecommended: "Содержательное объяснение того, чем совместный просмотр может быть полезен семье.",
  country: ["Россия"],
  year: 2020,
  duration: { minutes: 90 },
  genres: ["семейный"],
  themes: ["семья"],
  discussionTopics: ["Как меняются отношения героев после пережитых событий?"],
  mood: ["вдумчивое"],
  sensitiveTopics: [],
  nenAgeRecommendation: { minAge: 8, rationale: "Сюжет и эмоциональная нагрузка подходят детям от восьми лет." },
};

describe("watch-v2 model", () => {
  it("accepts complete and minimal production records", () => {
    expect(validateWatchV2Record(fullRecord)).toEqual([]);
    expect(validateWatchV2Record(minimalRecord)).toEqual([]);
    expect(isWatchV2Title(fullRecord)).toBe(true);
  });

  it("allows a record without an unconfirmed official rating", () => {
    expect(validateWatchV2Record(minimalRecord)).toEqual([]);
  });

  it("validates a Russian rating when it is present", () => {
    expect(validateWatchV2Record({ ...minimalRecord, officialRating: { value: "PG", sourceUrl: "" } }).map((issue) => issue.field))
      .toEqual(expect.arrayContaining(["officialRating.value", "officialRating.sourceUrl"]));
  });

  it("requires non-empty discussion topics and allows empty sensitive topics", () => {
    expect(validateWatchV2Record({ ...minimalRecord, discussionTopics: [] }).map((issue) => issue.field)).toContain("discussionTopics");
    expect(validateWatchV2Record({ ...minimalRecord, sensitiveTopics: [] })).toEqual([]);
  });

  it("enforces the 40-minute animation boundary", () => {
    expect(validateWatchV2Record({ ...minimalRecord, kind: "animated-short", duration: { minutes: 41 } }).map((issue) => issue.field)).toContain("duration.minutes");
    expect(validateWatchV2Record({ ...minimalRecord, kind: "animated-feature", duration: { minutes: 40 } }).map((issue) => issue.field)).toContain("duration.minutes");
    expect(validateWatchV2Record({ ...minimalRecord, kind: "animated-short", duration: { minutes: 40 } })).toEqual([]);
    expect(validateWatchV2Record({ ...minimalRecord, kind: "animated-feature", duration: { minutes: 41 } })).toEqual([]);
  });

  it("requires series duration only for animated series", () => {
    const series = { ...minimalRecord, kind: "animated-series", duration: { episodeMinutes: 12, episodeCount: 10 } };
    expect(validateWatchV2Record(series)).toEqual([]);
    expect(validateWatchV2Record({ ...minimalRecord, kind: "animated-series", duration: { minutes: 90 } }).map((issue) => issue.field))
      .toEqual(expect.arrayContaining(["duration", "duration.episodeMinutes"]));
  });

  it("supports live-action series with seasons and a duration range", () => {
    expect(validateWatchV2Record({
      ...minimalRecord,
      kind: "series",
      duration: { episodeMinutes: 42, episodeMinutesMax: 58, episodeCount: 16, seasonCount: 2 },
    })).toEqual([]);
  });

  it("supports documentary films and validates optional frames", () => {
    expect(validateWatchV2Record({
      ...minimalRecord,
      kind: "documentary",
      duration: { minutes: 78 },
      frame: { url: "https://example.org/frame.jpg", studios: ["Пример студии"] },
    })).toEqual([]);
    expect(validateWatchV2Record({
      ...minimalRecord,
      frame: { url: "not-a-url", studios: [] },
    }).map((issue) => issue.field)).toEqual(expect.arrayContaining(["frame.url", "frame.studios"]));
  });

  it("rejects removed statuses and metadata registries", () => {
    const record = { ...minimalRecord, status: "published", metadataStatus: "complete", verificationStatus: "verified", metadataSources: [] };
    expect(validateWatchV2Record(record).map((issue) => issue.field)).toEqual(expect.arrayContaining([
      "status", "metadataStatus", "verificationStatus", "metadataSources",
    ]));
  });

  it("rejects formal editorial placeholders", () => {
    const record = { ...minimalRecord, whyRecommended: "Заглушка: заполнить позже, когда редакция подготовит нормальный текст." };
    expect(validateWatchV2Record(record).map((issue) => issue.field)).toContain("whyRecommended");
  });

  it.each([
    ["mood", { mood: ["саркастическое"] }],
    ["genres", { genres: ["неизвестный жанр"] }],
    ["themes", { themes: ["неизвестная тема"] }],
  ])("rejects values outside the %s dictionary", (field, change) => {
    expect(validateWatchV2Record({ ...minimalRecord, ...change }).map((issue) => issue.field)).toContain(field);
  });
});
