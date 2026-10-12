"use client"

import { useDndContext, useDroppable } from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, Database, Eye, GripVertical, ListChecks, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { NATURES, relationLabel, type PaletteKind } from "@/lib/builder"
import type { Field, FieldType, RepeaterField } from "@/lib/dsl"
import { cn } from "@/lib/utils"
import { useCatalogStore } from "@/store/catalog"
import { useEditor, type Container } from "@/store/editor"
import { useDescribe } from "../use-describe"
import { DocumentMock, FieldMock } from "./field-mock"
import { LocalizedInline, useShow } from "./inline-text"

export type DragData =
  | { kind: "palette"; paletteKind: PaletteKind; label: string }
  | { kind: "preset"; presetId: string; label: string; hasRepeater: boolean }
  | { kind: "field"; container: Container; fieldType: FieldType; label: string }
  | { kind: "container"; container: Container }

export function FieldCard({ field, container }: { field: Field; container: Container }) {
  const selected = useEditor((s) => s.selection?.kind === "field" && s.selection.key === field.key)
  const readOnly = useEditor((s) => s.readOnly)
  const ed = useEditor.getState
  const label = useShow()
  const { describe } = useDescribe()
  const { active } = useDndContext()
  const data: DragData = { kind: "field", container, fieldType: field.type, label: field.type === "info" ? "Information" : label(field.label) }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: field.key, data, disabled: readOnly })

  const activeData = active?.data.current as DragData | undefined
  const incoming = isOver && activeData && (activeData.kind !== "field" || activeData.container !== container)
  const update = (fn: (f: Field) => void) => ed().updateField(field.key, fn)
  const nested = container !== "root"
  const validateCount = field.type !== "info" && field.type !== "document" ? (field.validate?.length ?? 0) : 0

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation()
        ed().select({ kind: "field", key: field.key })
      }}
      className={cn(
        nested ? "group/child" : "group/card",
        "bg-card relative rounded-xl border p-4 text-left shadow-xs transition-[box-shadow,border-color] outline-none",
        !readOnly && "cursor-grab active:cursor-grabbing",
        "hover:border-primary/30 focus-visible:ring-ring/50 focus-visible:ring-2",
        selected && "border-primary ring-primary/20 ring-4",
        isDragging && "opacity-40",
        field.type === "repeater" && "bg-card/60",
      )}
    >
      {incoming && <span className="bg-primary absolute -top-2 right-2 left-2 h-1 rounded-full" />}

      {!readOnly && <Toolbar fieldKey={field.key} visible={selected} nested={nested} />}

      {field.type === "info" ? (
        <div className="bg-accent text-accent-foreground rounded-lg p-3">
          <LocalizedInline text={field.content} multiline ariaLabel="Texte" className="text-sm" onChange={(t) => update((f) => void ((f as typeof field).content = t!))} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <LocalizedInline
            text={field.label}
            multiline
            placeholder="Libellé du champ"
            ariaLabel="Libellé"
            className="text-sm font-semibold"
            onChange={(t) => update((f) => void ((f as typeof field).label = t!))}
          />
          {field.help && <p className="text-muted-foreground -mt-1 text-xs">{label(field.help)}</p>}
          {field.type === "repeater" ? (
            <RepeaterBody repeater={field} />
          ) : field.type === "document" ? (
            <DocumentMock field={field} />
          ) : (
            <FieldMock field={field} />
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {field.type !== "info" && <BindChip field={field} />}
        {(field.type === "document" || (field.type !== "info" && field.type !== "repeater")) && field.required && (
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">Obligatoire</span>
        )}
        {field.type !== "info" && field.type !== "document" && field.type !== "repeater" && field.multiple && (
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
            <ListChecks className="size-3" /> Plusieurs valeurs
          </span>
        )}
        {validateCount > 0 && (
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
            <ShieldCheck className="size-3" /> {validateCount} règle{validateCount > 1 ? "s" : ""}
          </span>
        )}
        {field.visibleIf && (
          <span className="bg-condition text-condition-foreground inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
            <Eye className="size-3 shrink-0" />
            <span className="truncate">Visible si {describe(field.visibleIf)}</span>
          </span>
        )}
        <code className="text-muted-foreground ml-auto font-mono text-[10px]">{field.key}</code>
      </div>
    </div>
  )
}

/** Propriété alimentée par le champ, ou partie décrite par les items du repeater. */
function BindChip({ field }: { field: Exclude<Field, { type: "info" }> }) {
  const properties = useCatalogStore((s) => s.properties)
  const label = useShow()
  let text: string | null = null
  let broken = false
  if (field.type === "repeater") text = `${NATURES[field.bind.nature].short} · ${relationLabel(field.bind.relation)}`
  else if (field.type !== "document" && field.bind) {
    if (field.bind === "party.nature") text = "Nature de la partie"
    else {
      const p = properties.find((x) => `${x.scope}.${x.key}` === field.bind)
      broken = !p || !!p.archivedAt
      text = `${field.bind.startsWith("relation.") ? "Relation" : "Partie"} · ${p ? label(p.label) : field.bind}`
    }
  }
  if (!text) return null
  return (
    <span
      title={field.type === "repeater" ? "Chaque item décrit une partie liée à la partie principale" : field.type !== "document" ? `bind: ${field.bind}` : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        broken ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
      )}
    >
      <Database className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}

function Toolbar({ fieldKey, visible, nested }: { fieldKey: string; visible: boolean; nested: boolean }) {
  const ed = useEditor.getState
  const btn = "text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 place-items-center rounded-md"
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div
      onPointerDown={stop}
      className={cn(
        "bg-background absolute -top-3.5 right-3 z-10 flex items-center rounded-lg border p-0.5 shadow-sm transition-opacity",
        visible
          ? "opacity-100"
          : nested
            ? "pointer-events-none opacity-0 group-hover/child:pointer-events-auto group-hover/child:opacity-100"
            : "pointer-events-none opacity-0 group-hover/card:pointer-events-auto group-hover/card:opacity-100",
      )}
    >
      <span className={cn(btn, "cursor-grab")} aria-hidden>
        <GripVertical className="size-4" />
      </span>
      <button
        type="button"
        className={btn}
        title="Dupliquer"
        aria-label="Dupliquer"
        onClick={(e) => {
          stop(e)
          ed().duplicateField(fieldKey)
        }}
      >
        <Copy className="size-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:text-destructive")}
        title="Supprimer"
        aria-label="Supprimer"
        onClick={(e) => {
          stop(e)
          ed().removeField(fieldKey)
        }}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

function RepeaterBody({ repeater }: { repeater: RepeaterField }) {
  const readOnly = useEditor((s) => s.readOnly)
  const label = useShow()
  const { setNodeRef, isOver } = useDroppable({ id: `container:${repeater.key}`, data: { kind: "container", container: repeater.key } satisfies DragData })
  const { active } = useDndContext()
  const activeData = active?.data.current as DragData | undefined
  const canDrop =
    activeData &&
    !(activeData.kind === "field" && activeData.fieldType === "repeater") &&
    !(activeData.kind === "palette" && activeData.paletteKind === "repeater") &&
    !(activeData.kind === "preset" && activeData.hasRepeater)
  const range =
    repeater.min !== undefined && repeater.max !== undefined
      ? `De ${repeater.min} à ${repeater.max} fiches`
      : repeater.min !== undefined
        ? `Au moins ${repeater.min} fiche${repeater.min > 1 ? "s" : ""}`
        : repeater.max !== undefined
          ? `Au plus ${repeater.max} fiches`
          : "Nombre de fiches libre"

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        {range} · chaque fiche crée une {NATURES[repeater.bind.nature].label.toLowerCase()} liée par « {relationLabel(repeater.bind.relation)} »
      </p>
      <div ref={setNodeRef} className={cn("bg-muted/40 rounded-lg border border-dashed p-3 transition-colors", isOver && canDrop && "border-primary bg-primary/5")}>
        <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{label(repeater.label)} n° 1</p>
        <SortableContext items={repeater.fields.map((c) => c.key)} strategy={rectSortingStrategy} disabled={readOnly}>
          <div className="flex flex-col gap-3">
            {repeater.fields.map((c) => (
              <FieldCard key={c.key} field={c} container={repeater.key} />
            ))}
            {repeater.fields.length === 0 && <p className="text-muted-foreground py-6 text-center text-sm">Glissez ici les champs de chaque fiche.</p>}
          </div>
        </SortableContext>
      </div>
      <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <Plus className="size-4" /> Ajouter une fiche
      </span>
    </div>
  )
}
