"use client"

import { useState } from "react"
import { FileCheck2, TriangleAlert, Upload, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { DocumentField } from "@/lib/dsl"
import type { DocumentType } from "@/lib/local-api"
import { localize } from "@/lib/local-api/localize"
import { addDays, currentDocuments, facesOf, today, type DocumentFace, type PreviewDocument } from "@/lib/runtime"
import { cn } from "@/lib/utils"
import { FieldShell } from "./field-input"

const FACE_LABEL: Record<DocumentFace, { fr: string; en: string }> = {
  single: { fr: "Fichier", en: "File" },
  front: { fr: "Recto", en: "Front" },
  back: { fr: "Verso", en: "Back" },
}

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`)

/**
 * Dépôt d'une pièce dans l'aperçu : choix du type accepté, recto/verso selon le type, date
 * d'émission (fraîcheur) ou d'expiration. Le fichier ne quitte pas le navigateur : seules ses
 * métadonnées alimentent le plan d'écriture (table documents).
 */
export function DocumentInput({
  field,
  fieldPath,
  documents,
  documentTypes,
  onUpload,
  onRemove,
  onDates,
  error,
  locale,
}: {
  field: DocumentField
  fieldPath: string
  documents: PreviewDocument[]
  documentTypes: DocumentType[]
  onUpload: (doc: Omit<PreviewDocument, "id">) => void
  onRemove: (face: DocumentFace) => void
  onDates: (dates: { issuedAt?: string; expiresAt?: string }) => void
  error?: string
  locale: string
}) {
  const current = currentDocuments(documents, fieldPath)
  const accepted = field.documentTypes.map((code) => documentTypes.find((d) => d.code === code)).filter((d): d is DocumentType => !!d)
  const [chosen, setChosen] = useState(current[0]?.documentTypeCode ?? accepted[0]?.code)
  const type = accepted.find((d) => d.code === (current[0]?.documentTypeCode ?? chosen))
  const [rejection, setRejection] = useState<string | null>(null)
  const en = locale === "en"
  const issuedAt = current[0]?.issuedAt
  const expiresAt = current[0]?.expiresAt
  const stale = type?.validityDays && issuedAt && addDays(issuedAt, type.validityDays) < today()
  const expired = !type?.validityDays && expiresAt && expiresAt < today()

  return (
    <FieldShell id={fieldPath} label={localize(field.label, locale)} help={field.help ? localize(field.help, locale) : undefined} required={field.required} error={error} group>
      <div className={cn("flex flex-col gap-3 rounded-lg border border-dashed p-4", error && "border-destructive")}>
        {accepted.length > 1 && (
          <RadioGroup
            value={type?.code}
            onValueChange={(code) => {
              // Changer de type remplace les pièces déjà déposées pour ce champ.
              current.forEach((d) => onRemove(d.face))
              setChosen(code)
            }}
            className="gap-2"
          >
            {accepted.map((d) => (
              <div key={d.code} className="flex items-center gap-2">
                <RadioGroupItem value={d.code} id={`${fieldPath}-${d.code}`} />
                <Label htmlFor={`${fieldPath}-${d.code}`} className="font-normal">
                  {d.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {accepted.length === 1 && <p className="text-sm font-medium">{accepted[0]!.label}</p>}

        {type && (
          <div className="flex flex-col gap-2">
            {facesOf(type.twoSided).map((face) => {
              const doc = current.find((d) => d.face === face)
              return (
                <div key={face} className="flex items-center gap-3 text-sm">
                  {type.twoSided && <span className="text-muted-foreground w-12 text-xs">{FACE_LABEL[face][en ? "en" : "fr"]}</span>}
                  {doc ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <FileCheck2 className="size-4 shrink-0 text-emerald-600" />
                      <span className="truncate font-medium">{doc.originalFilename}</span>
                      <span className="text-muted-foreground text-xs">{formatSize(doc.sizeBytes)}</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Retirer" onClick={() => onRemove(face)}>
                        <X className="size-4" />
                      </button>
                    </span>
                  ) : (
                    <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2">
                      <Upload className="size-4 shrink-0" />
                      {en ? "Choose a file" : "Choisir un fichier"}
                      <input
                        type="file"
                        className="sr-only"
                        accept={type.allowedMimeTypes.join(",")}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ""
                          if (!file) return
                          if (file.type && !type.allowedMimeTypes.includes(file.type)) return setRejection(`unsupported_format : ${file.type}`)
                          if (file.size > type.maxSizeBytes) return setRejection(`too_large : ${formatSize(file.size)} > ${formatSize(type.maxSizeBytes)}`)
                          setRejection(null)
                          onUpload({
                            fieldPath,
                            documentTypeCode: type.code,
                            face,
                            originalFilename: file.name,
                            mimeType: file.type || "application/octet-stream",
                            sizeBytes: file.size,
                            issuedAt,
                            expiresAt,
                          })
                        }}
                      />
                    </label>
                  )}
                </div>
              )
            })}
            {current.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <Label htmlFor={`${fieldPath}-date`} className="text-xs">
                  {type.validityDays ? (en ? "Issue date" : "Date d'émission") : en ? "Expiry date (optional)" : "Date d'expiration (facultatif)"}
                </Label>
                <Input
                  id={`${fieldPath}-date`}
                  type="date"
                  className="max-w-48"
                  value={(type.validityDays ? issuedAt : expiresAt) ?? ""}
                  onChange={(e) => onDates(type.validityDays ? { issuedAt: e.target.value || undefined } : { expiresAt: e.target.value || undefined })}
                />
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              {type.allowedMimeTypes.map((m) => m.split("/")[1]!.toUpperCase()).join(", ")} · {formatSize(type.maxSizeBytes)} max
              {type.validityDays ? (en ? ` · less than ${type.validityDays} days old` : ` · moins de ${type.validityDays} jours`) : ""}
            </p>
            {(stale || expired) && (
              <p className="text-condition-foreground flex gap-1.5 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {stale
                  ? `Pièce de plus de ${type.validityDays} jours : l'analyste la refusera à la revue (motif expired).`
                  : "Pièce expirée : l'analyste la refusera à la revue (motif expired)."}
              </p>
            )}
            {rejection && <p className="text-destructive text-xs">Fichier refusé ({rejection}).</p>}
          </div>
        )}
      </div>
    </FieldShell>
  )
}
