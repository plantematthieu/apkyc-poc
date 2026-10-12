import type { FormSchema } from "@/lib/dsl"
import { documentSlots } from "./collect"
import type { DocumentFace, EngineContext, PreviewDocument, SubmissionData } from "./types"

/** Faces attendues pour un type de pièce. */
export const facesOf = (twoSided: boolean): DocumentFace[] => (twoSided ? ["front", "back"] : ["single"])

/** Pièces courantes d'un champ : une nouvelle pièce pour la même face remplace l'ancienne. */
export function currentDocuments(documents: PreviewDocument[], fieldPath: string): PreviewDocument[] {
  const byFace = new Map<DocumentFace, PreviewDocument>()
  for (const d of documents) if (d.fieldPath === fieldPath) byFace.set(d.face, d)
  return [...byFace.values()]
}

/** Faces manquantes d'un champ, selon le type de pièce choisi par le client. */
export function missingFaces(documents: PreviewDocument[], fieldPath: string, ctx: Pick<EngineContext, "twoSided">): DocumentFace[] {
  const docs = currentDocuments(documents, fieldPath)
  if (docs.length === 0) return ["single"]
  const expected = facesOf(ctx.twoSided(docs[0]!.documentTypeCode))
  return expected.filter((face) => !docs.some((d) => d.face === face && d.documentTypeCode === docs[0]!.documentTypeCode))
}

/** RequiredDocument de l'API (GET /v1/portal/submission/required-documents). */
export interface RequiredDocument {
  fieldPath: string
  acceptedDocumentTypes: string[]
  faces: DocumentFace[]
  status: "missing" | "pending_scan" | "provided" | "satisfied_by_context" | "refused"
  documentIds: string[]
}

/**
 * Pièces exigées sur le chemin suivi : champs document obligatoires et visibles. Dans le POC,
 * l'analyse est instantanée : une pièce déposée est tout de suite `provided`.
 */
export function requiredDocuments(schema: FormSchema, path: string[], data: SubmissionData, ctx: EngineContext): RequiredDocument[] {
  return documentSlots(schema, path, data)
    .filter((slot) => slot.field.required)
    .map((slot) => {
      const docs = currentDocuments(ctx.documents, slot.fieldPath)
      const chosen = docs[0]?.documentTypeCode
      const faces = chosen
        ? facesOf(ctx.twoSided(chosen))
        : slot.field.documentTypes.every((code) => ctx.twoSided(code))
          ? facesOf(true)
          : facesOf(false)
      const complete = docs.length > 0 && missingFaces(ctx.documents, slot.fieldPath, ctx).length === 0
      return {
        fieldPath: slot.fieldPath,
        acceptedDocumentTypes: slot.field.documentTypes,
        faces,
        status: complete ? "provided" : "missing",
        documentIds: docs.map((d) => d.id),
      }
    })
}
