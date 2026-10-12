"use client"

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { useEditor } from "@/store/editor"

export type ConditionEdgeData = {
  from: string
  index: number
  label: string
  isDefault: boolean
  order: number | null
  hasError: boolean
  showLabel: boolean
}
export type ConditionEdgeType = Edge<ConditionEdgeData, "condition">

export const edgeId = (from: string, index: number) => `${from}#${index}`

export function ConditionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }: EdgeProps<ConditionEdgeType>) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 })
  const select = useEditor((s) => s.select)
  if (!data) return null
  // « Sinon » sous l'étape de départ, conditions au-dessus de l'étape visée : les étiquettes ne se chevauchent pas
  const labelX = data.isDefault ? sourceX : targetX
  const labelY = data.isDefault ? sourceY + 24 : targetY - 28

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: data.hasError ? "var(--destructive)" : selected ? "var(--primary)" : data.isDefault ? "var(--muted-foreground)" : "var(--condition-foreground)",
          strokeDasharray: data.isDefault ? "5 4" : undefined,
        }}
      />
      {data.showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              select({ kind: "transition", from: data.from, index: data.index })
            }}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              "nodrag nopan pointer-events-auto absolute flex max-w-56 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
              data.isDefault ? "bg-background text-muted-foreground border-border" : "bg-condition text-condition-foreground border-condition-foreground/20",
              data.hasError && "border-destructive text-destructive",
              selected && "ring-primary ring-2",
            )}
            title={data.label}
          >
            {data.order !== null && <span className="opacity-70 tabular-nums">{data.order}.</span>}
            <span className="truncate">{data.label}</span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
