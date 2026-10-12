"use client"

import { useState } from "react"
import { Database, Plus, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { issueMessage, NATURE_LIST, NATURES, options as makeOptions, RELATION_SUGGESTIONS, sanitizeKey, show } from "@/lib/builder"
import type { InputField, PartyNature, RepeaterField } from "@/lib/dsl"
import type { Property } from "@/lib/local-api"
import { PropertiesSheet } from "@/components/properties/properties-sheet"
import { PropertyForm } from "@/components/properties/property-form"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { useIssues } from "../problems-button"
import { natureOption } from "./options-inline"

const NONE = "__none__"
const NATURE_BIND = "party.nature"
const BIND_CODES = new Set([
  "unknown_property",
  "archived_property",
  "bind_scope_mismatch",
  "bind_nature_mismatch",
  "bind_relation_mismatch",
  "bind_type_mismatch",
  "duplicate_bind",
  "invalid_nature_option",
  "options_not_allowed",
])

const accepts = <T,>(allowed: T[], value: T) => allowed.length === 0 || allowed.includes(value)
const bindOf = (p: Property) => `${p.scope}.${p.key}`

/** Où la réponse est écrite à la validation du dossier. */
export function bindTarget(bind: string | undefined, repeater?: RepeaterField): string {
  if (!bind) return "Reste dans le dossier (submissions.data) : aucune partie n'est alimentée."
  if (bind === NATURE_BIND) return "Écrit dans la colonne parties.nature de la partie principale (natural_person, legal_person, legal_arrangement)."
  const [scope, key] = bind.split(".")
  if (scope === "relation") return `Écrit dans party_relations.properties.${key} : le lien entre la partie de la fiche et la partie principale.`
  return repeater
    ? `Écrit dans parties.properties.${key} de la partie décrite par chaque fiche (${NATURES[repeater.bind.nature].short}).`
    : `Écrit dans parties.properties.${key} de la partie principale.`
}

/** Propriété alimentée par un champ de saisie (bind). */
export function FieldBindSection({ field, repeater }: { field: InputField; repeater?: RepeaterField }) {
  const properties = useCatalogStore((s) => s.properties)
  const readOnly = useEditor((s) => s.readOnly)
  const schema = useEditor((s) => s.schema)
  const update = useEditor((s) => s.updateField)
  const setOptions = useEditor((s) => s.setOptions)
  const issues = useIssues().filter((i) => BIND_CODES.has(i.code) && i.fieldPath?.split(".").pop() === field.key)
  const [creating, setCreating] = useState(false)

  const multiple = !!field.multiple
  const fits = (p: Property) => p.type === field.type && p.multiple === multiple && (!p.archivedAt || field.bind === bindOf(p))
  const partyProps = properties.filter((p) => p.scope === "party" && fits(p) && (!repeater || accepts(p.natures, repeater.bind.nature)))
  const relationProps = repeater ? properties.filter((p) => p.scope === "relation" && fits(p) && accepts(p.relationTypes, repeater.bind.relation)) : []
  const natureAllowed = !repeater && field.type === "select" && !multiple
  const listed = [...partyProps, ...relationProps].map(bindOf)

  const choose = (value: string) => {
    const previous = field.bind
    update(field.key, (f) => {
      const input = f as InputField
      if (value === NONE) delete input.bind
      else input.bind = value
    })
    if (field.type !== "select") return
    if (value === NATURE_BIND) {
      const natures = (field.options ?? []).filter((o) => NATURE_LIST.includes(o.value as PartyNature))
      setOptions(field.key, natures.length ? natures : [natureOption("natural_person"), natureOption("legal_person")])
    } else if (value === NONE) {
      // Retour à des choix propres : on reprend ceux de la propriété quittée.
      const left = properties.find((p) => bindOf(p) === previous)
      if (!field.options) setOptions(field.key, left?.options ?? makeOptions("Option 1", "Option 2"))
    } else {
      setOptions(field.key, undefined)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={field.bind ?? NONE} onValueChange={choose} disabled={readOnly}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Aucune : la réponse reste dans le dossier</SelectItem>
          {natureAllowed && (
            <>
              <SelectSeparator />
              <SelectItem value={NATURE_BIND}>Nature de la partie (party.nature)</SelectItem>
            </>
          )}
          {partyProps.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{repeater ? "Partie de la fiche" : "Partie principale"}</SelectLabel>
                {partyProps.map((p) => (
                  <SelectItem key={p.id} value={bindOf(p)}>
                    {show(p.label)}
                    <span className="text-muted-foreground font-mono text-[11px]">{bindOf(p)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          {relationProps.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Relation avec la partie principale</SelectLabel>
                {relationProps.map((p) => (
                  <SelectItem key={p.id} value={bindOf(p)}>
                    {show(p.label)}
                    <span className="text-muted-foreground font-mono text-[11px]">{bindOf(p)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          {field.bind && field.bind !== NATURE_BIND && !listed.includes(field.bind) && (
            <SelectItem value={field.bind}>{field.bind} (incompatible)</SelectItem>
          )}
        </SelectContent>
      </Select>

      <p className="text-muted-foreground flex gap-1.5 text-xs">
        <Database className="mt-0.5 size-3.5 shrink-0" />
        <span>{bindTarget(field.bind, repeater)}</span>
      </p>
      {!readOnly && partyProps.length + relationProps.length === 0 && !natureAllowed && (
        <p className="text-muted-foreground text-xs">
          Aucune propriété de type « {field.type}
          {multiple ? ", plusieurs valeurs" : ""} » n&apos;est disponible ici : le type et la multiplicité doivent être identiques.
        </p>
      )}
      {issues.map((i, n) => (
        <p key={n} className="text-destructive flex gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {issueMessage(i)}
        </p>
      ))}

      {!readOnly &&
        (creating ? (
          <div className="bg-muted/40 rounded-lg border p-3">
            <PropertyForm
              lockType
              scopes={repeater ? ["party", "relation"] : ["party"]}
              initial={{
                label: field.label,
                scope: "party",
                type: field.type,
                multiple,
                natures: repeater ? [repeater.bind.nature] : [],
                relationTypes: repeater ? [repeater.bind.relation] : [],
                options: field.options,
              }}
              onCreated={(p) => {
                update(field.key, (f) => void ((f as InputField).bind = bindOf(p)))
                if (field.type === "select") setOptions(field.key, undefined)
                setCreating(false)
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setCreating(true)}>
              <Plus /> Nouvelle propriété
            </Button>
            <PropertiesSheet schema={schema}>
              <Button size="xs" variant="ghost" className="text-muted-foreground">
                <Database /> Toutes les propriétés
              </Button>
            </PropertiesSheet>
          </div>
        ))}
    </div>
  )
}

/** Partie décrite par chaque item d'un repeater : nature et type de relation. */
export function RepeaterBindSection({ repeater }: { repeater: RepeaterField }) {
  const update = useEditor((s) => s.updateField)
  const set = (fn: (r: RepeaterField) => void) => update(repeater.key, (f) => fn(f as RepeaterField))
  const { bind } = repeater

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Nature des parties décrites</Label>
        <ToggleGroup type="single" variant="outline" value={bind.nature} onValueChange={(v) => v && set((r) => void (r.bind = { ...r.bind, nature: v as PartyNature }))}>
          {NATURE_LIST.map((n) => (
            <ToggleGroupItem key={n} value={n} className="px-3" title={NATURES[n].label}>
              {NATURES[n].short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="r-rel">Type de relation avec la partie principale</Label>
        <Input
          id="r-rel"
          value={bind.relation}
          list="relation-suggestions"
          className="font-mono text-xs"
          onChange={(e) => set((r) => void (r.bind = { ...r.bind, relation: sanitizeKey(e.target.value) }))}
        />
        <datalist id="relation-suggestions">
          {RELATION_SUGGESTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </datalist>
      </div>
      <p className="text-muted-foreground flex gap-1.5 text-xs">
        <Database className="mt-0.5 size-3.5 shrink-0" />
        <span>
          À la validation : une ligne parties ({bind.nature}) par fiche, et une ligne party_relations « {bind.relation || "…"} » de cette partie vers la
          partie principale.
        </span>
      </p>
    </div>
  )
}
