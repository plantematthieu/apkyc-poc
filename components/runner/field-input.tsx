"use client"

import { useState } from "react"
import { Info, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AddressValue, InfoField, InputField, SelectOption } from "@/lib/dsl"
import { localize } from "@/lib/local-api/localize"
import { toE164 } from "@/lib/runtime"
import { cn } from "@/lib/utils"
import { CountrySelect } from "./country-select"

const UI = {
  fr: { add: "Ajouter", select: "Sélectionner…", country: "Sélectionner un pays…", yes: "Oui", no: "Non", line1: "Adresse", line2: "Complément d'adresse", postalCode: "Code postal", city: "Ville" },
  en: { add: "Add", select: "Select…", country: "Select a country…", yes: "Yes", no: "No", line1: "Address", line2: "Address line 2", postalCode: "Postal code", city: "City" },
}
export const ui = (locale: string) => (locale === "en" ? UI.en : UI.fr)

export function InfoView({ field, locale }: { field: InfoField; locale: string }) {
  return (
    <div className="bg-accent text-accent-foreground flex gap-3 rounded-lg p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0" />
      <p>{localize(field.content, locale)}</p>
    </div>
  )
}

/** Libellé, aide et message d'erreur autour d'un contrôle. */
export function FieldShell({
  id,
  label,
  help,
  required,
  error,
  group,
  children,
}: {
  id: string
  label: string
  help?: string
  required?: boolean
  error?: string
  group?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2" data-invalid={error ? true : undefined}>
      {group ? (
        <p className="text-sm leading-snug font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </p>
      ) : (
        <Label htmlFor={id} className="leading-snug">
          <span>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </span>
        </Label>
      )}
      {help && <p className="text-muted-foreground -mt-1 text-xs">{help}</p>}
      {children}
      {error && <p className="text-destructive text-xs font-medium">{error}</p>}
    </div>
  )
}

/**
 * Champ de saisie du DSL : composant contrôlé, valeur typée (nombre, booléen, adresse, code
 * pays, E.164), undefined si vide ; tableau si le champ est `multiple`.
 */
export function FieldInput({
  field,
  id,
  value,
  onChange,
  error,
  locale,
  options,
}: {
  field: InputField
  id: string
  value: unknown
  onChange: (v: unknown) => void
  error?: string
  locale: string
  /** Choix d'un select (ceux de la propriété bindée le cas échéant). */
  options?: SelectOption[]
}) {
  const label = localize(field.label, locale)
  const help = field.help ? localize(field.help, locale) : undefined
  const invalid = !!error
  const t = ui(locale)

  if (field.type === "select") {
    const opts = options ?? field.options ?? []
    if (field.multiple) {
      const cur = Array.isArray(value) ? (value as string[]) : []
      return (
        <FieldShell id={id} label={label} help={help} required={field.required} error={error} group>
          <div className="flex flex-col gap-2.5">
            {opts.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${o.value}`}
                  checked={cur.includes(o.value)}
                  onCheckedChange={(on) => {
                    const next = on ? [...cur, o.value] : cur.filter((x) => x !== o.value)
                    onChange(next.length ? next : undefined)
                  }}
                />
                <Label htmlFor={`${id}-${o.value}`} className="font-normal">
                  {localize(o.label, locale)}
                </Label>
              </div>
            ))}
          </div>
        </FieldShell>
      )
    }
    return (
      <FieldShell id={id} label={label} help={help} required={field.required} error={error}>
        <Select value={typeof value === "string" ? value : ""} onValueChange={(v) => onChange(v || undefined)}>
          <SelectTrigger id={id} aria-invalid={invalid} className="w-full max-w-80">
            <SelectValue placeholder={t.select} />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {localize(o.label, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    )
  }

  if (field.type === "boolean")
    return (
      <FieldShell id={id} label={label} help={help} required={field.required} error={error} group>
        <div role="radiogroup" className={cn("flex w-fit overflow-hidden rounded-md border", invalid && "border-destructive")}>
          {[
            [true, t.yes],
            [false, t.no],
          ].map(([v, l], i) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={value === v}
              onClick={() => onChange(value === v ? undefined : v)}
              className={cn("px-5 py-1.5 text-sm transition-colors", i > 0 && "border-l", value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {l as string}
            </button>
          ))}
        </div>
      </FieldShell>
    )

  const single = (v: unknown, set: (v: unknown) => void, controlId: string) => <SingleInput field={field} id={controlId} value={v} onChange={set} invalid={invalid} locale={locale} />

  if (!field.multiple)
    return (
      <FieldShell id={id} label={label} help={help} required={field.required} error={error} group={field.type === "address"}>
        {single(value, onChange, id)}
      </FieldShell>
    )

  return (
    <FieldShell id={id} label={label} help={help} required={field.required} error={error} group>
      <MultiValues value={value} onChange={onChange} addLabel={t.add} render={(v, set, i) => single(v, set, `${id}-${i}`)} />
    </FieldShell>
  )
}

/** Liste de valeurs d'un champ multiple ; les lignes vides restent locales et ne sont pas émises. */
function MultiValues({
  value,
  onChange,
  addLabel,
  render,
}: {
  value: unknown
  onChange: (v: unknown) => void
  addLabel: string
  render: (v: unknown, set: (v: unknown) => void, index: number) => React.ReactNode
}) {
  const list = Array.isArray(value) ? value.filter((v) => v !== undefined) : []
  const [extra, setExtra] = useState(0)
  const blanks = list.length === 0 ? Math.max(1, extra) : extra
  const items: unknown[] = [...list, ...Array.from({ length: blanks }, () => undefined)]
  const emit = (next: unknown[]) => {
    const kept = next.filter((x) => x !== undefined)
    setExtra(next.length - kept.length)
    onChange(kept.length ? kept : undefined)
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">{render(v, (nv) => emit(items.map((x, j) => (j === i ? nv : x))), i)}</div>
          {items.length > 1 && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Retirer" onClick={() => emit(items.filter((_, j) => j !== i))}>
              <X />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="ghost" size="xs" className="self-start" disabled={blanks > 0} onClick={() => setExtra(extra + 1)}>
        <Plus /> {addLabel}
      </Button>
    </div>
  )
}

function SingleInput({ field, id, value, onChange, invalid, locale }: { field: InputField; id: string; value: unknown; onChange: (v: unknown) => void; invalid: boolean; locale: string }) {
  const t = ui(locale)
  const str = typeof value === "string" || typeof value === "number" ? String(value) : ""
  switch (field.type) {
    case "number":
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          className="max-w-60"
          value={str}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )
    case "date":
      return <Input id={id} type="date" className="max-w-48" value={str} aria-invalid={invalid} onChange={(e) => onChange(e.target.value || undefined)} />
    case "email":
      return <Input id={id} type="email" value={str} aria-invalid={invalid} onChange={(e) => onChange(e.target.value.trim() || undefined)} />
    case "phone":
      return <PhoneInput id={id} value={typeof value === "string" ? value : undefined} onChange={onChange} invalid={invalid} />
    case "country":
      return <CountrySelect id={id} value={typeof value === "string" ? value : undefined} onChange={onChange} locale={locale} invalid={invalid} placeholder={t.country} />
    case "address":
      return <AddressInput id={id} value={value as AddressValue | undefined} onChange={onChange} invalid={invalid} locale={locale} />
    default:
      return <Input id={id} value={str} aria-invalid={invalid} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
  }
}

/** Saisie libre, valeur au format E.164 (« 06 12 34 56 78 » → « +33612345678 »). */
function PhoneInput({ id, value, onChange, invalid }: { id: string; value: string | undefined; onChange: (v: unknown) => void; invalid: boolean }) {
  const [draft, setDraft] = useState(value ?? "")
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    if (toE164(draft) !== value) setDraft(value ?? "")
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        type="tel"
        value={draft}
        aria-invalid={invalid}
        placeholder="+33 6 12 34 56 78"
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(toE164(e.target.value))
        }}
        className="max-w-60"
      />
      {value && value !== draft && <span className="text-muted-foreground font-mono text-[11px]">{value}</span>}
    </div>
  )
}

function AddressInput({ id, value, onChange, invalid, locale }: { id: string; value: AddressValue | undefined; onChange: (v: unknown) => void; invalid: boolean; locale: string }) {
  const t = ui(locale)
  const set = (part: keyof AddressValue, v: string | undefined) => {
    const next: Record<string, string> = { ...(value ?? {}) } as Record<string, string>
    if (v) next[part] = v
    else delete next[part]
    onChange(Object.keys(next).length ? next : undefined)
  }
  return (
    <div className="grid grid-cols-6 gap-2">
      <Input id={id} className="col-span-6" placeholder={t.line1} aria-invalid={invalid} value={value?.line1 ?? ""} onChange={(e) => set("line1", e.target.value)} />
      <Input className="col-span-6" placeholder={t.line2} value={value?.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
      <Input className="col-span-2" placeholder={t.postalCode} aria-invalid={invalid} value={value?.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
      <Input className="col-span-4" placeholder={t.city} aria-invalid={invalid} value={value?.city ?? ""} onChange={(e) => set("city", e.target.value)} />
      <div className="col-span-6">
        <CountrySelect value={value?.country} onChange={(c) => set("country", c)} locale={locale} invalid={invalid} placeholder={t.country} />
      </div>
    </div>
  )
}
