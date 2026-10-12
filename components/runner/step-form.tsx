"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DocumentField, Field, FormSchema, RepeaterField } from "@/lib/dsl"
import type { DocumentType } from "@/lib/local-api"
import { localize } from "@/lib/local-api/localize"
import { evaluate, itemScope, type DocumentFace, type EngineContext, type FieldError, type ItemData, type PreviewDocument, type SubmissionData } from "@/lib/runtime"
import { DocumentInput } from "./document-input"
import { FieldInput, InfoView } from "./field-input"

export interface DocumentActions {
  upload: (doc: Omit<PreviewDocument, "id">) => void
  remove: (fieldPath: string, face: DocumentFace) => void
  dates: (fieldPath: string, dates: { issuedAt?: string; expiresAt?: string }) => void
}

interface StepFormProps {
  schema: FormSchema
  stepKey: string
  /** Portée des conditions : réponses retenues des étapes précédentes et réponses de l'étape. */
  scope: SubmissionData
  raw: SubmissionData
  setValue: (key: string, value: unknown) => void
  addItem: (repeaterKey: string) => void
  removeItem: (repeaterKey: string, index: number) => void
  errors: FieldError[]
  ctx: EngineContext
  documentTypes: DocumentType[]
  docs: DocumentActions
  index: number
  isFinal: boolean
  onBack?: () => void
  onContinue: () => void
}

const MESSAGES = {
  fr: { step: "Étape", back: "Précédent", next: "Continuer", submit: "Transmettre le dossier", empty: "Cette étape ne contient aucun champ.", add: "Ajouter", remove: "Retirer" },
  en: { step: "Step", back: "Back", next: "Continue", submit: "Submit", empty: "This step has no field.", add: "Add", remove: "Remove" },
}

export function StepForm(props: StepFormProps) {
  const { schema, stepKey, scope, ctx, index, isFinal, onBack, onContinue } = props
  const step = schema.steps[stepKey]!
  const m = ctx.locale === "en" ? MESSAGES.en : MESSAGES.fr

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        onContinue()
        requestAnimationFrame(() => document.querySelector("[data-invalid]")?.scrollIntoView({ block: "center", behavior: "smooth" }))
      }}
    >
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {m.step} {index + 1}
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-balance">{localize(step.title, ctx.locale)}</h2>
        {step.description && <p className="text-muted-foreground text-sm">{localize(step.description, ctx.locale)}</p>}
      </header>

      <div className="flex flex-col gap-5">
        {step.fields
          .filter((f) => evaluate(f.visibleIf, scope))
          .map((f) => (
            <FieldBlock key={f.key} form={props} field={f} fieldPath={f.key} value={props.raw[f.key]} onChange={(v) => props.setValue(f.key, v)} scope={scope} />
          ))}
        {step.fields.length === 0 && <p className="text-muted-foreground text-sm">{m.empty}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button type="button" variant="ghost" onClick={onBack} disabled={!onBack}>
          {m.back}
        </Button>
        <Button type="submit">{isFinal ? m.submit : m.next}</Button>
      </div>
    </form>
  )
}

interface BlockProps {
  form: StepFormProps
  field: Field
  fieldPath: string
  value: unknown
  onChange: (v: unknown) => void
  scope: SubmissionData
}

function FieldBlock({ form, field, fieldPath, value, onChange, scope }: BlockProps) {
  const error = form.errors.find((e) => e.fieldPath === fieldPath)?.message
  switch (field.type) {
    case "info":
      return <InfoView field={field} locale={form.ctx.locale} />
    case "document":
      return <DocumentBlock form={form} field={field} fieldPath={fieldPath} error={error} />
    case "repeater":
      return <RepeaterBlock form={form} repeater={field} scope={scope} error={error} />
    default:
      return <FieldInput field={field} id={`f-${fieldPath}`} value={value} onChange={onChange} error={error} locale={form.ctx.locale} options={form.ctx.resolveOptions(field)} />
  }
}

function DocumentBlock({ form, field, fieldPath, error }: { form: StepFormProps; field: DocumentField; fieldPath: string; error?: string }) {
  const { ctx, documentTypes, docs } = form
  return (
    <DocumentInput
      field={field}
      fieldPath={fieldPath}
      documents={ctx.documents}
      documentTypes={documentTypes}
      onUpload={docs.upload}
      onRemove={(face) => docs.remove(fieldPath, face)}
      onDates={(dates) => docs.dates(fieldPath, dates)}
      error={error}
      locale={ctx.locale}
    />
  )
}

function RepeaterBlock({ form: props, repeater, scope, error }: { form: StepFormProps; repeater: RepeaterField; scope: SubmissionData; error?: string }) {
  const items = Array.isArray(props.raw[repeater.key]) ? (props.raw[repeater.key] as ItemData[]) : []
  const m = props.ctx.locale === "en" ? MESSAGES.en : MESSAGES.fr
  const label = localize(repeater.label, props.ctx.locale)

  return (
    <div className="flex flex-col gap-3" data-invalid={error ? true : undefined}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {repeater.help && <p className="text-muted-foreground text-xs">{localize(repeater.help, props.ctx.locale)}</p>}
      </div>
      {items.map((item, i) => {
        const local = itemScope(scope, item)
        return (
          <div key={i} className="bg-muted/30 flex flex-col gap-4 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                {label} n° {i + 1}
              </p>
              <Button type="button" variant="ghost" size="xs" disabled={items.length <= (repeater.min ?? 0)} onClick={() => props.removeItem(repeater.key, i)}>
                <Trash2 /> {m.remove}
              </Button>
            </div>
            {repeater.fields
              .filter((f) => evaluate(f.visibleIf, local))
              .map((f) => (
                <FieldBlock
                  key={f.key}
                  form={props}
                  field={f}
                  fieldPath={`${repeater.key}[${i}].${f.key}`}
                  value={item[f.key]}
                  scope={local}
                  onChange={(v) => {
                    const next = items.map((x, j) => {
                      if (j !== i) return x
                      const copy = { ...x }
                      if (v === undefined) delete copy[f.key]
                      else copy[f.key] = v
                      return copy
                    })
                    props.setValue(repeater.key, next)
                  }}
                />
              ))}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={repeater.max !== undefined && items.length >= repeater.max} onClick={() => props.addItem(repeater.key)}>
        <Plus /> {m.add}
      </Button>
      {error && <p className="text-destructive text-xs font-medium">{error}</p>}
    </div>
  )
}
