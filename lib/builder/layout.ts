import { Graph, layout } from "@dagrejs/dagre"
import type { FormSchema } from "@/lib/dsl"

export const NODE_WIDTH = 260
export const NODE_HEIGHT = 120

export type Positions = Record<string, { x: number; y: number }>

/**
 * Disposition automatique de haut en bas (dagre). Le DSL ne stocke pas les positions : le
 * builder recalcule la disposition à l'ouverture.
 */
export function autoLayout(schema: FormSchema): Positions {
  const g = new Graph()
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const keys = Object.keys(schema.steps)
  keys.forEach((k) => g.setNode(k, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  for (const [from, step] of Object.entries(schema.steps))
    for (const t of step.next) if (t.goto in schema.steps && t.goto !== from) g.setEdge(from, t.goto)
  layout(g)
  const out: Positions = {}
  keys.forEach((k) => {
    const n = g.node(k)
    out[k] = { x: Math.round(n.x - NODE_WIDTH / 2), y: Math.round(n.y - NODE_HEIGHT / 2) }
  })
  return out
}
