import type { JsonLogic } from "@/lib/dsl"
import { varName } from "./schema"

/**
 * Éditeur de conditions « en phrases » (Si [champ] [opérateur] [valeur], ET / OU) au-dessus
 * du JSON Logic stocké dans le schéma. Les conditions écrites à la main hors de ce
 * sous-ensemble restent modifiables en JSON.
 */

export type Scalar = string | number | boolean
export type UiOperator = "eq" | "neq" | "in" | "notIn" | "contains" | "notContains" | "gt" | "gte" | "lt" | "lte" | "filled" | "empty"

export interface UiRule {
  kind: "rule"
  /** Nom lu par var : clé du champ, ou partie d'adresse ("home_address.country"). */
  field: string
  /** Somme du champ sur les items (règles validate d'un repeater). */
  sum?: boolean
  operator: UiOperator
  value?: Scalar | Scalar[] | null
}

export interface UiGroup {
  kind: "group"
  combinator: "and" | "or"
  rules: UiNode[]
}

export type UiNode = UiRule | UiGroup

export const OPERATORS: Record<UiOperator, { label: string; needsValue: boolean; multi?: boolean }> = {
  eq: { label: "est", needsValue: true },
  neq: { label: "n'est pas", needsValue: true },
  in: { label: "est parmi", needsValue: true, multi: true },
  notIn: { label: "n'est pas parmi", needsValue: true, multi: true },
  contains: { label: "contient", needsValue: true },
  notContains: { label: "ne contient pas", needsValue: true },
  gt: { label: "est supérieur à", needsValue: true },
  gte: { label: "est au moins", needsValue: true },
  lt: { label: "est inférieur à", needsValue: true },
  lte: { label: "est au plus", needsValue: true },
  filled: { label: "est renseigné", needsValue: false },
  empty: { label: "n'est pas renseigné", needsValue: false },
}

const COMPARE: Partial<Record<UiOperator, string>> = { eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }
const FROM_COMPARE: Record<string, UiOperator> = { "==": "eq", "!=": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" }

export const emptyGroup = (): UiGroup => ({ kind: "group", combinator: "and", rules: [] })

// ---------------------------------------------------------------- Vers JSON Logic

export function toLogic(node: UiNode): JsonLogic {
  if (node.kind === "group") {
    const rules = node.rules.map(toLogic).filter((r) => Object.keys(r).length > 0)
    if (rules.length === 0) return {}
    if (rules.length === 1) return rules[0]!
    return { [node.combinator]: rules }
  }
  const left = node.sum ? { sum: node.field } : { var: node.field }
  const value = node.value ?? null
  switch (node.operator) {
    case "in":
      return { in: [left, Array.isArray(value) ? value : value === null ? [] : [value]] }
    case "notIn":
      return { "!": { in: [left, Array.isArray(value) ? value : value === null ? [] : [value]] } }
    case "contains":
      return { in: [Array.isArray(value) ? (value[0] ?? null) : value, left] }
    case "notContains":
      return { "!": { in: [Array.isArray(value) ? (value[0] ?? null) : value, left] } }
    case "filled":
      return { "!": { missing: [node.field] } }
    case "empty":
      return { missing: [node.field] }
    default:
      return { [COMPARE[node.operator]!]: [left, Array.isArray(value) ? (value[0] ?? null) : value] }
  }
}

// ---------------------------------------------------------------- Depuis JSON Logic

/** Condition éditable en phrases, ou null si elle sort du sous-ensemble. */
export function fromLogic(logic: JsonLogic | undefined): UiGroup | null {
  if (!logic || Object.keys(logic).length === 0) return emptyGroup()
  const node = parse(logic)
  if (!node) return null
  return node.kind === "group" ? node : { kind: "group", combinator: "and", rules: [node] }
}

const isScalar = (v: unknown): v is Scalar | null => v === null || ["string", "number", "boolean"].includes(typeof v)

function single(node: unknown): [string, unknown] | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null
  const entries = Object.entries(node)
  return entries.length === 1 ? entries[0]! : null
}

function operand(node: unknown): { field: string; sum?: boolean } | null {
  const name = varName(node)
  if (name) return { field: name }
  const entry = single(node)
  if (entry && entry[0] === "sum") {
    const key = Array.isArray(entry[1]) ? entry[1][0] : entry[1]
    return typeof key === "string" ? { field: key, sum: true } : null
  }
  return null
}

function parse(node: unknown): UiNode | null {
  const entry = single(node)
  if (!entry) return null
  const [op, args] = entry

  if (op === "and" || op === "or") {
    if (!Array.isArray(args)) return null
    const rules = args.map(parse)
    if (rules.some((r) => r === null)) return null
    return { kind: "group", combinator: op, rules: rules as UiNode[] }
  }

  if (op === "!") {
    const inner = Array.isArray(args) ? (args.length === 1 ? args[0] : null) : args
    const missing = single(inner)
    if (missing && missing[0] === "missing") {
      const names = Array.isArray(missing[1]) ? missing[1] : [missing[1]]
      return names.length === 1 && typeof names[0] === "string" ? { kind: "rule", field: names[0], operator: "filled" } : null
    }
    const rule = parse(inner)
    if (rule?.kind === "rule" && rule.operator === "in") return { ...rule, operator: "notIn" }
    if (rule?.kind === "rule" && rule.operator === "contains") return { ...rule, operator: "notContains" }
    return null
  }

  if (op === "!!") {
    const inner = Array.isArray(args) ? args[0] : args
    const name = varName(inner)
    return name ? { kind: "rule", field: name, operator: "filled" } : null
  }

  if (op === "missing") {
    const names = Array.isArray(args) ? args : [args]
    return names.length === 1 && typeof names[0] === "string" ? { kind: "rule", field: names[0], operator: "empty" } : null
  }

  if (!Array.isArray(args) || args.length !== 2) return null
  const [a, b] = args

  if (op in FROM_COMPARE) {
    const left = operand(a)
    if (!left || !isScalar(b)) return null
    return { kind: "rule", ...left, operator: FROM_COMPARE[op]!, value: b }
  }

  if (op === "in") {
    const left = operand(a)
    if (left && !left.sum && Array.isArray(b) && b.every(isScalar)) return { kind: "rule", field: left.field, operator: "in", value: b as Scalar[] }
    const right = varName(b)
    if (right && isScalar(a)) return { kind: "rule", field: right, operator: "contains", value: a }
  }
  return null
}

// ---------------------------------------------------------------- Lecture

export interface DescribeOptions {
  /** Libellé d'un champ (ou d'une partie d'adresse) à partir de son nom. */
  label: (field: string) => string
  /** Libellé d'une valeur (option, pays, Oui/Non). */
  value: (field: string, value: Scalar) => string
}

export function describe(node: UiNode, options: DescribeOptions, nested = false): string {
  if (node.kind === "group") {
    if (node.rules.length === 0) return "Condition à définir"
    const parts = node.rules.map((r) => describe(r, options, true))
    const text = parts.join(node.combinator === "and" ? " et " : " ou ")
    return nested && parts.length > 1 ? `(${text})` : text
  }
  const name = node.sum ? `la somme de ${options.label(node.field)}` : options.label(node.field)
  const op = OPERATORS[node.operator]
  if (!op.needsValue) return `${name} ${op.label}`
  const values = Array.isArray(node.value) ? node.value : node.value === undefined || node.value === null ? [] : [node.value]
  const text = values.length ? values.map((v) => options.value(node.field, v)).join(" ou ") : "…"
  return `${name} ${op.label} ${text}`
}

/** Description d'une condition JSON Logic quelconque. */
export function describeLogic(logic: JsonLogic | undefined, options: DescribeOptions): string {
  const ui = fromLogic(logic)
  return ui ? describe(ui, options) : "condition JSON Logic"
}
