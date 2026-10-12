"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowRight, ArrowUp, Flag, LayoutList, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { show, transitionSources } from "@/lib/builder"
import { cn } from "@/lib/utils"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { ConditionBuilder, newCondition } from "../conditions/condition-builder"
import { KeyInput } from "../key-input"
import { LocalizedInput } from "../localized-input"
import { useDescribe } from "../use-describe"

export function FlowInspector() {
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const readOnly = useEditor((s) => s.readOnly)
  if (!selection || selection.kind === "field") return null
  return (
    <aside className="bg-background absolute top-3 right-3 bottom-3 z-10 flex w-[336px] flex-col overflow-hidden rounded-xl border shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{selection.kind === "step" ? "Étape" : "Branche"}</p>
        <Button variant="ghost" size="icon-xs" onClick={() => select(null)} aria-label="Fermer">
          <X />
        </Button>
      </div>
      <fieldset disabled={readOnly} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        {selection.kind === "step" ? (
          <StepPanel stepKey={selection.key} />
        ) : (
          <TransitionPanel key={`${selection.from}#${selection.index}`} from={selection.from} index={selection.index} />
        )}
      </fieldset>
    </aside>
  )
}

function StepPanel({ stepKey }: { stepKey: string }) {
  const schema = useEditor((s) => s.schema)
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const ed = useEditor.getState
  const { describe } = useDescribe()
  const step = schema.steps[stepKey]
  if (!step) return null
  const isStart = schema.start === stepKey
  const others = Object.keys(schema.steps).filter((k) => k !== stepKey && !step.next.some((t) => t.goto === k))
  const conditional = step.next.filter((t) => t.if !== undefined).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="step-title">Titre</Label>
          <LocalizedInput id="step-title" text={step.title} onChange={(t) => ed().updateStep(stepKey, (s) => void (s.title = t!))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="step-desc">Consigne pour le client</Label>
          <LocalizedInput
            id="step-desc"
            multiline
            optional
            placeholder="Facultatif"
            text={step.description}
            onChange={(t) =>
              ed().updateStep(stepKey, (s) => {
                if (t) s.description = t
                else delete s.description
              })
            }
          />
        </div>
        <KeyInput
          id="step-key"
          label="Clé de l'étape"
          value={stepKey}
          readOnly={readOnly}
          hint="Identifiant stable (path, current_step du dossier). Les branches suivent le changement."
          onCommit={(next) => ed().renameStep(stepKey, next)}
        />
        <Button onClick={() => ed().openStep(stepKey)}>
          <LayoutList /> Modifier les champs ({step.fields.length})
        </Button>
        {!isStart && (
          <Button variant="outline" onClick={() => ed().setStart(stepKey)}>
            <Flag /> En faire l&apos;étape de départ
          </Button>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold">Suite du parcours</p>
          <p className="text-muted-foreground text-xs">
            Branches testées dans l&apos;ordre : la première vraie l&apos;emporte. La dernière doit être sans condition (« Sinon »).
          </p>
        </div>
        {step.next.length === 0 && <p className="text-muted-foreground text-sm">Étape finale : le dossier peut être transmis après elle.</p>}
        <ul className="flex flex-col gap-1.5">
          {step.next.map((t, i) => (
            <li key={i} className="group flex items-start gap-1">
              <button
                type="button"
                onClick={() => ed().select({ kind: "transition", from: stepKey, index: i })}
                className={cn(
                  "hover:border-primary/40 flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm",
                  t.if !== undefined ? "bg-condition/50" : "bg-muted/40",
                )}
              >
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  {t.if !== undefined ? `${i + 1}. Si` : "Sinon"} <ArrowRight className="size-3" />
                  <span className="text-foreground truncate font-medium">{show(schema.steps[t.goto]?.title, lang) || t.goto}</span>
                </span>
                {t.if !== undefined && <span className="text-condition-foreground line-clamp-2 text-xs">{describe(t.if)}</span>}
              </button>
              {t.if !== undefined && conditional > 1 && (
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => ed().moveTransition(stepKey, i, -1)} aria-label="Tester avant">
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={step.next[i + 1]?.if === undefined}
                    onClick={() => ed().moveTransition(stepKey, i, 1)}
                    aria-label="Tester après"
                  >
                    <ArrowDown />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 && !readOnly && (
          <Select
            value=""
            onValueChange={(to) => {
              const sources = transitionSources({ schema, properties: useCatalogStore.getState().properties, lang }, stepKey)
              ed().addTransition(stepKey, to, newCondition(sources))
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Ajouter une branche vers…" />
            </SelectTrigger>
            <SelectContent>
              {others.map((k) => (
                <SelectItem key={k} value={k}>
                  {show(schema.steps[k]!.title, lang) || k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Separator />
      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive justify-start"
        disabled={Object.keys(schema.steps).length <= 1}
        onClick={() => ed().removeStep(stepKey)}
      >
        <Trash2 /> Supprimer l&apos;étape
      </Button>
    </div>
  )
}

function TransitionPanel({ from, index }: { from: string; index: number }) {
  const schema = useEditor((s) => s.schema)
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const properties = useCatalogStore((s) => s.properties)
  const ed = useEditor.getState
  const sources = useMemo(() => transitionSources({ schema, properties, lang }, from), [schema, properties, lang, from])
  const step = schema.steps[from]
  const t = step?.next[index]
  if (!step || !t) return null
  const otherFallback = step.next.some((x, i) => i !== index && x.if === undefined)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label>De</Label>
        <p className="bg-muted rounded-md px-3 py-2 text-sm font-medium">{show(step.title, lang) || from}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Vers</Label>
        <Select value={t.goto} onValueChange={(to) => ed().updateTransition(from, index, (x) => void (x.goto = to))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!(t.goto in schema.steps) && (
              <SelectItem value={t.goto} disabled>
                {t.goto} (inconnue)
              </SelectItem>
            )}
            {Object.entries(schema.steps)
              .filter(([k]) => k !== from)
              .map(([k, s]) => (
                <SelectItem key={k} value={k}>
                  {show(s.title, lang) || k}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div>
          <Label htmlFor="is-default">Branche « Sinon »</Label>
          <p className="text-muted-foreground mt-1 text-xs">
            {otherFallback && t.if !== undefined
              ? "Cette étape a déjà une branche sans condition."
              : "Sans condition, placée en dernier : suivie quand aucune autre n'est vraie."}
          </p>
        </div>
        <Switch
          id="is-default"
          checked={t.if === undefined}
          disabled={readOnly || (otherFallback && t.if !== undefined)}
          onCheckedChange={(on) => ed().setFallback(from, index, on, newCondition(sources))}
        />
      </div>

      {t.if !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Suivre cette branche si…</p>
          <ConditionBuilder
            value={t.if}
            sources={sources}
            readOnly={readOnly}
            onChange={(logic) => ed().updateTransition(from, index, (x) => void (x.if = logic))}
          />
        </div>
      )}

      <Separator />
      <Button variant="ghost" className="text-destructive hover:text-destructive justify-start" onClick={() => ed().removeTransition(from, index)}>
        <Trash2 /> Supprimer la branche
      </Button>
    </div>
  )
}
