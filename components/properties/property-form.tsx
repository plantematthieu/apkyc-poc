"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FIELD_TYPE_LABELS, NATURE_LIST, NATURES, options as makeOptions, RELATION_SUGGESTIONS, sanitizeKey, slugify } from "@/lib/builder"
import { INPUT_FIELD_TYPES, type LocalizedText, type PartyNature } from "@/lib/dsl"
import { createProperty, type Property, type PropertyOption, type PropertyScope, type PropertyType } from "@/lib/local-api"
import { problemMessage } from "./problem-message"

export const SCOPES: Record<PropertyScope, { label: string; hint: string }> = {
  party: { label: "Partie", hint: "Portée par la partie elle-même (bind party.<clé>) : nom, SIREN, nationalités…" },
  relation: { label: "Relation", hint: "Portée par le lien entre deux parties (bind relation.<clé>) : fonction, pourcentage du capital…" },
}

/** Création d'une propriété du tenant (POST /v1/properties). */
export function PropertyForm({
  initial,
  lockType = false,
  scopes = ["party", "relation"],
  onCreated,
  onCancel,
}: {
  initial?: { label?: LocalizedText; scope?: PropertyScope; type?: PropertyType; multiple?: boolean; natures?: PartyNature[]; relationTypes?: string[]; options?: PropertyOption[] }
  /** Type et multiplicité imposés (création depuis un champ). */
  lockType?: boolean
  scopes?: PropertyScope[]
  onCreated: (p: Property) => void
  onCancel?: () => void
}) {
  const [labelFr, setLabelFr] = useState(initial?.label?.fr ?? "")
  const [labelEn, setLabelEn] = useState(initial?.label?.en ?? "")
  const [key, setKey] = useState(slugify(initial?.label?.en ?? initial?.label?.fr ?? ""))
  const [keyEdited, setKeyEdited] = useState(false)
  const [scope, setScope] = useState<PropertyScope>(initial?.scope && scopes.includes(initial.scope) ? initial.scope : scopes[0]!)
  const [type, setType] = useState<PropertyType>(initial?.type ?? "text")
  const [multiple, setMultiple] = useState(initial?.multiple ?? false)
  const [natures, setNatures] = useState<PartyNature[]>(initial?.natures ?? [])
  const [relationTypes, setRelationTypes] = useState(initial?.relationTypes?.join(", ") ?? "")
  const [optionsText, setOptionsText] = useState(initial?.options?.map((o) => o.label.fr).join("\n") ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!labelFr.trim()) return setError("Donnez un libellé français à la propriété.")
    const label: LocalizedText = labelEn.trim() ? { fr: labelFr.trim(), en: labelEn.trim() } : { fr: labelFr.trim() }
    const options =
      type === "select"
        ? initial?.options?.length && optionsText === initial.options.map((o) => o.label.fr).join("\n")
          ? initial.options
          : makeOptions(...optionsText.split("\n").map((l) => l.trim()).filter(Boolean))
        : undefined
    setBusy(true)
    try {
      const created = await createProperty({
        key,
        scope,
        type,
        multiple: type === "boolean" ? false : multiple,
        label,
        options,
        natures: scope === "party" ? natures : [],
        relationTypes:
          scope === "relation"
            ? relationTypes
                .split(",")
                .map((r) => sanitizeKey(r.trim()))
                .filter(Boolean)
            : [],
      })
      onCreated(created)
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-label">Libellé (fr)</Label>
          <Input
            id="pf-label"
            autoFocus
            value={labelFr}
            placeholder="Ex. Date d'entrée en fonction"
            onChange={(e) => {
              setLabelFr(e.target.value)
              if (!keyEdited && !labelEn) setKey(slugify(e.target.value))
              setError(null)
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-label-en">Libellé (en)</Label>
          <Input
            id="pf-label-en"
            value={labelEn}
            placeholder="Facultatif"
            onChange={(e) => {
              setLabelEn(e.target.value)
              if (!keyEdited) setKey(slugify(e.target.value || labelFr))
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-key">Clé</Label>
          <Input
            id="pf-key"
            value={key}
            className="font-mono text-xs"
            onChange={(e) => {
              setKey(sanitizeKey(e.target.value))
              setKeyEdited(true)
              setError(null)
            }}
          />
          <p className="text-muted-foreground text-xs">Immuable, jamais réutilisée. En anglais.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={type} disabled={lockType} onValueChange={(v) => setType(v as PropertyType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INPUT_FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 pt-1">
            <Switch id="pf-multiple" checked={multiple && type !== "boolean"} disabled={lockType || type === "boolean"} onCheckedChange={setMultiple} />
            <Label htmlFor="pf-multiple" className="text-xs font-normal">
              Plusieurs valeurs
            </Label>
          </div>
        </div>
      </div>
      {type === "select" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-options">Choix (un par ligne)</Label>
          <Textarea id="pf-options" rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
        </div>
      )}
      {scopes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label>Portée</Label>
          <ToggleGroup type="single" variant="outline" value={scope} onValueChange={(v) => v && setScope(v as PropertyScope)}>
            {scopes.map((s) => (
              <ToggleGroupItem key={s} value={s} className="px-3">
                {SCOPES[s].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">{SCOPES[scope].hint}</p>
        </div>
      )}
      {scope === "party" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Natures concernées</Label>
          <ToggleGroup type="multiple" variant="outline" value={natures} onValueChange={(v) => setNatures(v as PartyNature[])}>
            {NATURE_LIST.map((n) => (
              <ToggleGroupItem key={n} value={n} className="px-3" title={NATURES[n].label}>
                {NATURES[n].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">Aucune sélection : toutes les natures.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-rel">Types de relation concernés</Label>
          <Input id="pf-rel" value={relationTypes} placeholder="beneficial_owner, legal_representative" className="font-mono text-xs" onChange={(e) => setRelationTypes(e.target.value)} />
          <p className="text-muted-foreground text-xs">
            Séparés par des virgules ; vide : tous. Courants : {RELATION_SUGGESTIONS.map((r) => r.value).join(", ")}.
          </p>
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          Créer la propriété
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </div>
  )
}
