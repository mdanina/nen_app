export type EntityLevel = "author" | "work" | "edition";
export type VerificationStatus = "unreviewed" | "machine-validated" | "manually-verified" | "rejected";
export type PublicUseStatus = "allowed" | "not-allowed" | "unknown";

export interface SourceLicense {
  code: string;
  name: string;
  url?: string;
  metadataReuse: "allowed" | "restricted" | "unknown";
  annotationReuse: "allowed" | "restricted" | "unknown";
  coverReuse: "allowed" | "external-display-only" | "restricted" | "unknown";
  attributionRequired: boolean | "unknown";
  notes?: string;
}

export interface SourceDescriptor {
  id: string;
  displayName: string;
  homepage: string;
  license: SourceLicense;
}

export interface FieldProvenance<T = unknown> {
  source: string;
  sourceRecordId: string;
  retrievedAt: string;
  license: SourceLicense;
  entityLevel: EntityLevel;
  rawValue: unknown;
  normalizedValue: T;
  verificationStatus: VerificationStatus;
}

export interface SourcedValue<T> {
  value: T;
  provenance: FieldProvenance<T>[];
}

export interface SourceIdentifier {
  source: string;
  entityLevel: EntityLevel;
  value: string;
  sourceRecordId: string;
}

export interface AnnotationRecord {
  id: string;
  entityLevel: "work" | "edition";
  entityId: string;
  text: string;
  source: string;
  sourceRecordId: string;
  retrievedAt: string;
  licenseStatus: SourceLicense;
  origin: string | null;
  publicUse: PublicUseStatus;
  verificationStatus: VerificationStatus;
  textWasModified: false;
}

export interface CoverReference {
  id: string;
  entityLevel: "work" | "edition";
  entityId: string;
  source: string;
  sourceRecordId: string;
  sourceCoverId?: string;
  url?: string;
  retrievedAt: string;
  licenseStatus: SourceLicense;
  origin: string | null;
  publicUse: PublicUseStatus;
  locallyStored: false;
}

export interface AuthorRecord {
  id: string;
  entityLevel: "author";
  identifiers: SourceIdentifier[];
  preferredName: SourcedValue<string | null>;
  alternateNames: SourcedValue<string[]>;
  verificationStatus: VerificationStatus;
}

export interface WorkRecord {
  id: string;
  entityLevel: "work";
  identifiers: SourceIdentifier[];
  title: SourcedValue<string | null>;
  originalTitle: SourcedValue<string | null>;
  authorRefs: SourcedValue<string[]>;
  importedSubjects: SourcedValue<string[]>;
  annotations: AnnotationRecord[];
  covers: CoverReference[];
  verificationStatus: VerificationStatus;
}

export interface IsbnValue { value: string; type: "isbn10" | "isbn13" | null; valid: boolean; }

export interface EditionRecord {
  id: string;
  entityLevel: "edition";
  identifiers: SourceIdentifier[];
  workRefs: SourcedValue<string[]>;
  title: SourcedValue<string | null>;
  authorRefs: SourcedValue<string[]>;
  isbns: SourcedValue<IsbnValue[]>;
  publishers: SourcedValue<string[]>;
  languages: SourcedValue<string[]>;
  publicationYear: SourcedValue<number | null>;
  pages: SourcedValue<number | null>;
  translationOf: SourcedValue<string | null>;
  annotations: AnnotationRecord[];
  covers: CoverReference[];
  verificationStatus: VerificationStatus;
}

export interface BibliographicBookCandidate {
  id: string;
  workId: string;
  editionIds: string[];
  bibliographicStatus: "candidate";
  editorialRecordId: null;
  productionStatus: "not-connected";
}

export interface NenEditorialRecord {
  id: string;
  workId: string;
  preferredEditionId?: string;
  ageRecommendation?: { min?: number; max?: number; label?: string };
  themes: string[];
  moods: string[];
  lifeSituations: string[];
  readingMode?: "independent" | "together" | "both";
  recommendation?: string;
  collectionIds: string[];
  createdBy: "nen-editorial";
  reviewStatus: "draft" | "review" | "approved";
}

export interface RawSourceEnvelope {
  source: string;
  sourceRecordId: string;
  entityLevel: EntityLevel;
  retrievedAt: string;
  license: SourceLicense;
  payload: unknown;
  rawLine?: string;
}

export interface SourceAdapter {
  descriptor: SourceDescriptor;
  read(inputs: string[], context: { retrievedAt: string }): Promise<{ records: RawSourceEnvelope[]; errors: unknown[] }>;
  normalize(record: RawSourceEnvelope): AuthorRecord | WorkRecord | EditionRecord;
}

