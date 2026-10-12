import { analyzeLogic, type Field, type FormSchema, type ItemField, type JsonLogic, type RepeaterField, type Step } from "@/lib/dsl"

/** Parcours et recherche dans un FormSchema (le DSL tel que stocké dans form_versions.schema). */

export interface FieldLocation {
  stepKey: string
  /** Liste qui contient le champ : step.fields, ou fields du repeater. */
  list: Field[]
  index: number
  field: Field
  repeater?: RepeaterField
}

export function locateField(schema: FormSchema, key: string): FieldLocation | null {
  for (const [stepKey, step] of Object.entries(schema.steps)) {
    for (let i = 0; i < step.fields.length; i++) {
      const field = step.fields[i]!
      if (field.key === key) return { stepKey, list: step.fields, index: i, field }
      if (field.type === "repeater") {
        const j = field.fields.findIndex((f) => f.key === key)
        if (j >= 0) return { stepKey, list: field.fields as Field[], index: j, field: field.fields[j]!, repeater: field }
      }
    }
  }
  return null
}

/** Tous les champs, items de repeater compris, dans l'ordre du schéma. */
export function allFields(schema: FormSchema): { field: Field; stepKey: string; repeater?: RepeaterField }[] {
  const out: { field: Field; stepKey: string; repeater?: RepeaterField }[] = []
  for (const [stepKey, step] of Object.entries(schema.steps))
    for (const field of step.fields) {
      out.push({ field, stepKey })
      if (field.type === "repeater") for (const item of field.fields) out.push({ field: item, stepKey, repeater: field })
    }
  return out
}

/** Clés de champ prises : uniques sur tout le formulaire, items de repeater compris. */
export const fieldKeys = (schema: FormSchema) => new Set(allFields(schema).map((f) => f.field.key))

/** Clés de champ d'une liste de champs (préréglages, copie). */
export function keysOf(fields: (Field | ItemField)[]): string[] {
  return fields.flatMap((f) => (f.type === "repeater" ? [f.key, ...f.fields.map((i) => i.key)] : [f.key]))
}

/** Transitions qui mènent à une étape. */
export function incoming(schema: FormSchema, stepKey: string) {
  return Object.entries(schema.steps).flatMap(([from, step]) =>
    step.next.map((transition, index) => ({ from, index, transition })).filter((t) => t.transition.goto === stepKey),
  )
}

/** Étapes qui peuvent précéder `stepKey`, elle comprise (graphe inversé). */
export function ancestors(schema: FormSchema, stepKey: string): Set<string> {
  const seen = new Set<string>()
  const queue = [stepKey]
  while (queue.length) {
    const key = queue.shift()!
    if (seen.has(key)) continue
    seen.add(key)
    for (const t of incoming(schema, key)) queue.push(t.from)
  }
  return seen
}

/**
 * Applique `fn` à chaque condition JSON Logic du schéma (transitions, visibleIf, règles
 * validate) et remplace la condition par son résultat. Mute le schéma (brouillon immer).
 */
export function mapLogic(schema: FormSchema, fn: (logic: JsonLogic) => JsonLogic) {
  const fieldLogic = (field: Field | ItemField) => {
    if (field.visibleIf) field.visibleIf = fn(field.visibleIf)
    if (field.type !== "info" && field.type !== "document") field.validate?.forEach((r) => (r.rule = fn(r.rule)))
  }
  for (const step of Object.values(schema.steps) as Step[]) {
    step.next.forEach((t) => {
      if (t.if) t.if = fn(t.if)
    })
    for (const field of step.fields) {
      fieldLogic(field)
      if (field.type === "repeater") field.fields.forEach(fieldLogic)
    }
  }
}

/** Remplace les références au champ `from` (var, missing, sum) par `to`. */
export function renameLogicRefs(logic: unknown, from: string, to: string): unknown {
  const rename = (name: unknown) => {
    if (typeof name !== "string") return name
    if (name === from) return to
    return name.startsWith(`${from}.`) ? `${to}${name.slice(from.length)}` : name
  }
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== "object") return node
    const entries = Object.entries(node)
    if (entries.length === 1) {
      const [op, args] = entries[0]!
      if (op === "var") return { var: Array.isArray(args) ? [rename(args[0]), ...args.slice(1).map(walk)] : rename(args) }
      if (op === "missing") return { missing: Array.isArray(args) ? args.map(rename) : rename(args) }
      if (op === "sum") return { sum: Array.isArray(args) ? args.map(rename) : rename(args) }
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, walk(v)]))
  }
  return walk(logic)
}

/** Vrai si la condition lit le champ `key` (var, missing ou sum). */
export function logicReads(logic: unknown, key: string): boolean {
  const { references, aggregates } = analyzeLogic(logic)
  return references.some((r) => r.name.split(".")[0] === key) || aggregates.some((a) => a.name === key)
}

/**
 * Valeurs d'option renommées : met à jour les comparaisons entre le champ `key` et une
 * ancienne valeur ({"==": [{"var": key}, "old"]}, listes de "in").
 */
export function renameOptionRefs(logic: unknown, key: string, renames: Map<string, string>): unknown {
  const isVar = (n: unknown) => varName(n) === key
  const mapValue = (v: unknown) => (typeof v === "string" && renames.has(v) ? renames.get(v) : v)
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== "object") return node
    const entries = Object.entries(node)
    if (entries.length === 1) {
      const [op, args] = entries[0]!
      if (["==", "!=", "in"].includes(op) && Array.isArray(args) && args.length === 2) {
        const [a, b] = args
        if (isVar(a)) return { [op]: [a, Array.isArray(b) ? b.map(mapValue) : mapValue(b)] }
        if (op === "in" && isVar(b)) return { [op]: [mapValue(a), b] }
      }
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, walk(v)]))
  }
  return walk(logic)
}

/** Nom lu par un nœud `{ "var": … }`, ou undefined. */
export function varName(node: unknown): string | undefined {
  if (!node || typeof node !== "object" || Array.isArray(node)) return undefined
  const entries = Object.entries(node)
  if (entries.length !== 1 || entries[0]![0] !== "var") return undefined
  const args = entries[0]![1]
  const name = Array.isArray(args) ? args[0] : args
  return typeof name === "string" ? name : undefined
}
