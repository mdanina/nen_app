# Open Library pilot import

This pipeline is deliberately isolated from the production book catalog. It reads Open Library's official dump TSV layout (`type`, `key`, `revision`, `last_modified`, JSON), including `.gz` files, and writes only below the explicitly supplied output directory.

## Real dump fragment

```powershell
node scripts/openlibrary/import-pilot.mjs `
  --input C:\data\ol_dump_works_fragment.txt.gz `
  --input C:\data\ol_dump_editions_fragment.txt.gz `
  --input C:\data\ol_dump_authors_fragment.txt.gz `
  --output data\import\openlibrary\pilot `
  --dump-date 2026-07-01 `
  --limit 1000 `
  --seed 20260721
```

The fragment must contain related work, edition, and author records. A work is admitted only when an explicit Open Library subject matches a documented child/young-adult marker. Free subjects are not converted into NEN genres, ages, moods, situations, or recommendations.

Descriptions and cover identifiers are retained only as blocked provenance. No cover image is downloaded, no cover URL is produced, and neither field is cleared for automatic publication.

## Technical fixture

The repository fixture uses synthetic `OLPILOT*` identifiers and exists only to test and demonstrate the pipeline. It must be run with `--fixture`; its statistics must not be interpreted as an assessment of Open Library coverage.

```powershell
pnpm import:openlibrary:fixture
```

Output:

- `raw/`: exact supported input lines, separated by entity;
- `normalized/works.json`: candidate works with explicit child subject evidence;
- `normalized/editions.json`: linked editions;
- `normalized/authors.json`: linked authors;
- `reports/`: quality, duplicate, ISBN, completeness, language, subject, exclusion, parse-error, and seeded-review reports;
- `manifest.json`: dump date, input hashes, and generated-file inventory.

## Source-neutral model

The universal architecture is documented in `docs/import-architecture.md`. `import-universal.mjs` runs the Open Library adapter through `@nen/import-core` and writes a staged batch with raw, normalized, validated, deduplication, unified, editorial, and report directories. It never writes to the production catalog.
