"use client"

import { Plus, X } from "lucide-react"
import { NATURE_LIST, NATURES, show, slugify, textIn, uniqueKey, withText } from "@/lib/builder"
import type { InputField, PartyNature, SelectOption } from "@/lib/dsl"
import { cn } from "@/lib/utils"
import { useEditor } from "@/store/editor"
import { InlineText } from "./inline-text"

/**
 * Nouveaux choix après modification d'un libellé : en français, la valeur suit le libellé
 * tant qu'elle en dérive ; les conditions suivent la valeur renommée.
 */
export function relabel(options: SelectOption[], index: number, lang: string, label: string): { options: SelectOption[]; renames: [string, string][] } {
  const next = options.map((o) => ({ ...o, label: { ...o.label } }))
  const o = next[index]!
  const renames: [string, string][] = []
  if (lang === "fr" && o.value === slugify(o.label.fr)) {
    const v = uniqueKey(slugify(label) || "option", next.filter((_, i) => i !== index).map((x) => x.value))
    if (v !== o.value) renames.push([o.value, v])
    o.value = v
  }
  o.label = withText(o.label, lang, label)
  return { options: next, renames }
}

export function addOption(options: SelectOption[]): SelectOption[] {
  const label = `Option ${options.length + 1}`
  return [...options, { label: { fr: label }, value: uniqueKey(slugify(label), options.map((o) => o.value)) }]
}

/** Prochaine nature absente des choix d'un champ bindé à party.nature. */
export const missingNature = (options: SelectOption[]): PartyNature | undefined =>
  NATURE_LIST.find((n) => !options.some((o) => o.value === n))

export const natureOption = (n: PartyNature): SelectOption => ({ value: n, label: { fr: NATURES[n].label } })

/** Choix modifiables directement dans la carte du champ. */
export function OptionsInline({ field }: { field: InputField }) {
  const setOptions = useEditor((s) => s.setOptions)
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const options = field.options ?? []
  const nature = field.bind === "party.nature"
  const marker = field.multiple ? "rounded-[4px]" : "rounded-full"
  const canAdd = !readOnly && (!nature || missingNature(options))

  return (
    <ul className="flex flex-col gap-1">
      {options.map((o, i) => (
        <li key={i} className="group/opt flex items-center gap-2">
          <span className={cn("border-muted-foreground/50 size-4 shrink-0 border", marker)} />
          <InlineText
            value={textIn(o.label, lang)}
            placeholder={lang !== "fr" ? `${o.label.fr} (à traduire)` : undefined}
            ariaLabel={`Choix ${i + 1}`}
            readOnly={readOnly}
            onChange={(v) => {
              const r = nature ? { options: options.map((x, j) => (j === i ? { ...x, label: withText(x.label, lang, v) } : x)), renames: [] } : relabel(options, i, lang, v)
              setOptions(field.key, r.options, r.renames)
            }}
            className="text-sm"
          />
          <code className="text-muted-foreground hidden font-mono text-[10px] group-hover/opt:inline">{o.value}</code>
          {!readOnly && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setOptions(
                  field.key,
                  options.filter((_, j) => j !== i),
                )
              }}
              className="text-muted-foreground hover:text-destructive opacity-0 group-hover/opt:opacity-100 focus:opacity-100"
              aria-label={`Retirer le choix ${show(o.label)}`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </li>
      ))}
      {canAdd && (
        <li>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const n = nature ? missingNature(options) : undefined
              setOptions(field.key, n ? [...options, natureOption(n)] : addOption(options))
            }}
            className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm"
          >
            <Plus className="size-4" /> {nature ? "Ajouter une nature" : "Ajouter un choix"}
          </button>
        </li>
      )}
    </ul>
  )
}
