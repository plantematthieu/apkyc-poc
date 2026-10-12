import { KEY_PATTERN, MAX_KEY_LENGTH, type Field, type FormSchema, type SelectOption, type Step } from "@/lib/dsl"
import { PALETTE, type PaletteKind } from "./field-kinds"
import { fieldKeys } from "./schema"

/** Clé du DSL à partir d'un libellé : ^[a-z][a-z0-9_]*$, 64 caractères au plus. */
export function slugify(s: string): string {
  const slug = (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  if (!slug) return ""
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  const root = (base || "field").slice(0, MAX_KEY_LENGTH - 4)
  let key = root
  let n = 2
  while (set.has(key)) key = `${root}_${n++}`
  return key
}

export const isValidKey = (key: string) => key.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(key)

/** Saisie d'une clé : minuscules, chiffres et _ (la première lettre est vérifiée à la validation). */
export const sanitizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, MAX_KEY_LENGTH)

export function option(label: string, taken: string[] = []): SelectOption {
  return { value: uniqueKey(slugify(label) || "option", taken), label: { fr: label } }
}

export function options(...labels: string[]): SelectOption[] {
  const out: SelectOption[] = []
  for (const label of labels) out.push(option(label, out.map((o) => o.value)))
  return out
}

/** Nouveau champ depuis la palette, avec une clé libre sur tout le formulaire. */
export function newField(kind: PaletteKind, schema: FormSchema): Field {
  const taken = fieldKeys(schema)
  const label = { fr: PALETTE[kind].label }
  const key = (base: string) => {
    const k = uniqueKey(base, taken)
    taken.add(k)
    return k
  }
  switch (kind) {
    case "info":
      return { key: key("info"), type: "info", content: { fr: "Texte affiché au client." } }
    case "document":
      return { key: key("document"), type: "document", label, required: true, documentTypes: ["ID_CARD", "PASSPORT"] }
    case "repeater":
      return {
        key: key("related_parties"),
        type: "repeater",
        label: { fr: "Personnes liées" },
        min: 1,
        max: 5,
        bind: { relation: "related_party", nature: "natural_person" },
        fields: [
          { key: key("related_last_name"), type: "text", label: { fr: "Nom" }, required: true, bind: "party.last_name" },
          { key: key("related_first_names"), type: "text", multiple: true, label: { fr: "Prénoms" }, required: true, bind: "party.first_names" },
        ],
      }
    case "select":
    case "select_multiple":
      return {
        key: key(kind === "select" ? "choice" : "choices"),
        type: "select",
        ...(kind === "select_multiple" ? { multiple: true } : {}),
        label,
        options: options("Option 1", "Option 2"),
      }
    default:
      return { key: key(kind), type: kind, label }
  }
}

export function newStepKey(schema: FormSchema, title = "step"): string {
  return uniqueKey(slugify(title) || "step", Object.keys(schema.steps))
}

export const newStep = (title: string): Step => ({ title: { fr: title }, fields: [], next: [] })
