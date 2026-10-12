import jsonLogic from "json-logic-js"
import type { JsonLogic } from "@/lib/dsl"
import type { ItemData, SubmissionData } from "./types"

/**
 * Évaluation des conditions JSON Logic avec json-logic-js, comme le prévoit le DSL (même
 * moteur côté navigateur et côté serveur). Seul ajout : l'opérateur `sum` des règles de
 * repeater, remplacé par sa valeur avant l'évaluation (json-logic-js ne passe pas les données
 * aux opérateurs personnalisés).
 */

/** Une condition absente est vraie ; une condition vide ou illisible est fausse. */
export function evaluate(rule: JsonLogic | undefined, data: SubmissionData): boolean {
  if (rule === undefined) return true
  if (!rule || typeof rule !== "object" || Object.keys(rule).length !== 1) return false
  try {
    return jsonLogic.truthy(jsonLogic.apply(rule as jsonLogic.RulesLogic, data))
  } catch {
    return false
  }
}

/** Portée d'un champ d'item : ses voisins d'item masquent les champs du formulaire de même clé. */
export const itemScope = (data: SubmissionData, item: ItemData): SubmissionData => ({ ...data, ...item })

/** Règle validate d'un repeater : `{ "sum": "share" }` devient la somme du champ sur les items. */
export function evaluateRepeaterRule(rule: JsonLogic, data: SubmissionData, items: ItemData[]): boolean {
  return evaluate(replaceSums(rule, items) as JsonLogic, data)
}

function replaceSums(node: unknown, items: ItemData[]): unknown {
  if (Array.isArray(node)) return node.map((n) => replaceSums(n, items))
  if (node && typeof node === "object") {
    const entries = Object.entries(node)
    if (entries.length === 1 && entries[0]![0] === "sum") {
      const arg = entries[0]![1]
      const key = Array.isArray(arg) ? arg[0] : arg
      return items.reduce((total, item) => {
        const n = item[key as string]
        return typeof n === "number" && Number.isFinite(n) ? total + n : total
      }, 0)
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, replaceSums(v, items)]))
  }
  return node
}
