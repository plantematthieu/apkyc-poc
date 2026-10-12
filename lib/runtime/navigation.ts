import type { FormSchema } from "@/lib/dsl"
import { collectData, stepValues } from "./collect"
import { evaluate } from "./logic"
import type { EngineContext, SubmissionData } from "./types"
import { validateStep } from "./validation"

/**
 * nextStep : première transition dont la condition est vraie (ou absente). null : étape
 * finale, ou aucune transition applicable (dead_end_branch, refusé à la publication).
 */
export function nextStep(schema: FormSchema, stepKey: string, data: SubmissionData): string | null {
  for (const transition of schema.steps[stepKey]?.next ?? []) {
    if (evaluate(transition.if, data)) return transition.goto in schema.steps ? transition.goto : null
  }
  return null
}

export const isFinalStep = (schema: FormSchema, stepKey: string) => (schema.steps[stepKey]?.next.length ?? 0) === 0

export interface PathResult {
  /** Étapes parcourues depuis start, étape courante comprise. */
  path: string[]
  /** Première étape incomplète ; null si le parcours est complet. */
  current: string | null
  /** Vrai si le parcours va jusqu'à une étape finale valide. */
  complete: boolean
  /** Aucune transition applicable depuis `current` alors qu'elle est valide. */
  deadEnd: boolean
}

/**
 * computePath : rejoue le parcours depuis start avec les réponses — validateStep sur chaque
 * étape, puis nextStep — et s'arrête à la première étape incomplète. C'est ce que fait le
 * serveur à chaque étape validée et à la transmission.
 */
export function computePath(schema: FormSchema, raw: SubmissionData, ctx: EngineContext): PathResult {
  const path: string[] = []
  let key: string | null = schema.start in schema.steps ? schema.start : null
  while (key && !path.includes(key)) {
    path.push(key)
    const scope = { ...collectData(schema, path.slice(0, -1), raw), ...stepValues(schema, key, raw) }
    if (validateStep(schema, key, scope, ctx).length > 0) return { path, current: key, complete: false, deadEnd: false }
    const next = nextStep(schema, key, collectData(schema, path, raw))
    if (next === null) {
      const final = isFinalStep(schema, key)
      return { path, current: final ? null : key, complete: final, deadEnd: !final }
    }
    key = next
  }
  return { path, current: key, complete: false, deadEnd: false }
}
