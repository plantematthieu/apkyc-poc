"use client"

import { current } from "immer"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { temporal, type TemporalState } from "zundo"
import { useStoreWithEqualityFn } from "zustand/traditional"
import type { Field, FormSchema, ItemField, JsonLogic, SelectOption, Step, Transition, ValidationIssue } from "@/lib/dsl"
import {
  autoLayout,
  fieldKeys,
  isValidKey,
  keysOf,
  locateField,
  mapLogic,
  newStep,
  newStepKey,
  renameLogicRefs,
  renameOptionRefs,
  uniqueKey,
  type Positions,
} from "@/lib/builder"
import type { FormDefinition, FormVersion, FormVersionSummary } from "@/lib/local-api"

export type Selection =
  | { kind: "step"; key: string }
  | { kind: "transition"; from: string; index: number }
  | { kind: "field"; key: string }
  | null

export type View = "flow" | "step" | "preview"

/** « root » : champs de l'étape ; sinon clé du repeater. */
export type Container = "root" | string

export interface SaveState {
  status: "saved" | "pending" | "saving" | "invalid" | "conflict" | "error"
  message?: string
  /** 422 du contrôle de structure : le brouillon n'est pas enregistré. */
  issues?: ValidationIssue[]
}

interface EditorState {
  form: FormDefinition | null
  version: FormVersionSummary | null
  /** Schéma du DSL, tel qu'enregistré dans form_versions.schema. */
  schema: FormSchema
  /** Positions des étapes dans la vue Parcours : propres au builder, jamais enregistrées. */
  positions: Positions
  /** Version publiée ou archivée : figée. */
  readOnly: boolean
  selection: Selection
  view: View
  activeStep: string
  /** Langue des textes modifiés dans le builder. */
  lang: string
  save: SaveState

  load: (form: FormDefinition, version: FormVersion) => void
  setForm: (form: FormDefinition) => void
  setVersion: (version: FormVersionSummary) => void
  setSave: (save: SaveState) => void
  setLang: (lang: string) => void
  select: (s: Selection) => void
  setView: (v: View) => void
  openStep: (key: string) => void
  replaceSchema: (schema: FormSchema) => void

  addStep: (position: { x: number; y: number }, title?: string) => string | null
  updateStep: (key: string, recipe: (s: Step) => void) => void
  renameStep: (from: string, to: string) => boolean
  removeStep: (key: string) => void
  moveStep: (key: string, position: { x: number; y: number }) => void
  setStart: (key: string) => void
  relayout: () => void

  addTransition: (from: string, to: string, condition?: JsonLogic) => void
  updateTransition: (from: string, index: number, recipe: (t: Transition) => void) => void
  removeTransition: (from: string, index: number) => void
  moveTransition: (from: string, index: number, dir: -1 | 1) => void
  /** Branche « Sinon » : sans condition, placée en dernier. */
  setFallback: (from: string, index: number, on: boolean, condition?: JsonLogic) => void

  insertFields: (stepKey: string, container: Container, beforeKey: string | null, fields: Field[]) => void
  moveField: (key: string, container: Container, overKey: string | null) => void
  updateField: (key: string, recipe: (f: Field) => void) => void
  removeField: (key: string) => void
  duplicateField: (key: string) => void
  /** Change la clé d'un champ et les conditions qui la lisent ; false si la clé est invalide ou prise. */
  renameField: (from: string, to: string) => boolean
  /** Remplace les choix d'un champ ; les conditions suivent les valeurs renommées. */
  setOptions: (key: string, options: SelectOption[] | undefined, renames?: [string, string][]) => void
}

const EMPTY_SCHEMA: FormSchema = { start: "", steps: {} }

function stepList(schema: FormSchema, stepKey: string, container: Container): Field[] | null {
  const step = schema.steps[stepKey]
  if (!step) return null
  if (container === "root") return step.fields
  const repeater = step.fields.find((f) => f.key === container)
  return repeater?.type === "repeater" ? (repeater.fields as Field[]) : null
}

export const useEditor = create<EditorState>()(
  temporal(
    immer((set, get) => {
      /** Modification du schéma, refusée sur une version figée. */
      const edit = (fn: (s: EditorState) => void) =>
        set((s) => {
          if (!s.readOnly) fn(s)
        })

      return {
        form: null,
        version: null,
        schema: EMPTY_SCHEMA,
        positions: {},
        readOnly: true,
        selection: null,
        view: "flow",
        activeStep: "",
        lang: "fr",
        save: { status: "saved" },

        load: (form, version) => {
          set({
            form,
            version,
            schema: version.schema,
            positions: autoLayout(version.schema),
            readOnly: version.status !== "draft" || !!form.archivedAt,
            selection: null,
            activeStep: version.schema.start,
            save: { status: "saved" },
          })
          useEditor.temporal.getState().clear()
        },
        setForm: (form) => set({ form }),
        setVersion: (version) => set((s) => void (s.version = version)),
        setSave: (save) => set({ save }),
        setLang: (lang) => set({ lang }),
        select: (selection) => set({ selection }),
        setView: (view) => set({ view }),
        openStep: (key) => set({ activeStep: key, view: "step", selection: null }),
        replaceSchema: (schema) =>
          edit((s) => {
            s.schema = schema
            s.positions = autoLayout(schema)
            s.selection = null
            s.activeStep = schema.start
          }),

        // ------------------------------------------------------------ Étapes

        addStep: (position, title = "Nouvelle étape") => {
          if (get().readOnly) return null
          const key = newStepKey(get().schema)
          edit((s) => {
            s.schema.steps[key] = newStep(title)
            if (!s.schema.start) s.schema.start = key
            s.positions[key] = position
            s.selection = { kind: "step", key }
          })
          return key
        },
        updateStep: (key, recipe) =>
          edit((s) => {
            const step = s.schema.steps[key]
            if (step) recipe(step)
          }),
        renameStep: (from, to) => {
          const { schema, readOnly } = get()
          if (readOnly || from === to) return from === to
          if (!isValidKey(to) || to in schema.steps || !(from in schema.steps)) return false
          edit((s) => {
            s.schema.steps = Object.fromEntries(Object.entries(s.schema.steps).map(([k, v]) => [k === from ? to : k, v]))
            if (s.schema.start === from) s.schema.start = to
            Object.values(s.schema.steps).forEach((step) => step.next.forEach((t) => t.goto === from && (t.goto = to)))
            s.positions[to] = s.positions[from] ?? { x: 0, y: 0 }
            delete s.positions[from]
            if (s.activeStep === from) s.activeStep = to
            if (s.selection?.kind === "step" && s.selection.key === from) s.selection = { kind: "step", key: to }
          })
          return true
        },
        removeStep: (key) =>
          edit((s) => {
            const keys = Object.keys(s.schema.steps)
            if (keys.length <= 1 || !(key in s.schema.steps)) return
            delete s.schema.steps[key]
            delete s.positions[key]
            Object.values(s.schema.steps).forEach((step) => (step.next = step.next.filter((t) => t.goto !== key)))
            const first = Object.keys(s.schema.steps)[0]!
            if (s.schema.start === key) s.schema.start = first
            if (s.activeStep === key) s.activeStep = s.schema.start
            s.selection = null
          }),
        // Positions : propres au builder, permises même sur une version figée.
        moveStep: (key, position) =>
          set((s) => {
            s.positions[key] = position
          }),
        setStart: (key) =>
          edit((s) => {
            if (key in s.schema.steps) s.schema.start = key
          }),
        relayout: () => set((s) => void (s.positions = autoLayout(s.schema))),

        // ------------------------------------------------------------ Transitions

        addTransition: (from, to, condition) => {
          const step = get().schema.steps[from]
          if (!step || from === to || get().readOnly) return
          const existing = step.next.findIndex((t) => t.goto === to)
          if (existing >= 0) return set({ selection: { kind: "transition", from, index: existing } })
          edit((s) => {
            const next = s.schema.steps[from]!.next
            if (next.length === 0) {
              next.push({ goto: to })
              s.selection = { kind: "transition", from, index: 0 }
              return
            }
            const fallback = next.findIndex((t) => t.if === undefined)
            const at = fallback === -1 ? next.length : fallback
            next.splice(at, 0, { if: condition ?? {}, goto: to })
            s.selection = { kind: "transition", from, index: at }
          })
        },
        updateTransition: (from, index, recipe) =>
          edit((s) => {
            const t = s.schema.steps[from]?.next[index]
            if (t) recipe(t)
          }),
        removeTransition: (from, index) =>
          edit((s) => {
            s.schema.steps[from]?.next.splice(index, 1)
            s.selection = null
          }),
        moveTransition: (from, index, dir) =>
          edit((s) => {
            const next = s.schema.steps[from]?.next
            const j = index + dir
            if (!next || j < 0 || j >= next.length) return
            ;[next[index], next[j]] = [next[j]!, next[index]!]
            if (s.selection?.kind === "transition" && s.selection.from === from && s.selection.index === index) s.selection = { kind: "transition", from, index: j }
          }),
        setFallback: (from, index, on, condition) =>
          edit((s) => {
            const next = s.schema.steps[from]?.next
            const t = next?.[index]
            if (!next || !t) return
            if (on) {
              delete t.if
              next.splice(index, 1)
              next.push(t)
              s.selection = { kind: "transition", from, index: next.length - 1 }
            } else {
              t.if = condition ?? {}
            }
          }),

        // ------------------------------------------------------------ Champs

        insertFields: (stepKey, container, beforeKey, fields) =>
          edit((s) => {
            const list = stepList(s.schema, stepKey, container)
            if (!list) return
            const at = beforeKey ? list.findIndex((f) => f.key === beforeKey) : -1
            list.splice(at >= 0 ? at : list.length, 0, ...fields)
            if (fields.length) s.selection = { kind: "field", key: fields[0]!.key }
          }),
        moveField: (key, container, overKey) =>
          edit((s) => {
            const from = locateField(s.schema, key)
            if (!from) return
            if (from.field.type === "repeater" && container !== "root") return
            const target = stepList(s.schema, from.stepKey, container)
            if (!target) return
            if (target === from.list) {
              const to = overKey ? target.findIndex((f) => f.key === overKey) : target.length - 1
              if (to < 0 || to === from.index) return
              const [moved] = target.splice(from.index, 1)
              target.splice(to, 0, moved!)
              return
            }
            const [moved] = from.list.splice(from.index, 1)
            const at = overKey ? target.findIndex((f) => f.key === overKey) : -1
            target.splice(at >= 0 ? at : target.length, 0, moved!)
          }),
        updateField: (key, recipe) =>
          edit((s) => {
            const loc = locateField(s.schema, key)
            if (loc) recipe(loc.field)
          }),
        removeField: (key) =>
          edit((s) => {
            const loc = locateField(s.schema, key)
            if (!loc) return
            loc.list.splice(loc.index, 1)
            if (s.selection?.kind === "field" && s.selection.key === key) s.selection = null
          }),
        duplicateField: (key) =>
          edit((s) => {
            const loc = locateField(s.schema, key)
            if (!loc) return
            const copy = structuredClone(current(loc.field)) as Field
            const taken = fieldKeys(s.schema)
            const renames = new Map<string, string>()
            for (const k of keysOf([copy])) {
              const fresh = uniqueKey(`${k}_copy`, taken)
              taken.add(fresh)
              renames.set(k, fresh)
            }
            const fix = (f: Field | ItemField) => {
              f.key = renames.get(f.key) ?? f.key
              const remap = (logic: JsonLogic) => {
                let out: unknown = logic
                for (const [a, b] of renames) out = renameLogicRefs(out, a, b)
                return out as JsonLogic
              }
              if (f.visibleIf) f.visibleIf = remap(f.visibleIf)
              if (f.type !== "info" && f.type !== "document") f.validate?.forEach((r) => (r.rule = remap(r.rule)))
              if (f.type === "repeater") f.fields.forEach(fix)
            }
            fix(copy)
            loc.list.splice(loc.index + 1, 0, copy)
            s.selection = { kind: "field", key: copy.key }
          }),
        renameField: (from, to) => {
          const { schema, readOnly } = get()
          if (readOnly || from === to) return from === to
          if (!isValidKey(to) || fieldKeys(schema).has(to)) return false
          edit((s) => {
            const loc = locateField(s.schema, from)
            if (!loc) return
            loc.field.key = to
            mapLogic(s.schema, (logic) => renameLogicRefs(logic, from, to) as JsonLogic)
            if (s.selection?.kind === "field" && s.selection.key === from) s.selection = { kind: "field", key: to }
          })
          return true
        },
        setOptions: (key, options, renames = []) =>
          edit((s) => {
            const loc = locateField(s.schema, key)
            if (!loc || loc.field.type !== "select") return
            if (options) loc.field.options = options
            else delete loc.field.options
            if (renames.length) mapLogic(s.schema, (logic) => renameOptionRefs(logic, key, new Map(renames)) as JsonLogic)
          }),
      }
    }),
    {
      partialize: (s) => ({ schema: s.schema, positions: s.positions }),
      equality: (a, b) => a.schema === b.schema && a.positions === b.positions,
      limit: 100,
      // Regroupe les modifications rapprochées (frappe au clavier) en une seule étape d'annulation
      handleSet: (handleSet) => {
        let last = 0
        const record = handleSet as unknown as (...args: unknown[]) => void
        return ((...args: unknown[]) => {
          const now = Date.now()
          if (now - last > 600) record(...args)
          last = now
        }) as never
      },
    },
  ),
)

export function useHistory<T>(selector: (s: TemporalState<{ schema: FormSchema; positions: Positions }>) => T): T {
  return useStoreWithEqualityFn(useEditor.temporal, selector)
}
