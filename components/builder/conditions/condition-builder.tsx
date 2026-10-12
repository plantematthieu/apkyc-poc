"use client"

import { useState } from "react"
import { Braces, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  fromLogic,
  OPERATORS,
  operatorsFor,
  toLogic,
  type FieldSource,
  type Scalar,
  type UiGroup,
  type UiNode,
  type UiOperator,
  type UiRule,
} from "@/lib/builder"
import type { JsonLogic } from "@/lib/dsl"
import { cn } from "@/lib/utils"

const sourceId = (s: FieldSource) => `${s.sum ? "sum:" : ""}${s.path}`
const ruleId = (r: UiRule) => `${r.sum ? "sum:" : ""}${r.field}`

function newRule(sources: FieldSource[]): UiRule {
  const s = sources[sources.length - 1]
  if (!s) return { kind: "rule", field: "", operator: "eq", value: null }
  const ops = operatorsFor(s)
  if (s.choices?.length && ops.includes("eq")) return { kind: "rule", field: s.path, sum: s.sum, operator: "eq", value: s.choices[0]!.value }
  if (ops.includes("filled")) return { kind: "rule", field: s.path, sum: s.sum, operator: "filled" }
  return { kind: "rule", field: s.path, sum: s.sum, operator: ops[0]!, value: null }
}

/** Condition JSON Logic de départ : une règle sur le dernier champ disponible. */
export function newCondition(sources: FieldSource[]): JsonLogic {
  return sources.length ? toLogic(newRule(sources)) : {}
}

/**
 * Éditeur de conditions « en phrases » : Si [champ] [opérateur] [valeur], avec ET / OU.
 * Écrit du JSON Logic ; une condition hors du sous-ensemble se modifie en JSON.
 */
export function ConditionBuilder({
  value,
  onChange,
  sources,
  readOnly,
}: {
  value: JsonLogic | undefined
  onChange: (logic: JsonLogic) => void
  sources: FieldSource[]
  readOnly?: boolean
}) {
  const ui = fromLogic(value)
  const [json, setJson] = useState(false)

  if (!ui || json)
    return (
      <div className="flex flex-col gap-2">
        {!ui && <p className="text-muted-foreground text-xs">Cette condition sort de l&apos;éditeur en phrases : modifiez-la en JSON Logic.</p>}
        <LogicJsonEditor value={value ?? {}} onChange={onChange} readOnly={readOnly} />
        {ui && (
          <Button variant="ghost" size="xs" className="self-start" onClick={() => setJson(false)}>
            Revenir à l&apos;éditeur en phrases
          </Button>
        )}
      </div>
    )

  if (!sources.length && ui.rules.length === 0)
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
        Aucun champ n&apos;est rempli avant ce point du parcours : il n&apos;y a rien à tester.
      </p>
    )

  return (
    <div className="flex flex-col gap-2">
      <GroupEditor group={ui} sources={sources} depth={0} onChange={(g) => onChange(toLogic(g))} />
      <Button variant="ghost" size="xs" className="text-muted-foreground self-start" onClick={() => setJson(true)}>
        <Braces /> JSON Logic
      </Button>
    </div>
  )
}

function LogicJsonEditor({ value, onChange, readOnly }: { value: JsonLogic; onChange: (l: JsonLogic) => void; readOnly?: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        rows={6}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        className="font-mono text-xs"
        onChange={(e) => {
          setText(e.target.value)
          try {
            const parsed = JSON.parse(e.target.value)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("objet attendu")
            setError(null)
            onChange(parsed)
          } catch (err) {
            setError(`JSON invalide : ${(err as Error).message}`)
          }
        }}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  sources,
  depth,
}: {
  group: UiGroup
  onChange: (g: UiGroup) => void
  onRemove?: () => void
  sources: FieldSource[]
  depth: number
}) {
  const setRule = (i: number, r: UiNode | null) => {
    const rules = [...group.rules]
    if (r) rules[i] = r
    else rules.splice(i, 1)
    onChange({ ...group, rules })
  }
  return (
    <div className={cn("flex flex-col gap-2", depth > 0 && "bg-muted/50 rounded-lg border p-2.5")}>
      {group.rules.length > 1 || depth > 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Si</span>
          <Select value={group.combinator} onValueChange={(v) => onChange({ ...group, combinator: v as "and" | "or" })}>
            <SelectTrigger size="sm" className="h-7 w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">toutes les règles</SelectItem>
              <SelectItem value="or">au moins une règle</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">sont vraies</span>
          {onRemove && (
            <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onRemove} aria-label="Retirer le groupe">
              <X />
            </Button>
          )}
        </div>
      ) : null}

      {group.rules.length === 0 && <p className="text-muted-foreground text-xs">Condition à définir : ajoutez une règle.</p>}

      {group.rules.map((r, i) => (
        <div key={i} className="flex flex-col gap-2">
          {i > 0 && (
            <span className="text-condition-foreground text-xs font-semibold tracking-wide uppercase">{group.combinator === "and" ? "et" : "ou"}</span>
          )}
          {r.kind === "group" ? (
            <GroupEditor group={r} depth={depth + 1} sources={sources} onChange={(g) => setRule(i, g)} onRemove={() => setRule(i, null)} />
          ) : (
            <RuleEditor rule={r} sources={sources} onChange={(nr) => setRule(i, nr)} onRemove={() => setRule(i, null)} />
          )}
        </div>
      ))}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="xs" onClick={() => onChange({ ...group, rules: [...group.rules, newRule(sources)] })}>
            <Plus /> Règle
          </Button>
          {depth === 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onChange({ ...group, rules: [...group.rules, { kind: "group", combinator: "or", rules: [newRule(sources)] }] })}
            >
              <Plus /> Groupe de règles
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function RuleEditor({ rule, sources, onChange, onRemove }: { rule: UiRule; sources: FieldSource[]; onChange: (r: UiRule) => void; onRemove: () => void }) {
  const src = sources.find((s) => sourceId(s) === ruleId(rule))
  const ops = operatorsFor(src)
  const groups = [...new Set(sources.map((s) => s.group))]

  return (
    <div className="bg-condition/60 flex flex-col gap-1.5 rounded-lg p-2">
      <div className="flex items-center gap-1.5">
        <Select
          value={rule.field ? ruleId(rule) : undefined}
          onValueChange={(id) => {
            const s = sources.find((x) => sourceId(x) === id)
            if (s) onChange(newRule([s]))
          }}
        >
          <SelectTrigger size="sm" className="bg-background h-8 min-w-0 flex-1">
            <SelectValue placeholder="Choisir un champ" />
          </SelectTrigger>
          <SelectContent>
            {!src && rule.field && (
              <SelectItem value={ruleId(rule)} disabled>
                {rule.field} (hors de portée)
              </SelectItem>
            )}
            {groups.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel>{g}</SelectLabel>
                {sources
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <SelectItem key={sourceId(s)} value={sourceId(s)}>
                      {s.sum ? `Somme : ${s.label}` : s.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Retirer la règle">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          value={rule.operator}
          onValueChange={(op) => {
            const multi = !!OPERATORS[op as UiOperator].multi
            const wasMulti = !!OPERATORS[rule.operator].multi
            const value = multi === wasMulti ? rule.value : multi ? (rule.value === null || rule.value === undefined ? [] : [rule.value as Scalar]) : null
            onChange({ ...rule, operator: op as UiOperator, value: OPERATORS[op as UiOperator].needsValue ? value : undefined })
          }}
        >
          <SelectTrigger size="sm" className="bg-background h-8 w-auto shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(ops.includes(rule.operator) ? ops : [rule.operator, ...ops]).map((o) => (
              <SelectItem key={o} value={o}>
                {OPERATORS[o].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {OPERATORS[rule.operator].needsValue && <ValueEditor rule={rule} source={src} onChange={onChange} />}
      </div>
    </div>
  )
}

const encode = (v: Scalar) => JSON.stringify(v)
const decode = (s: string) => JSON.parse(s) as Scalar

function ValueEditor({ rule, source, onChange }: { rule: UiRule; source?: FieldSource; onChange: (r: UiRule) => void }) {
  const choices = source?.choices ?? []
  if (choices.length && OPERATORS[rule.operator].multi) {
    const cur = Array.isArray(rule.value) ? rule.value : []
    return (
      <div className="flex max-h-40 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto">
        {choices.map((c) => {
          const on = cur.includes(c.value)
          return (
            <button
              key={encode(c.value)}
              type="button"
              onClick={() => onChange({ ...rule, value: on ? cur.filter((x) => x !== c.value) : [...cur, c.value] })}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    )
  }
  if (choices.length) {
    const current = Array.isArray(rule.value) ? rule.value[0] : rule.value
    return (
      <Select value={current === null || current === undefined ? undefined : encode(current)} onValueChange={(v) => onChange({ ...rule, value: decode(v) })}>
        <SelectTrigger size="sm" className="bg-background h-8 min-w-0 flex-1">
          <SelectValue placeholder="Valeur" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={encode(c.value)} value={encode(c.value)}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  const numeric = source?.type === "number"
  const current = Array.isArray(rule.value) ? rule.value.join(", ") : rule.value === null || rule.value === undefined ? "" : String(rule.value)
  return (
    <Input
      type={source?.type === "date" ? "date" : numeric ? "number" : "text"}
      value={current}
      onChange={(e) => {
        const raw = e.target.value
        if (OPERATORS[rule.operator].multi)
          return onChange({ ...rule, value: raw.split(",").map((x) => x.trim()).filter(Boolean) })
        onChange({ ...rule, value: raw === "" ? null : numeric ? Number(raw) : raw })
      }}
      placeholder="Valeur"
      className="bg-background h-8 min-w-0 flex-1"
    />
  )
}
