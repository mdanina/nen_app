# Универсальная архитектура библиографического импорта НЭН

## Границы системы

Импортный контур не является частью книжного приложения и не читает/не изменяет `data/source/catalog-full.json`, `data/source/books-v2.json` или `data/generated/books.json`. Передача кандидата в редакционный слой и production возможна только отдельной будущей командой после ручного согласования.

Ни один внешний источник не считается главным внутри модели. Каждое значение хранит один или несколько объектов provenance, поэтому выбранное итоговое значение может быть подтверждено Open Library, DNB, BnF, издательством или иной системой одновременно.

## Слои

### Библиографический слой

- `AuthorRecord` — автор и варианты имени;
- `WorkRecord` — произведение независимо от языка и конкретного выпуска;
- `EditionRecord` — конкретное издание, перевод или переиздание;
- `AnnotationRecord` — дословный внешний текст с отдельными правами;
- `CoverReference` — только внешний идентификатор/URL, без файла;
- `BibliographicBookCandidate` — связь произведения с найденными изданиями, ещё без редакционной карточки.

### Редакционный слой НЭН

`NenEditorialRecord` создаётся только редакцией НЭН. Возраст, темы НЭН, настроение, жизненные ситуации, формат чтения, рекомендация и подборки никогда не заполняются адаптером. Универсальный pipeline создаёт пустой `editorial/records.json`.

## Модель происхождения поля

Каждое импортированное поле является `SourcedValue<T>`:

```json
{
  "value": "Нормализованное название",
  "provenance": [
    {
      "source": "openlibrary",
      "sourceRecordId": "/works/OL123W",
      "retrievedAt": "2026-07-21T00:00:00.000Z",
      "license": { "code": "openlibrary-rights-not-asserted" },
      "entityLevel": "work",
      "rawValue": "  Нормализованное   название ",
      "normalizedValue": "Нормализованное название",
      "verificationStatus": "unreviewed"
    }
  ]
}
```

При обогащении другим источником добавляется новый provenance, а исходный не перезаписывается.

## Аннотация

```json
{
  "text": "Полный текст источника без изменений.",
  "source": "openlibrary",
  "sourceRecordId": "/works/OL123W",
  "retrievedAt": "2026-07-21T00:00:00.000Z",
  "licenseStatus": { "annotationReuse": "unknown" },
  "origin": "openlibrary-record; upstream-origin-unknown",
  "publicUse": "unknown",
  "verificationStatus": "unreviewed",
  "textWasModified": false
}
```

Pipeline не исправляет пробелы, орфографию и пунктуацию внутри аннотации и не создаёт новый текст.

## Обложка

```json
{
  "source": "openlibrary",
  "sourceCoverId": "12345",
  "url": "https://covers.openlibrary.org/b/id/12345-L.jpg",
  "licenseStatus": { "coverReuse": "external-display-only" },
  "origin": "Open Library Covers Repository; upstream-image-origin-unknown",
  "publicUse": "unknown",
  "locallyStored": false
}
```

URL не означает автоматического разрешения на публикацию. Изображение не скачивается.

## Контракт адаптера

Каждый адаптер обязан предоставить:

1. `descriptor` — источник и его лицензионный профиль;
2. `read(inputs, context)` — чтение исходного формата в `RawSourceEnvelope`;
3. `normalize(record)` — преобразование в `AuthorRecord`, `WorkRecord` или `EditionRecord`.

Планируемые реализации:

- `OpenLibraryAdapter` — реализован для dump TSV;
- `DNBAdapter` — MARC21/MARCXML, RDF или OAI-PMH;
- `BnFAdapter` — UNIMARC/RDF/SRU;
- `PublisherAdapter` — CSV, ONIX или API по условиям конкретного договора;
- `LibraryOfCongressAdapter` — только отдельная проверка и обогащение.

Подключение адаптера не требует изменения внутренних сущностей или production-модели.

## Прохождение данных

```text
Источник
  ↓ adapter.read
RawSourceEnvelope + неизменяемый payload
  ↓ adapter.normalize
Источник-независимые Author / Work / Edition
  ↓ validateBatch
Проверка структуры, provenance, аннотаций и обложек
  ↓ findMatchCandidates
Точные повторы и вероятные совпадения без автоматического слияния
  ↓ BibliographicBookCandidate
Кандидат с productionStatus = not-connected
  ↓ ручной редакционный процесс (не реализован)
NenEditorialRecord
  ↓ отдельный согласованный export (не реализован)
Production-каталог
```

## Дедупликация

- одинаковый source ID — точный повтор записи источника;
- одинаковый валидный ISBN у разных Edition — кандидат на проверку;
- нормализованное название + автор — вероятный дубль Work;
- несколько Edition у одного Work — разные издания или переиздания;
- перевод фиксируется только при явной связи источника;
- год, язык и издательство используются как доказательства, но не как основание для автоматического слияния.

## Каталоги

```text
packages/import-core/
  schema/                  JSON Schema единой модели
  src/                     контракт, модели, validation, deduplication, pipeline

scripts/openlibrary/
  universal-adapter.mjs    адаптер Open Library
  import-universal.mjs     CLI универсального pipeline

data/import/
  sources.json             реестр источников и лицензионных режимов
  staging/<batch>/
    raw/
    normalized/
    validated/
    deduplication/
    unified/
    editorial/
    reports/
```

## Запуск

```powershell
node scripts/openlibrary/import-universal.mjs `
  --input C:\data\ol_dump_fragment.txt.gz `
  --output data\import\staging\openlibrary-202607 `
  --retrieved-at 2026-07-21T00:00:00.000Z `
  --batch-id openlibrary-202607
```

