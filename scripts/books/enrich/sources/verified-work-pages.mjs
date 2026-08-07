import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchText } from "../http.mjs";
import { parseBookPage } from "../page-parser.mjs";

function labirintCover(url) {
  const id = url.match(/\/books\/(\d+)/u)?.[1];
  return id ? `https://imo10.labirint.ru/books/${id}/cover.jpg/484-0` : undefined;
}

export function createVerifiedWorkPagesSource({ root } = {}) {
  let records = new Map();
  return {
    key: "verified-work-pages",
    priority: 95,
    coverageComplete: () => false,
    async init() {
      const input = JSON.parse(await readFile(resolve(root, "data/source/verified-work-cover-pages.json"), "utf8"));
      records = new Map(input.map((item) => [item.id, item]));
    },
    async search(book) {
      const record = records.get(book.id);
      if (!record) return [];
      let parsed = {};
      try {
        parsed = parseBookPage(await fetchText(record.sourcePageUrl, { attempts: 2, timeoutMs: 30_000, headers: { "user-agent": "Mozilla/5.0" } }), record.sourcePageUrl);
      } catch { /* the exact Labirint image pattern may still be available */ }
      const coverUrl = record.coverUrl ?? parsed.coverUrl ?? labirintCover(record.sourcePageUrl);
      if (!coverUrl) return [];
      return [{
        ...parsed,
        title: record.title,
        authors: record.authors,
        evidenceText: `${record.title} ${record.authors.join(" ")} ${parsed.evidenceText ?? ""}`,
        sourceKey: "verified-work-pages",
        sourceName: record.sourceName,
        sourceUrl: record.sourcePageUrl,
        sourceRecordId: new URL(record.sourcePageUrl).pathname,
        sourcePriority: 95,
        officialPublisher: record.officialPublisher === true,
        trustedCoverSource: true,
        confidence: 0.97,
        cover: {
          official: true,
          url: coverUrl,
          productMain: parsed.coverEvidence === "product_main",
          attribution: record.officialPublisher ? "Обложка предоставлена издательством." : `Обложка: ${record.sourceName}.`,
        },
      }];
    },
  };
}
