import type { Field, FormSchema } from "@/lib/dsl"
import { evaluate, itemScope } from "./logic"
import type { ItemData, SubmissionData } from "./types"
import { isEmpty } from "./values"

/** Champs qui portent une valeur dans les réponses (ni info ni pièce). */
export const hasValue = (field: Field) => field.type !== "info" && field.type !== "document"

/** Réponses brutes des champs d'une étape. */
export function stepValues(schema: FormSchema, stepKey: string, raw: SubmissionData): SubmissionData {
  const out: SubmissionData = {}
  for (const field of schema.steps[stepKey]?.fields ?? []) {
    if (hasValue(field) && raw[field.key] !== undefined) out[field.key] = raw[field.key]
  }
  return out
}

/**
 * Réponses retenues pour le dossier : étapes du chemin seulement, champs visibles et non vides.
 * Les réponses d'une branche abandonnée restent dans l'historique mais pas dans le dossier.
 * La visibilité d'un champ se lit sur les réponses retenues des étapes précédentes et sur
 * celles de son étape.
 */
export function collectData(schema: FormSchema, path: string[], raw: SubmissionData): SubmissionData {
  const out: SubmissionData = {}
  for (const stepKey of path) {
    const step = schema.steps[stepKey]
    if (!step) continue
    const scope = { ...out, ...stepValues(schema, stepKey, raw) }
    for (const field of step.fields) {
      if (!hasValue(field) || !evaluate(field.visibleIf, scope)) continue
      if (field.type === "repeater") {
        const items = Array.isArray(raw[field.key]) ? (raw[field.key] as ItemData[]) : []
        out[field.key] = items.map((item) => {
          const kept: ItemData = {}
          for (const itemField of field.fields) {
            if (!hasValue(itemField) || isEmpty(item[itemField.key])) continue
            if (evaluate(itemField.visibleIf, itemScope(scope, item))) kept[itemField.key] = item[itemField.key]
          }
          return kept
        })
      } else if (!isEmpty(raw[field.key])) {
        out[field.key] = raw[field.key]
      }
    }
  }
  return out
}

/** Champ pièce visible, avec son chemin (fieldPath) et le repeater qui le contient. */
export interface DocumentSlot {
  fieldPath: string
  stepKey: string
  field: Extract<Field, { type: "document" }>
  /** Repeater et index de l'item, pour une pièce d'item. */
  repeaterKey?: string
  index?: number
}

/** Pièces attendues sur le chemin : champs document visibles, items de repeater compris. */
export function documentSlots(schema: FormSchema, path: string[], data: SubmissionData): DocumentSlot[] {
  const slots: DocumentSlot[] = []
  for (const stepKey of path) {
    for (const field of schema.steps[stepKey]?.fields ?? []) {
      if (!evaluate(field.visibleIf, data)) continue
      if (field.type === "document") slots.push({ fieldPath: field.key, stepKey, field })
      if (field.type === "repeater") {
        const items = Array.isArray(data[field.key]) ? (data[field.key] as ItemData[]) : []
        items.forEach((item, index) => {
          for (const itemField of field.fields) {
            if (itemField.type !== "document" || !evaluate(itemField.visibleIf, itemScope(data, item))) continue
            slots.push({ fieldPath: `${field.key}[${index}].${itemField.key}`, stepKey, field: itemField, repeaterKey: field.key, index })
          }
        })
      }
    }
  }
  return slots
}
