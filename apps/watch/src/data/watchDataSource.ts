import productionCatalog from "../../../../data/generated/watch.json";

export interface WatchDataSource {
  load(): Promise<unknown>;
}

export class StaticWatchDataSource implements WatchDataSource {
  constructor(private readonly input: unknown = productionCatalog) {}

  async load(): Promise<unknown> {
    return this.input;
  }
}
