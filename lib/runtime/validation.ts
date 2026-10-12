import type { DocumentField, Field, FormSchema, InputField, RepeaterField } from "@/lib/dsl"
import { localize } from "@/lib/local-api/localize"
import { currentDocuments, missingFaces } from "./documents"
import { evaluate, evaluateRepeaterRule, itemScope } from "./logic"
import { runtimeMessages } from "./messages"
import type { EngineContext, FieldError, ItemData, SubmissionData } from "./types"
import { isAddress, isCountry, isE164, isEmail, isEmpty, isIsoDate } from "./values"

/**
 * validateStep : erreurs de saisie d'une étape, sur les champs visibles seulement. `data` est
 * la portée des conditions : réponses retenues des étapes précédentes et réponses de l'étape.
 * Le serveur rejoue exactement ce contrôle (POST …/steps/{stepKey}/complete et submit).
 */
export function validateStep(schema: FormSchema, stepKey: string, data: SubmissionData, ctx: EngineContext): FieldError[] {
  const errors: FieldError[] = []
  for (const field of schema.steps[stepKey]?.fields ?? []) {
    if (!evaluate(field.visibleIf, data)) continue
    validateField(field, field.key, data[field.key], data, ctx, errors)
  }
  return errors
}

function validateField(field: Field, fieldPath: string, value: unknown, scope: SubmissionData, ctx: EngineContext, errors: FieldError[]) {
  const m = runtimeMessages(ctx.locale)
  switch (field.type) {
    case "info":
      return
    case "document":
      return validateDocument(field, fieldPath, ctx, errors)
    case "repeater":
      return validateRepeater(field, value, scope, ctx, errors)
    default: {
      if (isEmpty(value)) {
        if (field.required) errors.push({ fieldPath, code: "required", message: m.required })
        return
      }
      const problem = checkValue(field, value, ctx)
      if (problem) return errors.push({ fieldPath, ...problem })
      for (const rule of field.validate ?? []) {
        if (!evaluate(rule.rule, scope)) {
          errors.push({ fieldPath, code: "validate", message: localize(rule.message, ctx.locale) })
          return
        }
      }
    }
  }
}

/** Contrôle de type d'une valeur non vide (liste pour un champ multiple). */
export function checkValue(field: InputField, value: unknown, ctx: EngineContext): { code: string; message: string } | null {
  const m = runtimeMessages(ctx.locale)
  if (field.multiple) {
    if (!Array.isArray(value)) return { code: "type", message: m.invalidText }
    for (const item of value) {
      const problem = checkSingle(field, item, ctx)
      if (problem) return problem
    }
    return null
  }
  return checkSingle(field, value, ctx)
}

function checkSingle(field: InputField, value: unknown, ctx: EngineContext): { code: string; message: string } | null {
  const m = runtimeMessages(ctx.locale)
  switch (field.type) {
    case "text":
      if (typeof value !== "string") return { code: "type", message: m.invalidText }
      if (field.pattern) {
        try {
          if (!new RegExp(field.pattern, "u").test(value)) return { code: "pattern", message: m.pattern }
        } catch {
          return null
        }
      }
      return null
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return { code: "type", message: m.invalidNumber }
      if (field.min !== undefined && value < field.min) return { code: "min", message: m.min(field.min) }
      if (field.max !== undefined && value > field.max) return { code: "max", message: m.max(field.max) }
      return null
    case "date":
      return isIsoDate(value) ? null : { code: "type", message: m.invalidDate }
    case "boolean":
      return typeof value === "boolean" ? null : { code: "type", message: m.invalidOption }
    case "email":
      return isEmail(value) ? null : { code: "type", message: m.invalidEmail }
    case "phone":
      return isE164(value) ? null : { code: "type", message: m.invalidPhone }
    case "country":
      return isCountry(value) ? null : { code: "type", message: m.invalidCountry }
    case "address":
      return isAddress(value) ? null : { code: "type", message: m.invalidAddress }
    case "select": {
      const options = ctx.resolveOptions(field) ?? field.options ?? []
      return options.some((o) => o.value === value) ? null : { code: "type", message: m.invalidOption }
    }
  }
}

function validateDocument(field: DocumentField, fieldPath: string, ctx: EngineContext, errors: FieldError[]) {
  const m = runtimeMessages(ctx.locale)
  const docs = currentDocuments(ctx.documents, fieldPath)
  if (docs.length === 0) {
    if (field.required) errors.push({ fieldPath, code: "document_required", message: m.documentRequired })
    return
  }
  const missing = missingFaces(ctx.documents, fieldPath, ctx)
  if (missing.length > 0) errors.push({ fieldPath, code: "document_face_missing", message: m.documentFace(missing[0]!) })
}

function validateRepeater(field: RepeaterField, value: unknown, scope: SubmissionData, ctx: EngineContext, errors: FieldError[]) {
  const m = runtimeMessages(ctx.locale)
  const items = Array.isArray(value) ? (value as ItemData[]) : []
  if (field.min !== undefined && items.length < field.min) {
    errors.push({ fieldPath: field.key, code: "min_items", message: m.minItems(field.min) })
  } else if (field.max !== undefined && items.length > field.max) {
    errors.push({ fieldPath: field.key, code: "max_items", message: m.maxItems(field.max) })
  }
  items.forEach((item, i) => {
    const local = itemScope(scope, item)
    for (const itemField of field.fields) {
      if (!evaluate(itemField.visibleIf, local)) continue
      validateField(itemField, `${field.key}[${i}].${itemField.key}`, item[itemField.key], local, ctx, errors)
    }
  })
  const itemErrors = errors.some((e) => e.fieldPath.startsWith(`${field.key}[`))
  if (itemErrors) return
  for (const rule of field.validate ?? []) {
    if (!evaluateRepeaterRule(rule.rule, scope, items)) {
      errors.push({ fieldPath: field.key, code: "validate", message: localize(rule.message, ctx.locale) })
      return
    }
  }
}
