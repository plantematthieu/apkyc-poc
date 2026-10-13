import type { DocumentField, Field, FormSchema, InputField, ItemField, RepeaterField, SelectOption } from "@/lib/dsl"
import { collectData, documentSlots, stepValues } from "./collect"
import { facesOf } from "./documents"
import { evaluate, evaluateRepeaterRule, itemScope } from "./logic"
import { isFinalStep, nextStep } from "./navigation"
import type { EngineContext, FieldError, ItemData, PreviewDocument, SubmissionData } from "./types"
import { validateStep, checkValue } from "./validation"
import { isEmpty, today } from "./values"

/**
 * Remplissage automatique de l'aperçu : parcourt le formulaire depuis start et, étape par
 * étape, invente des réponses qui passent validateStep (types, formats, bornes, règles
 * validate, sommes des repeaters), dépose les pièces exigées, puis suit nextStep.
 *
 * - `default` : premiers choix des listes, réponses « Non » quand c'est possible ;
 * - `random` : choix tirés au hasard, pour explorer les autres branches.
 */
export type AutofillMode = "default" | "random"

export interface AutofillResult {
  raw: SubmissionData
  documents: PreviewDocument[]
  /** Étapes parcourues. */
  path: string[]
  /** Vrai si le parcours va jusqu'à une étape finale valide. */
  complete: boolean
  /** Étape où le remplissage s'est arrêté, et pourquoi. */
  stoppedAt?: { stepKey: string; errors: FieldError[]; deadEnd: boolean }
}

interface Options {
  mode: AutofillMode
  /** Faces exigées par type de pièce, et fraîcheur. */
  documentTypes: Map<string, { twoSided: boolean; validityDays: number | null; mimeType: string }>
  random?: () => number
}

const LAST_NAMES = ["Dupont", "Martin", "Durand", "Bernard", "Petit", "Moreau", "Laurent", "Simon"]
const FIRST_NAMES = ["Paul", "Claire", "Luc", "Sophie", "Hugo", "Emma", "Louis", "Alice"]
const COUNTRIES = ["FR", "BE", "DE", "ES", "IT", "LU", "CH", "GB"]

/** Valeurs plausibles par clé de propriété (ou de champ), avant les valeurs génériques. */
function textHints(name: string, i: number): string[] {
  const n = name.toLowerCase()
  if (/last_name|nom/.test(n)) return [LAST_NAMES[i % LAST_NAMES.length]!]
  if (/first_name|prenom/.test(n)) return [FIRST_NAMES[i % FIRST_NAMES.length]!]
  if (/birth_place|city|ville|lieu/.test(n)) return ["Vannes"]
  if (/company_name|denomination|raison/.test(n)) return ["ACME SAS"]
  if (/legal_form|forme/.test(n)) return ["SAS"]
  if (/siren/.test(n)) return ["552100554"]
  if (/siret/.test(n)) return ["55210055400013"]
  if (/iban/.test(n)) return ["FR7630006000011234567890189"]
  if (/postal|zip/.test(n)) return ["56000"]
  if (/profession|occupation|job/.test(n)) return ["Ingénieur"]
  if (/role|position|fonction/.test(n)) return ["Gérant"]
  return []
}

/** Chaîne qui respecte un motif simple (^[0-9]{9}$, ^[A-Z]{2}…$) quand les exemples échouent. */
function fromPattern(pattern: string): string | undefined {
  const m = /^\^?\[0-9\]\{(\d+)\}\$?$/.exec(pattern)
  if (m) return "1".repeat(Number(m[1]))
  const n = /^\^?\[0-9\]\{(\d+),(\d*)\}\$?$/.exec(pattern)
  if (n) return "1".repeat(Number(n[1]))
  return undefined
}

function numberCandidates(field: InputField, name: string): number[] {
  const { min, max } = field
  const n = name.toLowerCase()
  const preferred = /price|prix|amount|montant/.test(n) ? 250000 : /premium|prime/.test(n) ? 1200 : /percent|share|quote/.test(n) ? 50 : 1000
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const out = [clamp(preferred)]
  if (min !== undefined && max !== undefined) out.push(Math.round((min + max) / 2), min, max)
  else if (min !== undefined) out.push(min)
  else if (max !== undefined) out.push(max)
  return [...new Set(out)]
}

export function autofill(schema: FormSchema, ctx: EngineContext, opts: Options): AutofillResult {
  const random = opts.random ?? Math.random
  const pick = <T>(list: T[]): T[] => (opts.mode === "random" ? [...list].sort(() => random() - 0.5) : list)
  const raw: SubmissionData = {}
  const documents: PreviewDocument[] = []
  const path: string[] = []
  let docSeq = 0

  /** Valeurs candidates d'un champ de saisie, dans l'ordre d'essai. */
  const candidates = (field: InputField, index: number): unknown[] => {
    const name = field.bind?.split(".")[1] ?? field.key
    const single = (): unknown[] => {
      switch (field.type) {
        case "text": {
          const hints = textHints(name, index)
          const out: unknown[] = [...hints, "Exemple"]
          if (field.pattern) {
            const generated = fromPattern(field.pattern)
            if (generated) out.unshift(generated)
            out.unshift(...hints, "552100554", "56000", "FR7630006000011234567890189")
          }
          return out
        }
        case "number":
          return numberCandidates(field, name)
        case "date":
          return /birth|naissance/.test(name) ? [`19${70 + (index % 20)}-04-12`] : [today()]
        case "boolean":
          return pick([false, true])
        case "email":
          return [`${LAST_NAMES[index % LAST_NAMES.length]!.toLowerCase()}@example.com`]
        case "phone":
          return ["+33612345678"]
        case "country":
          return opts.mode === "random" ? pick(COUNTRIES) : ["FR"]
        case "address":
          return [{ line1: "12 rue des Lilas", postalCode: "56000", city: "Vannes", country: "FR" }]
        case "select":
          return pick((ctx.resolveOptions(field) ?? field.options ?? ([] as SelectOption[])).map((o) => o.value))
      }
    }
    const values = single()
    return field.multiple ? values.map((v) => [v]) : values
  }

  /** Première valeur qui passe le contrôle de type et les règles du champ. */
  const fillInput = (field: InputField, scope: SubmissionData, index: number): unknown => {
    const list = candidates(field, index)
    for (const value of list) {
      if (checkValue(field, value, ctx)) continue
      const local = { ...scope, [field.key]: value }
      if ((field.validate ?? []).every((r) => evaluate(r.rule, local))) return value
    }
    return list[0]
  }

  /** Dépose une pièce (toutes ses faces) pour un champ document visible. */
  const fillDocument = (field: DocumentField, fieldPath: string) => {
    if (documents.some((d) => d.fieldPath === fieldPath)) return
    const code = pick(field.documentTypes)[0]
    if (!code) return
    const type = opts.documentTypes.get(code)
    for (const face of facesOf(type?.twoSided ?? false)) {
      documents.push({
        id: `autofill-${++docSeq}`,
        fieldPath,
        documentTypeCode: code,
        face,
        originalFilename: `${code.toLowerCase()}${face === "single" ? "" : `-${face}`}.pdf`,
        mimeType: type?.mimeType ?? "application/pdf",
        sizeBytes: 120_000,
        issuedAt: type?.validityDays ? today() : undefined,
      })
    }
  }

  const fillItem = (repeater: RepeaterField, scope: SubmissionData, index: number, count: number): ItemData => {
    const item: ItemData = {}
    const sums = new Set((repeater.validate ?? []).flatMap((r) => JSON.stringify(r.rule).match(/"sum":"([a-z0-9_]+)"/g) ?? []).map((s) => s.slice(7, -1)))
    for (let pass = 0; pass < 2; pass++)
      for (const f of repeater.fields as ItemField[]) {
        if (f.type === "info" || f.type === "document" || !evaluate(f.visibleIf, itemScope(scope, item))) continue
        if (item[f.key] !== undefined) continue
        // Champ agrégé par une règle sum : répartit 100 entre les items.
        if (sums.has(f.key) && f.type === "number" && !f.multiple) {
          const share = Math.floor(100 / count)
          item[f.key] = index === count - 1 ? 100 - share * (count - 1) : share
          continue
        }
        item[f.key] = fillInput(f, itemScope(scope, item), index)
      }
    return item
  }

  /** Remplit les champs visibles d'une étape ; deux passes pour les champs qui apparaissent. */
  const fillStep = (stepKey: string) => {
    const prev = collectData(schema, path.slice(0, -1), raw)
    const fields = schema.steps[stepKey]!.fields
    for (let pass = 0; pass < 3; pass++) {
      for (const f of fields as Field[]) {
        const scope = { ...prev, ...stepValues(schema, stepKey, raw) }
        if (!evaluate(f.visibleIf, scope)) {
          delete raw[f.key]
          continue
        }
        if (f.type === "info" || f.type === "document" || !isEmpty(raw[f.key])) continue
        if (f.type === "repeater") {
          const min = f.min ?? 0
          const max = f.max ?? Math.max(min, 3)
          const wanted = opts.mode === "random" ? min + Math.floor(random() * (Math.min(max, min + 2) - min + 1)) : Math.max(min, 1)
          const count = Math.min(Math.max(wanted, min, 1), max)
          let items = Array.from({ length: count }, (_, i) => fillItem(f, scope, i, count))
          // Repli si une règle sur l'ensemble des items échoue : un seul item à 100 %.
          if (!(f.validate ?? []).every((r) => evaluateRepeaterRule(r.rule, scope, items)) && min <= 1) items = [fillItem(f, scope, 0, 1)]
          raw[f.key] = items
          continue
        }
        raw[f.key] = fillInput(f, scope, 0)
      }
    }
  }

  let key: string | null = schema.start in schema.steps ? schema.start : null
  while (key && !path.includes(key)) {
    path.push(key)
    fillStep(key)
    const data = collectData(schema, path, raw)
    for (const slot of documentSlots(schema, [key], { ...collectData(schema, path.slice(0, -1), raw), ...stepValues(schema, key, raw) }))
      if (slot.field.required || opts.mode === "random") fillDocument(slot.field, slot.fieldPath)
    const scope = { ...collectData(schema, path.slice(0, -1), raw), ...stepValues(schema, key, raw) }
    const errors = validateStep(schema, key, scope, { ...ctx, documents })
    if (errors.length) return { raw, documents, path, complete: false, stoppedAt: { stepKey: key, errors, deadEnd: false } }
    const next = nextStep(schema, key, data)
    if (next === null) {
      if (isFinalStep(schema, key)) return { raw, documents, path, complete: true }
      return { raw, documents, path, complete: false, stoppedAt: { stepKey: key, errors: [], deadEnd: true } }
    }
    key = next
  }
  return { raw, documents, path, complete: false }
}
