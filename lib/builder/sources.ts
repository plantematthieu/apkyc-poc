import type { Field, FormSchema, InputField, ItemField, RepeaterField } from "@/lib/dsl"
import { getCountryOptions } from "@/lib/countries"
import type { Property } from "@/lib/local-api/types"
import type { Scalar, UiOperator } from "./conditions"
import { ancestors } from "./schema"
import { show } from "./text"

/**
 * Champs utilisables dans une condition, selon où elle s'évalue (règles du DSL :
 * références disponibles, items de repeater, sum dans les règles d'un repeater).
 */
export interface FieldSource {
  /** Nom lu par var (ou par sum). */
  path: string
  label: string
  /** Regroupement affiché : étape, ou « même fiche ». */
  group: string
  type: InputField["type"] | "address_part"
  multiple: boolean
  sum?: boolean
  choices?: { value: Scalar; label: string }[]
}

export interface SourceContext {
  schema: FormSchema
  properties: Property[]
  lang?: string
}

const ADDRESS_PARTS: { part: string; label: string }[] = [
  { part: "country", label: "pays" },
  { part: "postalCode", label: "code postal" },
  { part: "city", label: "ville" },
]

export function choicesOf(field: InputField, properties: Property[], lang = "fr"): { value: Scalar; label: string }[] | undefined {
  if (field.type === "boolean")
    return [
      { value: true, label: "Oui" },
      { value: false, label: "Non" },
    ]
  if (field.type === "country") return getCountryOptions(lang).map((c) => ({ value: c.code, label: c.name }))
  if (field.type !== "select") return undefined
  const bound = field.bind && field.bind !== "party.nature" ? properties.find((p) => `${p.scope}.${p.key}` === field.bind) : undefined
  return (bound?.options ?? field.options ?? []).map((o) => ({ value: o.value, label: show(o.label, lang) }))
}

function sourcesOf(field: Field | ItemField, group: string, ctx: SourceContext): FieldSource[] {
  if (field.type === "info" || field.type === "document" || field.type === "repeater") return []
  const label = show(field.label, ctx.lang) || field.key
  const base: FieldSource = {
    path: field.key,
    label,
    group,
    type: field.type,
    multiple: !!field.multiple,
    choices: choicesOf(field, ctx.properties, ctx.lang),
  }
  if (field.type !== "address" || field.multiple) return [base]
  return [
    base,
    ...ADDRESS_PARTS.map(({ part, label: partLabel }) => ({
      path: `${field.key}.${part}`,
      label: `${label} (${partLabel})`,
      group,
      type: (part === "country" ? "country" : "address_part") as FieldSource["type"],
      multiple: false,
      choices: part === "country" ? getCountryOptions(ctx.lang ?? "fr").map((c) => ({ value: c.code, label: c.name })) : undefined,
    })),
  ]
}

/** Branche partant de `stepKey` : champs des étapes qui peuvent la précéder, elle comprise. */
export function transitionSources(ctx: SourceContext, stepKey: string): FieldSource[] {
  const anc = ancestors(ctx.schema, stepKey)
  return Object.entries(ctx.schema.steps)
    .filter(([key]) => anc.has(key))
    .flatMap(([, step]) => step.fields.flatMap((f) => sourcesOf(f, show(step.title, ctx.lang), ctx)))
}

/**
 * Condition d'affichage (ou règle) d'un champ : champs des étapes précédentes, champs placés
 * avant lui dans l'étape et, dans un repeater, champs précédents de la même fiche.
 * `includeSelf` : une règle validate lit la valeur du champ lui-même.
 */
export function fieldSources(ctx: SourceContext, stepKey: string, fieldKey: string, includeSelf = false): FieldSource[] {
  const anc = ancestors(ctx.schema, stepKey)
  const out: FieldSource[] = []
  for (const [key, step] of Object.entries(ctx.schema.steps)) {
    if (!anc.has(key)) continue
    const group = show(step.title, ctx.lang)
    if (key !== stepKey) {
      step.fields.forEach((f) => out.push(...sourcesOf(f, group, ctx)))
      continue
    }
    for (const f of step.fields) {
      if (f.key === fieldKey) {
        if (includeSelf) out.push(...sourcesOf(f, group, ctx))
        break
      }
      if (f.type === "repeater" && f.fields.some((i) => i.key === fieldKey)) {
        const item = `${show(f.label, ctx.lang)} (même fiche)`
        for (const i of f.fields) {
          if (i.key === fieldKey) {
            if (includeSelf) out.push(...sourcesOf(i, item, ctx))
            break
          }
          out.push(...sourcesOf(i, item, ctx))
        }
        break
      }
      out.push(...sourcesOf(f, group, ctx))
    }
  }
  return out
}

/** Règle validate d'un repeater : sommes des champs nombre des items, et champs du formulaire. */
export function repeaterRuleSources(ctx: SourceContext, stepKey: string, repeater: RepeaterField): FieldSource[] {
  const sums: FieldSource[] = repeater.fields
    .filter((f): f is InputField => f.type === "number" && !f.multiple)
    .map((f) => ({ path: f.key, label: show(f.label, ctx.lang), group: "Somme sur les fiches", type: "number", multiple: false, sum: true }))
  return [...sums, ...fieldSources(ctx, stepKey, repeater.key)]
}

/** Opérateurs proposés pour une source. */
export function operatorsFor(source: FieldSource | undefined): UiOperator[] {
  if (!source) return ["eq", "neq", "filled", "empty"]
  if (source.sum) return ["eq", "neq", "gt", "gte", "lt", "lte"]
  if (source.multiple) return ["contains", "notContains", "filled", "empty"]
  switch (source.type) {
    case "boolean":
      return ["eq", "neq", "filled", "empty"]
    case "select":
    case "country":
      return ["eq", "neq", "in", "notIn", "filled", "empty"]
    case "number":
    case "date":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "filled", "empty"]
    case "address":
      return ["filled", "empty"]
    default:
      return ["eq", "neq", "filled", "empty"]
  }
}
