"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Copy, MousePointerClick, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  fieldSources,
  FIELD_TYPE_LABELS,
  locateField,
  NATURES,
  options as makeOptions,
  repeaterRuleSources,
  show,
  withText,
  type FieldSource,
} from "@/lib/builder"
import { INPUT_FIELD_TYPES, type DocumentField, type Field, type InputField, type InputFieldType, type PartyNature, type RepeaterField, type ValidationRule } from "@/lib/dsl"
import { cn } from "@/lib/utils"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { FieldIcon, TYPE_ICONS } from "../block-icons"
import { ConditionBuilder, newCondition } from "../conditions/condition-builder"
import { KeyInput } from "../key-input"
import { LocalizedInput } from "../localized-input"
import { FieldBindSection, RepeaterBindSection } from "./bind-settings"
import { addOption, relabel } from "./options-inline"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

/** Entier ou nombre facultatif : undefined quand le champ est vide. */
const num = (v: string, integer = false) => {
  if (v === "") return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return integer ? Math.max(0, Math.trunc(n)) : n
}

export function FieldSettings() {
  const schema = useEditor((s) => s.schema)
  const selection = useEditor((s) => s.selection)
  const loc = useMemo(() => (selection?.kind === "field" ? locateField(schema, selection.key) : null), [schema, selection])

  if (!loc)
    return (
      <aside className="bg-background flex h-full flex-col items-center justify-center gap-3 border-l p-6 text-center">
        <MousePointerClick className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">Sélectionnez un champ</p>
        <p className="text-muted-foreground max-w-60 text-sm">
          Cliquez sur un champ pour régler son bind, ses contrôles et sa condition d&apos;affichage. Les libellés se modifient directement dans la carte.
        </p>
      </aside>
    )
  return <Settings key={loc.field.key} field={loc.field} stepKey={loc.stepKey} repeater={loc.repeater} />
}

function Settings({ field, stepKey, repeater }: { field: Field; stepKey: string; repeater?: RepeaterField }) {
  const schema = useEditor((s) => s.schema)
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const properties = useCatalogStore((s) => s.properties)
  const ed = useEditor.getState
  const update = (fn: (f: Field) => void) => ed().updateField(field.key, fn)
  const ctx = { schema, properties, lang }
  const visibilitySources = useMemo(() => fieldSources({ schema, properties, lang }, stepKey, field.key), [schema, properties, lang, stepKey, field.key])

  return (
    <aside className="bg-background flex h-full min-h-0 flex-col border-l">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">
          <FieldIcon field={field as InputField} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{field.type === "info" ? "Texte d'information" : show(field.label, lang) || field.key}</p>
          <p className="text-muted-foreground text-xs">
            {FIELD_TYPE_LABELS[field.type]}
            {repeater ? ` · dans « ${show(repeater.label, lang)} »` : ""}
          </p>
        </div>
        {!readOnly && (
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => ed().duplicateField(field.key)} aria-label="Dupliquer">
              <Copy />
            </Button>
            <Button variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => ed().removeField(field.key)} aria-label="Supprimer">
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      <fieldset disabled={readOnly} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {field.type === "info" ? (
          <Section title="Contenu">
            <Row label="Texte affiché au client" htmlFor="f-content">
              <LocalizedInput id="f-content" multiline rows={4} text={field.content} onChange={(t) => update((f) => void ((f as typeof field).content = t!))} />
            </Row>
          </Section>
        ) : (
          <Section title="Général">
            <Row label="Libellé" htmlFor="f-label">
              <LocalizedInput id="f-label" multiline text={field.label} onChange={(t) => update((f) => void ((f as typeof field).label = t!))} />
            </Row>
            <Row label="Aide sous le libellé" htmlFor="f-help">
              <LocalizedInput
                id="f-help"
                optional
                placeholder="Facultatif"
                text={field.help}
                onChange={(t) =>
                  update((f) => {
                    const x = f as typeof field
                    if (t) x.help = t
                    else delete x.help
                  })
                }
              />
            </Row>
            {field.type !== "repeater" && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="f-req">Réponse obligatoire</Label>
                <Switch
                  id="f-req"
                  checked={!!field.required}
                  onCheckedChange={(v) =>
                    update((f) => {
                      const x = f as InputField | DocumentField
                      if (v) x.required = true
                      else delete x.required
                    })
                  }
                />
              </div>
            )}
            {field.type !== "repeater" && field.type !== "document" && field.type !== "boolean" && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="f-multi">Plusieurs valeurs</Label>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {field.bind && field.bind !== "party.nature" ? "Doit être identique à la propriété bindée." : "La réponse est une liste (multiple)."}
                  </p>
                </div>
                <Switch
                  id="f-multi"
                  checked={!!field.multiple}
                  disabled={field.bind === "party.nature"}
                  onCheckedChange={(v) =>
                    update((f) => {
                      const x = f as InputField
                      if (v) x.multiple = true
                      else delete x.multiple
                    })
                  }
                />
              </div>
            )}
          </Section>
        )}

        {field.type === "repeater" && (
          <>
            <Section title="Parties décrites">
              <RepeaterBindSection repeater={field} />
            </Section>
            <Section title="Nombre de fiches">
              <div className="grid grid-cols-2 gap-3">
                <Row label="Minimum" htmlFor="r-min">
                  <Input id="r-min" type="number" min={0} value={field.min ?? ""} onChange={(e) => update((f) => setBound(f, "min", num(e.target.value, true)))} />
                </Row>
                <Row label="Maximum" htmlFor="r-max">
                  <Input id="r-max" type="number" min={0} value={field.max ?? ""} onChange={(e) => update((f) => setBound(f, "max", num(e.target.value, true)))} />
                </Row>
              </div>
            </Section>
          </>
        )}

        {field.type !== "info" && field.type !== "document" && field.type !== "repeater" && (
          <Section title="Propriété alimentée (bind)">
            <FieldBindSection field={field} repeater={repeater} />
          </Section>
        )}

        {field.type === "select" && field.options && <OptionsSection field={field} />}

        {field.type === "document" && (
          <Section title="Pièces acceptées">
            <DocumentTypesPicker field={field} nature={repeater?.bind.nature} />
          </Section>
        )}

        {field.type === "text" && (
          <Section title="Contrôles">
            <Row label="Format attendu (expression régulière)" htmlFor="f-pattern" hint="Facultatif. Exemple : ^[0-9]{9}$ pour un SIREN.">
              <Input
                id="f-pattern"
                value={field.pattern ?? ""}
                className="font-mono text-xs"
                placeholder="^[0-9]{9}$"
                onChange={(e) =>
                  update((f) => {
                    const x = f as InputField
                    if (e.target.value) x.pattern = e.target.value
                    else delete x.pattern
                  })
                }
              />
            </Row>
            <div className="flex flex-wrap gap-1">
              {[
                ["SIREN", "^[0-9]{9}$"],
                ["Code postal FR", "^[0-9]{5}$"],
                ["IBAN", "^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$"],
              ].map(([l, p]) => (
                <Button key={l} size="xs" variant="outline" onClick={() => update((f) => void ((f as InputField).pattern = p))}>
                  {l}
                </Button>
              ))}
            </div>
          </Section>
        )}

        {field.type === "number" && (
          <Section title="Contrôles">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Minimum" htmlFor="f-min">
                <Input id="f-min" type="number" value={field.min ?? ""} onChange={(e) => update((f) => setBound(f, "min", num(e.target.value)))} />
              </Row>
              <Row label="Maximum" htmlFor="f-max">
                <Input id="f-max" type="number" value={field.max ?? ""} onChange={(e) => update((f) => setBound(f, "max", num(e.target.value)))} />
              </Row>
            </div>
          </Section>
        )}

        {(field.type === "repeater" || (field.type !== "info" && field.type !== "document")) && (
          <RulesSection
            field={field as InputField | RepeaterField}
            sources={field.type === "repeater" ? repeaterRuleSources(ctx, stepKey, field) : fieldSources(ctx, stepKey, field.key, true)}
          />
        )}

        <Separator />

        <Section title="Affichage">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="f-cond">Afficher sous condition (visibleIf)</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">Sinon, toujours affiché.</p>
            </div>
            <Switch
              id="f-cond"
              checked={!!field.visibleIf}
              disabled={!field.visibleIf && !visibilitySources.length}
              onCheckedChange={(on) =>
                update((f) => {
                  if (on) f.visibleIf = newCondition(visibilitySources)
                  else delete f.visibleIf
                })
              }
            />
          </div>
          {!field.visibleIf && !visibilitySources.length && (
            <p className="text-muted-foreground text-xs">Aucun champ n&apos;est rempli avant celui-ci : placez d&apos;abord la question qui déclenche l&apos;affichage.</p>
          )}
          {field.visibleIf && (
            <ConditionBuilder value={field.visibleIf} sources={visibilitySources} readOnly={readOnly} onChange={(logic) => update((f) => void (f.visibleIf = logic))} />
          )}
        </Section>

        <Separator />
        <Section title="Avancé">
          <KeyInput
            id="f-key"
            label="Clé du champ"
            value={field.key}
            readOnly={readOnly}
            hint="Nom de la réponse dans submissions.data. Unique sur tout le formulaire, items compris. Les conditions suivent le changement."
            onCommit={(next) => ed().renameField(field.key, next)}
          />
          {field.type !== "info" && field.type !== "document" && field.type !== "repeater" && <TypeSelect field={field} />}
        </Section>
      </fieldset>
    </aside>
  )
}

function setBound(f: Field, name: "min" | "max", value: number | undefined) {
  const x = f as unknown as Record<string, unknown>
  if (value === undefined) delete x[name]
  else x[name] = value
}

/** Change le type d'un champ de saisie en retirant les attributs qui ne s'y appliquent plus. */
function TypeSelect({ field }: { field: InputField }) {
  const update = useEditor((s) => s.updateField)
  return (
    <Row label="Type de champ" hint="Les réglages propres à l'ancien type sont retirés ; un bind devenu incompatible aussi.">
      <Select
        value={field.type}
        onValueChange={(t) => {
          let unbound = false
          update(field.key, (f) => {
            const x = f as InputField
            x.type = t as InputFieldType
            if (x.type !== "select") delete x.options
            else if (!x.options && !x.bind) x.options = makeOptions("Option 1", "Option 2")
            if (x.type !== "text") delete x.pattern
            if (x.type !== "number") {
              delete x.min
              delete x.max
            }
            if (x.type === "boolean") delete x.multiple
            if (x.bind && (x.bind !== "party.nature" || x.type !== "select")) {
              delete x.bind
              unbound = true
            }
          })
          if (unbound) toast.info("Bind retiré : la propriété n'a plus le même type que le champ.")
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INPUT_FIELD_TYPES.map((t) => {
            const I = TYPE_ICONS[t]
            return (
              <SelectItem key={t} value={t}>
                <I /> {FIELD_TYPE_LABELS[t]}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </Row>
  )
}

function OptionsSection({ field }: { field: InputField }) {
  const setOptions = useEditor((s) => s.setOptions)
  const lang = useEditor((s) => s.lang)
  const options = field.options ?? []
  const nature = field.bind === "party.nature"
  const [bulk, setBulk] = useState(false)
  const [text, setText] = useState("")

  const move = (i: number, d: -1 | 1) => {
    const next = [...options]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setOptions(field.key, next)
  }

  return (
    <Section title={nature ? "Natures proposées" : "Choix proposés"}>
      {bulk ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Un choix par ligne (français)" />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const labels = text
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                setOptions(field.key, makeOptions(...labels))
                setBulk(false)
              }}
            >
              Remplacer les choix
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulk(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-1">
                <Input
                  value={(o.label[lang] as string | undefined) ?? ""}
                  placeholder={lang !== "fr" ? o.label.fr : undefined}
                  aria-label={`Choix ${i + 1}`}
                  onChange={(e) => {
                    if (nature)
                      return setOptions(
                        field.key,
                        options.map((x, j) => (j === i ? { ...x, label: withText(x.label, lang, e.target.value) } : x)),
                      )
                    const r = relabel(options, i, lang, e.target.value)
                    setOptions(field.key, r.options, r.renames)
                  }}
                  className="h-8"
                />
                <code className="text-muted-foreground w-24 shrink-0 truncate font-mono text-[10px]" title={o.value}>
                  {o.value}
                </code>
                <Button variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-xs" disabled={i === options.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setOptions(
                      field.key,
                      options.filter((_, j) => j !== i),
                    )
                  }
                  aria-label="Retirer"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {nature ? "Les valeurs sont des natures du DSL ; seuls les libellés changent." : "La valeur (code stable) suit le libellé français tant qu'elle en dérive."}
          </p>
          {!nature && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOptions(field.key, addOption(options))}>
                <Plus /> Ajouter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("text-muted-foreground")}
                onClick={() => {
                  setText(options.map((o) => o.label.fr).join("\n"))
                  setBulk(true)
                }}
              >
                Coller une liste
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

function DocumentTypesPicker({ field, nature }: { field: DocumentField; nature?: PartyNature }) {
  const documentTypes = useCatalogStore((s) => s.documentTypes)
  const update = useEditor((s) => s.updateField)
  const toggle = (code: string, on: boolean) =>
    update(field.key, (f) => {
      const x = f as DocumentField
      x.documentTypes = on ? [...x.documentTypes, code] : x.documentTypes.filter((c) => c !== code)
    })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Le client fournit l&apos;une de ces pièces. Recto verso et fraîcheur viennent du type de pièce.</p>
      <ul className="flex flex-col gap-1.5">
        {documentTypes.map((d) => {
          const checked = field.documentTypes.includes(d.code)
          const mismatch = nature && d.applicableNatures.length > 0 && !d.applicableNatures.includes(nature)
          return (
            <li key={d.code} className="flex items-start gap-2">
              <Checkbox id={`dt-${d.code}`} checked={checked} onCheckedChange={(on) => toggle(d.code, on === true)} className="mt-0.5" />
              <label htmlFor={`dt-${d.code}`} className="flex flex-col text-sm leading-snug">
                <span className={cn(mismatch && "text-muted-foreground")}>{d.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  <code className="font-mono">{d.code}</code>
                  {d.applicableNatures.length ? ` · ${d.applicableNatures.map((n) => NATURES[n].short).join(", ")}` : ""}
                  {d.validityDays ? ` · < ${d.validityDays} j` : ""}
                  {d.twoSided ? " · recto verso" : ""}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Règles validate : conditions JSON Logic, chacune avec le message affiché si elle est fausse. */
function RulesSection({ field, sources }: { field: InputField | RepeaterField; sources: FieldSource[] }) {
  const update = useEditor((s) => s.updateField)
  const readOnly = useEditor((s) => s.readOnly)
  const rules = field.validate ?? []
  const setRules = (fn: (rules: ValidationRule[]) => ValidationRule[]) =>
    update(field.key, (f) => {
      const x = f as InputField | RepeaterField
      const next = fn([...(x.validate ?? [])])
      if (next.length) x.validate = next
      else delete x.validate
    })

  return (
    <Section title="Règles de validation">
      <p className="text-muted-foreground -mt-1 text-xs">
        {field.type === "repeater"
          ? "Sur l'ensemble des fiches : la somme d'un champ nombre des fiches est disponible (ex. quotes-parts = 100)."
          : "Testées quand le champ est rempli ; le message s'affiche si la règle est fausse."}
      </p>
      {rules.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Règle {i + 1}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setRules((all) => all.filter((_, j) => j !== i))} aria-label="Retirer la règle">
              <X />
            </Button>
          </div>
          <ConditionBuilder
            value={r.rule}
            sources={sources}
            readOnly={readOnly}
            onChange={(logic) => setRules((all) => all.map((x, j) => (j === i ? { ...x, rule: logic } : x)))}
          />
          <Row label="Message si la règle est fausse">
            <LocalizedInput text={r.message} onChange={(t) => setRules((all) => all.map((x, j) => (j === i ? { ...x, message: t! } : x)))} />
          </Row>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={!sources.length}
        onClick={() => setRules((all) => [...all, { rule: newCondition(sources.slice(0, field.type === "repeater" ? 1 : undefined)), message: { fr: "Valeur non valide." } }])}
      >
        <Plus /> Règle
      </Button>
    </Section>
  )
}
