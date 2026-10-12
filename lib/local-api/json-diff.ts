import { canonicalJson } from "./canonical-json"
import type { JsonChange } from "./types"

/**
 * Différences entre deux valeurs JSON, sans connaissance du DSL (apps/api/src/lib/json-diff.ts) :
 * objets comparés clé par clé, tableaux index par index.
 */
export function diffJson(before: unknown, after: unknown): JsonChange[] {
  const changes: JsonChange[] = []
  walk(before, after, "", changes)
  return changes
}

function walk(before: unknown, after: unknown, path: string, out: JsonChange[]): void {
  if (canonicalJson(before) === canonicalJson(after)) return

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    for (const key of keys) {
      const child = path ? `${path}.${key}` : key
      if (!(key in after)) out.push({ op: "removed", path: child, before: before[key] })
      else if (!(key in before)) out.push({ op: "added", path: child, after: after[key] })
      else walk(before[key], after[key], child, out)
    }
    return
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const child = `${path}[${i}]`
      if (i >= after.length) out.push({ op: "removed", path: child, before: before[i] })
      else if (i >= before.length) out.push({ op: "added", path: child, after: after[i] })
      else walk(before[i], after[i], child, out)
    }
    return
  }

  out.push({ op: "modified", path: path || "$", before, after })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
