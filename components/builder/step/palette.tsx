"use client"

import { useDraggable } from "@dnd-kit/core"
import { useMemo } from "react"
import { Blocks } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { keysOf, PALETTE, PALETTE_GROUPS, PRESETS, type PaletteKind, type Preset } from "@/lib/builder"
import { cn } from "@/lib/utils"
import { PALETTE_ICONS } from "../block-icons"
import type { DragData } from "./field-card"

export function Palette({ onAdd, onAddPreset }: { onAdd: (k: PaletteKind) => void; onAddPreset: (p: Preset) => void }) {
  return (
    <aside className="bg-background flex min-h-0 flex-col border-r">
      <Tabs defaultValue="fields" className="min-h-0 flex-1 gap-0">
        <div className="border-b p-3">
          <TabsList className="w-full">
            <TabsTrigger value="fields">Champs</TabsTrigger>
            <TabsTrigger value="presets">Blocs métier</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="fields" className="min-h-0 overflow-y-auto p-3">
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
        </TabsContent>
        <TabsContent value="presets" className="min-h-0 overflow-y-auto p-3">
          <p className="text-muted-foreground mb-3 text-xs">Des ensembles de champs KYC prêts à l&apos;emploi, bindés aux propriétés système.</p>
          <div className="flex flex-col gap-2">
            {PRESETS.map((p) => (
              <PresetItem key={p.id} preset={p} onAdd={() => onAddPreset(p)} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
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

function PresetItem({ preset, onAdd }: { preset: Preset; onAdd: () => void }) {
  const fields = useMemo(() => preset.build(), [preset])
  const data: DragData = { kind: "preset", presetId: preset.id, label: preset.label, hasRepeater: fields.some((f) => f.type === "repeater") }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `preset:${preset.id}`, data })
  const count = keysOf(fields.filter((f) => f.type !== "info")).length
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onAdd}
      className={cn(
        "bg-card hover:border-primary/40 hover:bg-accent flex cursor-grab items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <Blocks className="text-primary mt-0.5 size-4 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{preset.label}</span>
        <span className="text-muted-foreground text-xs">{preset.description}</span>
        <span className="text-muted-foreground text-[11px]">
          {count} champ{count > 1 ? "s" : ""}
        </span>
      </span>
    </button>
  )
}
