import { describe, expect, it } from "vitest";
import productionBooks from "../../../../../data/generated/books.json";
import curatedPublisherSource from "../../../../../data/source/curated-publisher-books.json";
import curatedMultiPublisherSource from "../../../../../data/source/curated-multi-publisher-books.json";
import curatedPriorityPublisherSource from "../../../../../data/source/curated-priority-publisher-books.json";
import nenCollectionSource from "../../../../../data/source/nen-collection-books.json";
import importedExclusions from "../../../../../data/source/openlibrary-books-excluded.json";
import ambiguousReview from "../../../../../data/reports/ambiguous-review.json";
import fictionExclusions from "../../../../../data/reports/fiction-catalog-excluded.json";
import maintenanceExclusions from "../../../../../data/source/catalog-maintenance-exclusions.json";
import { StaticBooksRepository } from "../../data/booksRepository";
import { emptyFilters, searchBooks } from "./filters";
import type { Book } from "./types";
import { validateBooks } from "./validation";

describe("connected Open Library catalog", () => {
  const excludedIds = new Set(importedExclusions.map((item) => item.id));
  const fictionExcludedIds = new Set(fictionExclusions.map((item) => item.id));
  const includedImports = productionBooks.filter((book) => book.id.startsWith("ol-"));

  it("publishes only records that survived both exclusion stages", () => {
    expect(productionBooks).toHaveLength(
      529
      + curatedPublisherSource.books.length
      + curatedMultiPublisherSource.books.length
      + curatedPriorityPublisherSource.books.length
      + nenCollectionSource.books.length
      - maintenanceExclusions.length,
    );
    expect(productionBooks.some((book) => excludedIds.has(book.id))).toBe(false);
    expect(productionBooks.some((book) => fictionExcludedIds.has(book.id))).toBe(false);
    expect(importedExclusions.every((item) => item.reason && item.explanation)).toBe(true);
    expect(fictionExclusions.every((item) => item.reason && item.evidence.length > 0)).toBe(true);
    expect(ambiguousReview.every((item) => !productionBooks.some((book) => book.id === item.id))).toBe(true);
  });

  it("includes complete priority-publisher cards without duplicate routes", () => {
    const priorityIds = new Set(curatedPriorityPublisherSource.books.map((book) => book.id));
    const published = productionBooks.filter((book) => priorityIds.has(book.id));

    expect(published).toHaveLength(curatedPriorityPublisherSource.books.length);
    expect(published.every((book) => (
      Boolean(book.title)
      && Boolean(book.author)
      && Boolean(book.publisher)
      && Boolean(book.shortDescription)
      && Boolean(book.whyRecommended)
      && book.genres.length > 0
      && book.themes.length > 0
    ))).toBe(true);
    expect(new Set(published.map((book) => book.slug)).size).toBe(published.length);
  });

  it("passes the current runtime validator", () => {
    const result = validateBooks(productionBooks);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(productionBooks.length);
  });

  it("has stable unique routes and Open Library work provenance", () => {
    const slugs = productionBooks.map((book) => book.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true);

    const workIds = includedImports.flatMap((book) => [
      ...(book.sourceMetadata?.workIds ?? []),
      ...(!book.sourceMetadata?.workIds?.length && book.sourceMetadata?.workId ? [book.sourceMetadata.workId] : []),
    ]);
    expect(new Set(workIds).size).toBe(workIds.length);
  });

  it("uses only exact permanent book paths and safe cover URLs", () => {
    expect(productionBooks.every((book) => `/books/${book.slug}`.split("?").length === 1)).toBe(true);
    const external = includedImports.filter((book) => book.cover?.kind === "external");
    const verifiedCoverSourceHosts = /(?:^|\.)(azbooka\.ru|eksmo\.ru|ast\.ru|rosman\.ru|detlit\.ru|strecoza\.ru|samokatbook\.ru|polyandria\.ru|albuscorvus\.ru|kompasgid\.ru|clever-media\.ru|archipelag-publishing\.ru|alpinabook\.ru|pgbooks\.ru|livebooks\.ru|gvardiya\.ru|melik-pashaev\.ru|books\.ru|book24\.ru|chitai-gorod\.ru|labirint\.ru|moscowbooks\.ru|search\.rsl\.ru|rusneb\.ru|openlibrary\.org|archive\.org|books\.google\.com)$/;
    expect(external.every((book) => {
      const coverUrl = book.cover?.url ?? "";
      const sourcePageUrl = book.cover?.sourcePageUrl;
      if (!sourcePageUrl || !coverUrl.startsWith("https://")) return false;
      const sourceHost = new URL(sourcePageUrl).hostname;
      const bibliographicCoverAttribution = /(?:^|\.)(openlibrary\.org|archive\.org|books\.google\.com)$/.test(sourceHost);
      return (
        verifiedCoverSourceHosts.test(sourceHost)
        && book.cover?.rightsStatus === "external-display-only"
        && (bibliographicCoverAttribution || [
          "Обложка предоставлена издательством.",
          "Обложка опубликована в карточке современного издания.",
          "Обложка: Open Library",
          "Обложка: Google Books",
          "Обложка: Internet Archive",
        ].includes(book.cover?.attribution ?? ""))
      );
    })).toBe(true);
  });

  it("includes imported books in search and every primary filter", () => {
    const books = productionBooks as Book[];
    const imported = books.find((book) => book.id.startsWith("ol-"));
    expect(imported).toBeDefined();
    if (!imported) return;
    const result = searchBooks(books, {
      ...emptyFilters,
      age: imported.ageMin,
      reading: imported.readingMode,
      genres: [imported.genres[0]],
      themes: [imported.themes[0]],
      search: imported.title,
    });
    expect(result.exact.some(({ book }) => book.id === imported.id)).toBe(true);
  });

  it("opens an imported book by slug and keeps its stable id usable by favorites", async () => {
    const books = productionBooks as Book[];
    const imported = books.find((book) => book.id.startsWith("ol-"));
    expect(imported).toBeDefined();
    if (!imported) return;
    const repository = new StaticBooksRepository(books);
    expect(await repository.getBySlug(imported.slug)).toMatchObject({ id: imported.id });
    const favorites = [imported.id];
    expect(books.filter((book) => favorites.includes(book.id))).toEqual([imported]);
  });

  it("never exposes generated template copy as an annotation", () => {
    const prohibited = /(?:относится к жанру|в центре внимания|эта книга рассказывает|это история о|юных читателей ждёт|книга знакомит|автор поднимает важные темы|произведение исследует|трогательная история|добрая история|увлекательная история|книга учит|книга поможет понять|на страницах этой книги)/iu;
    expect(includedImports.some((book) => prohibited.test(book.shortDescription))).toBe(false);
    expect(includedImports.filter((book) => book.shortDescription).every((book) => (
      book.annotationProvenance?.method === "independent_factual_description"
      && Boolean(book.annotationProvenance?.sourceUrl)
    ))).toBe(true);
  });
});
