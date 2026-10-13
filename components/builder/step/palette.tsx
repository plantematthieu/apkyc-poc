"use client"

import { useDraggable } from "@dnd-kit/core"
import { PALETTE, PALETTE_GROUPS, type PaletteKind } from "@/lib/builder"
import { cn } from "@/lib/utils"
import { PALETTE_ICONS } from "../block-icons"
import type { DragData } from "./field-card"

export function Palette({ onAdd }: { onAdd: (k: PaletteKind) => void }) {
  return (
    <aside className="bg-background flex min-h-0 flex-col overflow-y-auto border-r p-3">
      <p className="text-muted-foreground mb-3 text-xs">Glissez un champ dans l&apos;étape, ou cliquez pour l&apos;ajouter à la fin.</p>
      <div className="flex flex-col gap-4">
        {PALETTE_GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{g.title}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {g.kinds.map((k) => (
                <PaletteItem key={k} kind={k} onAdd={() => onAdd(k)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function PaletteItem({ kind, onAdd }: { kind: PaletteKind; onAdd: () => void }) {
  const data: DragData = { kind: "palette", paletteKind: kind, label: PALETTE[kind].label }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${kind}`, data })
  const Icon = PALETTE_ICONS[kind]
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onAdd}
      title={PALETTE[kind].hint}
      className={cn(
        "bg-card hover:border-primary/40 hover:bg-accent flex cursor-grab items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-medium transition-colors active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="leading-tight">{PALETTE[kind].label}</span>
    </button>
  )
}
