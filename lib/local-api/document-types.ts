import { DOCUMENT_TYPE_ROWS } from "@/lib/catalog/document-types"
import type { PartyNature } from "@/lib/dsl"
import { tick } from "./db"
import { localize } from "./localize"
import type { DocumentType } from "./types"

/**
 * GET /v1/document-types — catalogue global en lecture seule, libellés dans la langue de
 * l'appelant (repli sur le français). Les types archivés ne sont pas listés.
 */
export async function listDocumentTypes(params: { nature?: PartyNature; language?: string } = {}): Promise<{ data: DocumentType[] }> {
  await tick()
  const language = params.language ?? "fr"
  const data = DOCUMENT_TYPE_ROWS.filter((row) => !row.archivedAt)
    .filter((row) => !params.nature || row.applicableNatures.length === 0 || row.applicableNatures.includes(params.nature))
    .map((row) => ({
      code: row.code,
      label: localize(row.label, language),
      allowedMimeTypes: row.allowedMimeTypes,
      maxSizeBytes: row.maxSizeBytes,
      validityDays: row.validityDays,
      twoSided: row.twoSided,
      applicableNatures: row.applicableNatures,
    }))
  return { data }
}
