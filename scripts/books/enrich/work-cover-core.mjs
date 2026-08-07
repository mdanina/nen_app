import { sameWork } from "./core.mjs";

const technicalImage = /(?:item[_-]?no[_-]?cover|no[_-]?cover|main[_-]?cover|placeholder|default[_-]?(?:book|cover|image)|logo(?:[-_.]|$)|favicon|blank[_-]?cover|noimage|no-image|social-fb)/iu;
const nonBookProduct = /(?:^|[\s/_-])(?:блокнот|набор|стикер(?:пак)?|открытк|браслет|бутылк|шоппер|мерч|тетрад|плакат|календар)(?:[\s/_-]|$)/iu;

export function canonicalWork(book) {
  return {
    id: book.id,
    title: book.title,
    originalTitle: book.originalTitle,
    alternativeTitles: book.alternativeTitles,
    author: book.author,
    sourceMetadata: book.sourceMetadata?.alternativeTitles ? { alternativeTitles: book.sourceMetadata.alternativeTitles } : undefined,
  };
}

export function rankWorkCoverCandidates(book, candidates) {
  return candidates
    .map((candidate) => ({ candidate, work: sameWork(book, candidate) }))
    .filter(({ candidate, work }) => (
      work.matches
      && candidate.cover?.official
      && candidate.cover?.url?.startsWith("https://")
      && candidate.sourceUrl?.startsWith("https://")
      && !technicalImage.test(candidate.cover.url)
      && !nonBookProduct.test(`${candidate.title ?? ""} ${candidate.sourceUrl}`)
      && (candidate.officialPublisher || candidate.trustedCoverSource)
    ))
    .sort((left, right) => (
      Number(Boolean(right.candidate.officialPublisher)) - Number(Boolean(left.candidate.officialPublisher))
      || (right.candidate.sourcePriority ?? 0) - (left.candidate.sourcePriority ?? 0)
      || (right.work.titleScore ?? 0) - (left.work.titleScore ?? 0)
      || (right.candidate.confidence ?? 0) - (left.candidate.confidence ?? 0)
      || right.candidate.cover.url.length - left.candidate.cover.url.length
    ));
}

export function workCoverRecord(book, selection, verifiedAt) {
  const { candidate, work } = selection;
  return {
    id: book.id,
    cover: {
      kind: "external",
      url: candidate.cover.url,
      rightsStatus: "external-display-only",
      sourceName: candidate.sourceName,
      sourcePageUrl: candidate.sourceUrl,
      temporary: true,
      attribution: candidate.cover.attribution ?? "Обложка предоставлена издательством.",
      verifiedAt,
      assignmentMethod: "canonical_work_official_cover",
      assignmentConfidence: Number(Math.min(0.99, (candidate.confidence ?? 0.86) * 0.55 + work.titleScore * 0.45).toFixed(4)),
    },
    match: {
      strategy: "canonical_title_aliases_and_author",
      confidence: Number(Math.min(0.99, (candidate.confidence ?? 0.86) * 0.55 + work.titleScore * 0.45).toFixed(4)),
      matchedTitle: candidate.title,
      matchedAuthors: candidate.authors,
    },
    verification: {
      imageVerified: true,
      canonicalWorkMatched: true,
      titleMatched: true,
      authorMatched: true,
      editionIndependent: true,
    },
  };
}
