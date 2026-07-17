import sampleCatalog from "../../data/catalog.sample.json";

export interface WatchDataSource {
  load(): Promise<unknown>;
}

export class StaticWatchDataSource implements WatchDataSource {
  constructor(private readonly input: unknown = sampleCatalog) {}

  async load(): Promise<unknown> {
    return this.input;
  }
}
