import type { InputField, SelectOption } from "@/lib/dsl"

/**
 * Réponses d'un dossier (SubmissionData) : indexées à plat par clé de champ ; un repeater est
 * un tableau d'items, chacun indexé par les clés de ses champs. Valeur vide = absente.
 */
export type SubmissionData = Record<string, unknown>
export type ItemData = Record<string, unknown>

/** Face d'une pièce : recto/verso pour un type two_sided, sinon single. */
export type DocumentFace = "single" | "front" | "back"

/**
 * Pièce déposée pendant l'aperçu, équivalent local d'une ligne documents : elle n'est pas dans
 * les réponses mais rattachée au chemin du champ (fieldPath).
 */
export interface PreviewDocument {
  id: string
  /** "id_document" ou "beneficial_owners[0].bo_id_document". */
  fieldPath: string
  documentTypeCode: string
  face: DocumentFace
  originalFilename: string
  mimeType: string
  sizeBytes: number
  issuedAt?: string
  expiresAt?: string
}

/** Ce que le moteur doit savoir en plus du schéma. */
export interface EngineContext {
  /** Options d'un select bindé à une propriété (elles viennent de la propriété). */
  resolveOptions: (field: InputField) => SelectOption[] | undefined
  /** Types de pièces : faces exigées. */
  twoSided: (documentTypeCode: string) => boolean
  documents: PreviewDocument[]
  locale: string
}

/** Erreur de saisie, au format FieldError de l'API. */
export interface FieldError {
  fieldPath: string
  code: string
  message: string
}
