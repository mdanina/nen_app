const FICTION_GENRES = new Set([
  "реалистическая проза", "сказка", "приключения", "поэзия", "фэнтези",
  "юмор", "семейная история", "историческая проза", "детектив",
  "книжка-картинка", "научная фантастика", "повесть", "литературная сказка",
  "народная сказка", "сказочная история", "комедия", "рассказ",
  "сборник рассказов", "роман", "графический роман", "подростковая повесть",
  "фантастика", "философская сказка", "стихотворная история",
  "автобиографическая повесть",
]);

const NONFICTION_GENRES = new Set([
  "научно-популярная литература", "научно-популярная книга",
  "познавательная книга", "познавательная история",
  "иллюстрированная энциклопедия", "биография",
  "документальная литература",
]);

const EXPLICIT_NONFICTION_SUBJECT = /\b(?:atlases?|maps for children|encyclop(?:a?e)dias?|dictionaries|picture dictionaries|handbooks?|manuals?|textbooks?|study and teaching|grammar|readers|problems, exercises|bibliograph(?:y|ies)|history and criticism|literary criticism|authorship|language and languages|linguistics|geography|science|technology|mathematics|physics|chemistry|astronomy|biology|zoology|botany|anatomy|medicine|cook(?:ery|ing)|guidebooks?|directories|catalogs?|catalogues?|reference books?|questions and answers|miscellanea|pictorial works|identification|parenting)\b/iu;
const BIOGRAPHICAL_SUBJECT = /\b(?:biograph(?:y|ies)|autobiograph(?:y|ies)|diaries|personal narratives|memoirs|homes and haunts|childhood and youth)\b/iu;
const FICTION_SUBJECT = /\b(?:juvenile fiction|fiction|fairy tales?|folklore|legends?|myths?|novels?|short stories|children'?s stories|poetry|poems?|drama|plays?|comic books?|graphic novels?|fantasy fiction|science fiction|adventure stories|detective and mystery stories|humorous stories|nature stories|riddles)\b/iu;
const EXPLICIT_NONFICTION_TITLE = /(?:учебник|учебное пособие|рабочая тетрадь|методическое пособие|пособие для (?:учителя|педагога)|словарь|справочник|энциклопедия|грамматика|разговорник|букварь|задачник|сборник упражнений|вопросы и ответы|географический атлас|исторический атлас|атлас (?:мира|россии|животных|растений|географический|исторический)|путеводитель|каталог)/iu;

const MANUAL_EXCLUDE = new Set([
  "ol-ol33371355w", "ol-ol4392846w", "ol-ol19978348w", "ol-ol23310520w",
  "ol-ol7249215w", "ol-ol19952283w", "ol-ol32268394w", "ol-ol23144413w",
  "ol-ol43840511w", "ol-ol19987355w", "ol-ol13839836w", "ol-ol2546870w",
  "ol-ol939978w", "ol-ol969011w", "ol-ol4008415w", "ol-ol19935963w",
  "ol-ol5235850w", "ol-ol37008024w", "ol-ol33444270w", "ol-ol32916826w",
  "ol-ol36924767w", "ol-ol36954608w", "ol-ol19966487w", "ol-ol11573218w",
  "ol-ol42666756w", "ol-ol27689693w", "ol-ol4990210w", "ol-ol27059553w",
  "ol-ol19978346w", "ol-ol27027713w",
]);

const FINAL_CATALOG_EXCLUDE = new Map([
  ["ol-ol5130923w", "regional_geography_textbook"],
  ["ol-ol2300595w", "historical_educational_nonfiction"],
  ["ol-ol7337767w", "documentary_naturalist_notes"],
  ["ol-ol13749469w", "early_learning_educational_book"],
  ["ol-ol32427229w", "adult_literary_collection"],
  ["ol-ol4715673w", "historical_material_culture_nonfiction"],
  ["ol-ol22418629w", "missing_verified_annotation"],
  ["ol-ol13727598w", "missing_verified_annotation"],
  ["ol-ol40061322w", "missing_verified_annotation"],
  ["ol-ol43411200w", "missing_verified_annotation"],
  ["ol-ol40061324w", "missing_verified_annotation"],
  ["ol-ol2439920w", "missing_verified_annotation"],
  ["ol-ol19927903w", "missing_verified_annotation"],
  ["ol-ol33089855w", "missing_verified_annotation"],
  ["ol-ol35580781w", "missing_verified_annotation"],
  ["ol-ol37141565w", "missing_verified_annotation"],
  ["ol-ol33497265w", "missing_verified_annotation"],
  ["ol-ol39293439w", "missing_verified_annotation"],
  ["ol-ol44466703w", "missing_verified_annotation"],
]);

const MANUAL_KEEP = new Set([
  "ol-ol3803771w", "ol-ol20004004w", "ol-ol19978370w", "ol-ol19978354w",
  "ol-ol12432535w", "ol-ol38513598w",
  "ol-ol55522w", "ol-ol667419w", "ol-ol38539262w", "ol-ol27958552w",
  "ol-ol23852449w", "ol-ol33098425w", "ol-ol33137652w", "ol-ol38508810w",
  "ol-ol38533455w", "ol-ol865246w", "ol-ol43943169w",
  "ol-ol38509253w", "ol-ol10358155w",
]);

function normalized(value) {
  return String(value ?? "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function evidence(book) {
  const genres = book.genres ?? [];
  const formats = book.bookFormats ?? [];
  const subjects = book.sourceMetadata?.subjects ?? [];
  const subjectText = subjects.join(" | ");
  const title = normalized(book.title);
  const fiction = [];
  const nonfiction = [];

  for (const genre of genres) {
    if (FICTION_GENRES.has(genre)) fiction.push(`genre:${genre}`);
    if (NONFICTION_GENRES.has(genre)) nonfiction.push(`genre:${genre}`);
  }
  if (formats.includes("иллюстрированный нон-фикшн") || formats.includes("энциклопедия")) nonfiction.push(`format:${formats.filter((value) => value === "иллюстрированный нон-фикшн" || value === "энциклопедия").join(",")}`);
  if (FICTION_SUBJECT.test(subjectText)) fiction.push("subjects:explicit_fiction");
  if (EXPLICIT_NONFICTION_SUBJECT.test(subjectText)) nonfiction.push("subjects:explicit_nonfiction");
  if (BIOGRAPHICAL_SUBJECT.test(subjectText)) nonfiction.push("subjects:biographical_or_documentary");
  if (EXPLICIT_NONFICTION_TITLE.test(title)) nonfiction.push("title:explicit_nonfiction");

  return { fiction, nonfiction, subjects, title };
}

export function classifyCatalogBook(book) {
  const { fiction, nonfiction, subjects, title } = evidence(book);
  if (FINAL_CATALOG_EXCLUDE.has(book.id)) {
    return {
      decision: "exclude",
      type: FINAL_CATALOG_EXCLUDE.get(book.id),
      confidence: 0.99,
      evidence: [...fiction, ...nonfiction, "manual:final_catalog_title_author_bibliography"],
    };
  }
  if (MANUAL_EXCLUDE.has(book.id)) {
    return { decision: "exclude", type: "manual_semantic_nonfiction_review", confidence: 0.98, evidence: [...fiction, ...nonfiction, "manual:title_author_subjects"] };
  }
  if (MANUAL_KEEP.has(book.id)) {
    return { decision: "keep", type: "manual_semantic_fiction_review", confidence: 0.96, evidence: [...fiction, "manual:title_author_subjects"] };
  }
  const subjectText = subjects.join(" | ");
  const isImported = String(book.id).startsWith("ol-");
  const hasExplicitFiction = FICTION_SUBJECT.test(subjectText);
  const hasExplicitNonfiction = EXPLICIT_NONFICTION_SUBJECT.test(subjectText) || BIOGRAPHICAL_SUBJECT.test(subjectText);
  const hasNonfictionGenre = (book.genres ?? []).some((genre) => NONFICTION_GENRES.has(genre));
  const hasFictionGenre = (book.genres ?? []).some((genre) => FICTION_GENRES.has(genre));
  const hasDocumentaryGenre = (book.genres ?? []).some((genre) => ["биография", "документальная литература"].includes(genre));
  const hasExplicitTitle = EXPLICIT_NONFICTION_TITLE.test(title);

  if (!isImported && hasFictionGenre && !hasDocumentaryGenre) {
    return { decision: "keep", type: "fiction", confidence: 0.93, evidence: fiction };
  }
  if (hasDocumentaryGenre && !hasExplicitFiction) {
    return { decision: "exclude", type: "biography_or_documentary", confidence: 0.97, evidence: nonfiction };
  }
  if (hasExplicitTitle && hasExplicitNonfiction) {
    return { decision: "exclude", type: "educational_reference_or_atlas", confidence: 0.99, evidence: nonfiction };
  }
  if (hasExplicitNonfiction && !hasExplicitFiction) {
    return { decision: "exclude", type: BIOGRAPHICAL_SUBJECT.test(subjectText) ? "biography_or_documentary" : "informational_or_educational_nonfiction", confidence: 0.96, evidence: nonfiction };
  }
  if (isImported && hasExplicitFiction && !hasExplicitNonfiction) {
    return { decision: "keep", type: "fiction", confidence: 0.96, evidence: fiction };
  }
  if (!isImported && hasNonfictionGenre && !fiction.length) {
    return { decision: "exclude", type: "editorial_nonfiction", confidence: 0.98, evidence: nonfiction };
  }
  if (!isImported && hasDocumentaryGenre) {
    return { decision: "exclude", type: "editorial_biography_or_documentary", confidence: 0.98, evidence: nonfiction };
  }
  if (hasNonfictionGenre && !hasExplicitFiction) {
    if (isImported) {
      const genericSubject = /^(?:children'?s literature(?:,\s*[^.]+)?|children'?s books?(?:,\s*[^.]+)?|picture books for children|illustrated children'?s books?|juvenile literature|russian language edition|translations into russian)[.\s]*$/iu;
      const onlyGenericChildren = subjects.length > 0 && subjects.every((value) => genericSubject.test(value));
      if (onlyGenericChildren || !subjects.length) {
        return { decision: "ambiguous", type: "nonfiction_label_without_specific_source_evidence", confidence: 0.55, evidence: nonfiction };
      }
      return { decision: "exclude", type: "informational_nonfiction", confidence: 0.92, evidence: nonfiction };
    }
    return { decision: "exclude", type: "informational_nonfiction", confidence: 0.92, evidence: nonfiction };
  }
  if (nonfiction.length && fiction.length) {
    return { decision: "ambiguous", type: "conflicting_fiction_and_nonfiction_evidence", confidence: 0.5, evidence: [...fiction, ...nonfiction] };
  }
  if (fiction.length) {
    return { decision: "keep", type: "fiction", confidence: Math.min(0.99, 0.78 + fiction.length * 0.07), evidence: fiction };
  }
  return { decision: "ambiguous", type: "insufficient_type_evidence", confidence: 0.4, evidence: [] };
}

export const fictionClassifierInternals = {
  FICTION_GENRES,
  NONFICTION_GENRES,
  EXPLICIT_NONFICTION_TITLE,
};
