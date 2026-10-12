"use client"

import { memo } from "react"
import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react"
import { CircleAlert, Flag, Plus } from "lucide-react"
import { FieldIcon } from "@/components/builder/block-icons"
import { NODE_WIDTH, show } from "@/lib/builder"
import type { Step } from "@/lib/dsl"
import { cn } from "@/lib/utils"

export type StepNodeData = {
  stepKey: string
  step: Step
  lang: string
  isStart: boolean
  hasError: boolean
  isEnd: boolean
  readOnly: boolean
}
export type StepNodeType = Node<StepNodeData, "step">

function StepNodeComponent({ id, data, selected }: NodeProps<StepNodeType>) {
  const { step, stepKey, lang, isStart, hasError, isEnd, readOnly } = data
  const connection = useConnection()
  const isTarget = connection.inProgress && connection.fromNode.id !== id
  const items = step.fields.filter((f): f is Exclude<typeof f, { type: "info" }> => f.type !== "info")
  const shown = items.slice(0, 4)

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "group bg-card relative rounded-xl border shadow-sm transition-shadow",
        selected && "ring-primary shadow-md ring-2",
        isTarget && "ring-primary/60 ring-2 ring-dashed",
      )}
    >
      {/* Pendant qu'on tire une flèche, toute la carte sert de cible */}
      {isTarget && (
        <Handle
          type="target"
          position={Position.Top}
          id="drop"
          isConnectableStart={false}
          className="!absolute !inset-0 !h-full !w-full !translate-none !rounded-xl !border-0 !bg-transparent !opacity-0"
        />
      )}
      <Handle type="target" position={Position.Top} isConnectableStart={false} className="!bg-muted-foreground/40 !h-2 !w-8 !rounded-full !border-0" />

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          {isStart && (
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <Flag className="size-3" /> Début
            </span>
          )}
          {isEnd && <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">Fin</span>}
          <code className="text-muted-foreground ml-auto truncate font-mono text-[10px]">{stepKey}</code>
          {hasError && <CircleAlert className="text-destructive size-4 shrink-0" aria-label="Problème sur cette étape" />}
        </div>
        <div>
          <p className="leading-snug font-semibold">{show(step.title, lang) || "Sans titre"}</p>
          {step.description && <p className="text-muted-foreground line-clamp-1 text-xs">{show(step.description, lang)}</p>}
        </div>
        {shown.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {shown.map((f) => (
              <li key={f.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <FieldIcon field={f} className="size-3.5 shrink-0" />
                <span className="truncate">{show(f.label, lang)}</span>
              </li>
            ))}
            {items.length > shown.length && (
              <li className="text-muted-foreground pl-5 text-xs">
                + {items.length - shown.length} autre{items.length - shown.length > 1 ? "s" : ""}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs italic">Aucun champ. Double-cliquez pour en ajouter.</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={!readOnly}
        className={cn(
          "!bg-primary !text-primary-foreground !flex !size-5 !items-center !justify-center !rounded-full !border-2 !border-white transition-opacity",
          readOnly ? "!opacity-0" : "opacity-70 group-hover:opacity-100",
        )}
        title="Tirer pour créer une branche"
      >
        <Plus className="pointer-events-none size-3" />
      </Handle>
    </div>
  )
}

export const StepNode = memo(StepNodeComponent)
