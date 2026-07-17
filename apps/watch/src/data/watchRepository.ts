import type { Cartoon, ContentType, FilterDictionary, Movie, WatchTitle } from "../domain/catalog/types";
import { isCartoon, validateCatalog, type ValidationIssue } from "../domain/catalog/validation";
import { StaticWatchDataSource, type WatchDataSource } from "./watchDataSource";

export class CatalogValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`Watch catalog contains ${issues.length} validation issue(s)`);
    this.name = "CatalogValidationError";
  }
}

export interface WatchRepository {
  getAllCartoons(): Promise<Cartoon[]>;
  getAllMovies(): Promise<Movie[]>;
  getBySlug(slug: string): Promise<WatchTitle | null>;
  getByIds(ids: readonly string[]): Promise<WatchTitle[]>;
  getFilterDictionary(contentType: ContentType): Promise<FilterDictionary>;
}

const uniqueStrings = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));

export class InMemoryWatchRepository implements WatchRepository {
  private constructor(private readonly items: WatchTitle[]) {}

  static async create(dataSource: WatchDataSource): Promise<InMemoryWatchRepository> {
    const result = validateCatalog(await dataSource.load());
    if (result.issues.length) throw new CatalogValidationError(result.issues);
    return new InMemoryWatchRepository(result.items);
  }

  async getAllCartoons() {
    return this.items.filter(isCartoon);
  }

  async getAllMovies() {
    return this.items.filter((item): item is Movie => item.contentType === "movie");
  }

  async getBySlug(slug: string) {
    return this.items.find((item) => item.slug === slug) ?? null;
  }

  async getByIds(ids: readonly string[]) {
    const byId = new Map(this.items.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WatchTitle => Boolean(item));
  }

  async getFilterDictionary(contentType: ContentType): Promise<FilterDictionary> {
    const items = this.items.filter((item) => item.contentType === contentType);
    return {
      countries: uniqueStrings(items.flatMap((item) => item.country)),
      years: [...new Set(items.map((item) => item.year))].sort((a, b) => b - a),
      contentFormats: uniqueStrings(items.map((item) => item.contentFormat)) as FilterDictionary["contentFormats"],
      moods: uniqueStrings(items.flatMap((item) => item.mood)) as FilterDictionary["moods"],
      themes: uniqueStrings(items.flatMap((item) => item.themes)),
      sensitiveTopics: uniqueStrings(items.flatMap((item) => item.sensitiveTopics)),
      discussionPotentials: uniqueStrings(items.map((item) => item.discussionPotential)) as FilterDictionary["discussionPotentials"],
      releaseForms: uniqueStrings(items.map((item) => item.releaseForm)) as FilterDictionary["releaseForms"],
    };
  }
}

export function createWatchRepository(dataSource: WatchDataSource = new StaticWatchDataSource()) {
  return InMemoryWatchRepository.create(dataSource);
}
