import type { FormSchema, InputFieldType, LocalizedText, PartyNature } from "@/lib/dsl"

/**
 * Formes des ressources de l'API (brouillon OpenAPI openapi-kyc-draft.yaml, champs JSON en
 * camelCase). Le POC les produit en local ; un vrai client HTTP renverra les mêmes objets.
 */

export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

// ---------------------------------------------------------------- Forms

export interface FormDefinition {
  id: string
  name: LocalizedText
  templateId: string | null
  latestPublishedVersionId: string | null
  draftVersionId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FormDefinitionCreate {
  name: LocalizedText
  templateId?: string
}

export type FormVersionStatus = "draft" | "published" | "archived"

export interface FormVersionSummary {
  id: string
  formId: string
  /** Numéro séquentiel dans le formulaire : 1, 2, 3… */
  number: number
  status: FormVersionStatus
  dslVersion: number
  /** Incrémentée à chaque sauvegarde du brouillon ; valeur de l'ETag / If-Match. */
  revision: number
  /** sha256 du schéma canonique, calculé à la publication. */
  hash: string | null
  createdBy: string
  publishedBy: string | null
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FormVersion extends FormVersionSummary {
  schema: FormSchema
}

export interface JsonChange {
  op: "added" | "removed" | "modified"
  path: string
  before?: unknown
  after?: unknown
}

export interface FormVersionDiff {
  fromVersionId: string
  toVersionId: string
  changes: JsonChange[]
}

/** Modèle système, textes dans la langue de l'appelant. */
export interface FormTemplate {
  id: string
  name: string
  description: string | null
  natures: PartyNature[]
}

// ---------------------------------------------------------------- Properties

export type PropertyScope = "party" | "relation"
export type PropertyType = InputFieldType

export interface PropertyOption {
  value: string
  label: LocalizedText
}

export interface Property {
  id: string
  key: string
  scope: PropertyScope
  type: PropertyType
  multiple: boolean
  label: LocalizedText
  options: PropertyOption[] | null
  /** Natures de partie concernées ; vide = toutes. */
  natures: PartyNature[]
  /** Types de relation concernés (scope relation) ; vide = tous. */
  relationTypes: string[]
  isSystem: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PropertyCreate {
  key: string
  scope: PropertyScope
  type: PropertyType
  multiple?: boolean
  label: LocalizedText
  options?: PropertyOption[]
  natures?: PartyNature[]
  relationTypes?: string[]
}

export interface PropertyUpdate {
  label?: LocalizedText
  options?: PropertyOption[]
  natures?: PartyNature[]
  relationTypes?: string[]
}

// ---------------------------------------------------------------- Document types

/** Type de pièce, libellé dans la langue de l'appelant. */
export interface DocumentType {
  code: string
  label: string
  allowedMimeTypes: string[]
  maxSizeBytes: number
  validityDays: number | null
  twoSided: boolean
  applicableNatures: PartyNature[]
}
