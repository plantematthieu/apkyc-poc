"use client"

import { useState } from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { ArrowLeft, Eye, GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { incoming, newField, show, type PaletteKind } from "@/lib/builder"
import type { Field } from "@/lib/dsl"
import { cn } from "@/lib/utils"
import { useEditor, type Container } from "@/store/editor"
import { PALETTE_ICONS, TYPE_ICONS } from "../block-icons"
import { useDescribe } from "../use-describe"
import { FieldCard, type DragData } from "./field-card"
import { FieldSettings } from "./field-settings"
import { LocalizedInline } from "./inline-text"
import { Palette } from "./palette"

const isRepeaterish = (d?: DragData) => !!d && ((d.kind === "field" && d.fieldType === "repeater") || (d.kind === "palette" && d.paletteKind === "repeater"))

/**
 * Cible sous le pointeur, la plus profonde d'abord : champ d'un repeater, zone d'un repeater,
 * champ de l'étape, puis zone de l'étape. Un repeater ne peut pas entrer dans un repeater.
 */
const collision: CollisionDetection = (args) => {
  const active = args.active.data.current as DragData | undefined
  let containers = args.droppableContainers
  if (isRepeaterish(active))
    containers = containers.filter((c) => {
      const d = c.data.current as DragData | undefined
      return d && "container" in d && d.container === "root"
    })
  if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: containers })
  const hits = pointerWithin({ ...args, droppableContainers: containers })
  const rank = (id: string | number) => {
    const d = containers.find((c) => c.id === id)?.data.current as DragData | undefined
    if (!d || !("container" in d)) return 9
    if (d.kind === "field") return d.container === "root" ? 2 : 0
    return d.container === "root" ? 3 : 1
  }
  return [...hits].sort((a, b) => rank(a.id) - rank(b.id))
}

export function StepEditor() {
  const schema = useEditor((s) => s.schema)
  const activeStep = useEditor((s) => s.activeStep)
  const readOnly = useEditor((s) => s.readOnly)
  const lang = useEditor((s) => s.lang)
  const ed = useEditor.getState
  const stepKey = activeStep in schema.steps ? activeStep : schema.start
  const step = schema.steps[stepKey]
  const { describe } = useDescribe()
  const [dragging, setDragging] = useState<DragData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!step) return null
  const from = incoming(schema, stepKey)

  const insert = (fields: Field[], container: Container, beforeKey: string | null) => {
    if (container !== "root" && fields.some((f) => f.type === "repeater")) container = "root"
    ed().insertFields(stepKey, container, beforeKey, fields)
  }
  const add = (kind: PaletteKind, container: Container = "root", beforeKey: string | null = null) => insert([newField(kind, ed().schema)], container, beforeKey)

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const { active, over } = e
    if (!over) return
    const a = active.data.current as DragData
    const o = over.data.current as DragData | undefined
    if (!o || !("container" in o)) return
    const container = o.container
    const beforeKey = o.kind === "field" ? String(over.id) : null
    if (a.kind === "palette") add(a.paletteKind, container, beforeKey)
    else if (a.kind === "field" && active.id !== over.id) ed().moveField(String(active.id), container, beforeKey)
  }

  const Ghost =
    dragging && dragging.kind !== "container"
      ? dragging.kind === "palette"
        ? PALETTE_ICONS[dragging.paletteKind]
        : TYPE_ICONS[dragging.fieldType]
      : null

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className={cn("grid h-full", readOnly ? "grid-cols-[minmax(0,1fr)_360px] max-lg:grid-cols-1" : "grid-cols-[240px_minmax(0,1fr)_360px] max-lg:grid-cols-[220px_minmax(0,1fr)]")}>
        {!readOnly && <Palette onAdd={(k) => add(k)} />}

        <main className="bg-muted/40 min-h-0 overflow-y-auto" onClick={() => ed().select(null)}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => ed().setView("flow")}>
                <ArrowLeft /> Parcours
              </Button>
              <Select value={stepKey} onValueChange={(k) => ed().openStep(k)}>
                <SelectTrigger size="sm" className="bg-background w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(schema.steps).map(([k, s]) => (
                    <SelectItem key={k} value={k}>
                      {show(s.title, lang) || k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="bg-background ml-auto" onClick={() => ed().setView("preview")}>
                <Eye /> Aperçu
              </Button>
            </div>

            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
              <LocalizedInline
                text={step.title}
                ariaLabel="Titre de l'étape"
                placeholder="Titre de l'étape"
                onChange={(t) => ed().updateStep(stepKey, (s) => void (s.title = t!))}
                className="text-2xl font-semibold tracking-tight"
              />
              <LocalizedInline
                text={step.description}
                optional
                ariaLabel="Consigne de l'étape"
                placeholder="Ajouter une consigne pour le client (facultatif)"
                onChange={(t) =>
                  ed().updateStep(stepKey, (s) => {
                    if (t) s.description = t
                    else delete s.description
                  })
                }
                className="text-muted-foreground text-sm"
              />
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <GitBranch className="size-3.5" />
                <code className="font-mono">{stepKey}</code> ·
                {schema.start === stepKey
                  ? " Première étape du parcours."
                  : from.length
                    ? ` ${from
                        .map((t) => `depuis « ${show(schema.steps[t.from]?.title, lang)} »${t.transition.if !== undefined ? ` si ${describe(t.transition.if)}` : ""}`)
                        .join(" · ")}`
                    : " Aucune branche ne mène ici : reliez l'étape dans le parcours."}
              </p>
            </div>

            <RootCanvas fields={step.fields} readOnly={readOnly} />
          </div>
        </main>

        <div className="min-h-0 max-lg:hidden">
          <FieldSettings />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && dragging.kind !== "container" && Ghost && (
          <div className="bg-card flex w-56 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg">
            <Ghost className="text-primary size-4" />
            <span className="truncate">{dragging.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function RootCanvas({ fields, readOnly }: { fields: Field[]; readOnly: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "container:root", data: { kind: "container", container: "root" } satisfies DragData })
  return (
    <div ref={setNodeRef} className={cn("min-h-64 rounded-2xl pb-24 transition-colors", isOver && "bg-primary/5")}>
      <SortableContext items={fields.map((f) => f.key)} strategy={rectSortingStrategy} disabled={readOnly}>
        <div className="flex flex-col gap-4">
          {fields.map((f) => (
            <FieldCard key={f.key} field={f} container="root" />
          ))}
        </div>
      </SortableContext>
      {fields.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-6 py-16 text-center text-sm">
          <p className="text-foreground font-medium">Cette étape est vide</p>
          <p>{readOnly ? "Version figée." : "Glissez ici un champ depuis la gauche."}</p>
        </div>
      )}
    </div>
  )
}
