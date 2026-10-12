"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Database, Info, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isRef, isSql, planToSql, whereToSql, type BackendPlan, type PlanRow } from "@/lib/runtime"
import { cn } from "@/lib/utils"

const jsonText = (v: unknown) =>
  JSON.stringify(v, (_, x) => (isRef(x) ? `:${x.$ref}` : isSql(x) ? x.$sql : x), 2)

function Value({ v, column }: { v: unknown; column: string }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground font-mono">NULL</span>
  if (isRef(v)) return <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">:{v.$ref}</span>
  if (isSql(v)) return <span className="text-muted-foreground font-mono italic">{v.$sql}</span>
  if (typeof v === "number" || typeof v === "boolean") return <span className="font-mono">{String(v)}</span>
  if (typeof v === "string") return <span className="break-words">‘{v}’</span>
  const size = Array.isArray(v) ? v.length : Object.keys(v as object).length
  if (!size) return <span className="font-mono">{Array.isArray(v) ? "[]" : "{}"}</span>
  const text = jsonText(v)
  if (text.split("\n").length <= 14)
    return <pre className="bg-muted/60 overflow-x-auto rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{text}</pre>
  return (
    <details className="group">
      <summary className="text-primary cursor-pointer text-xs font-medium select-none">
        {column} : {size} {Array.isArray(v) ? "éléments" : "clés"} (jsonb)
      </summary>
      <pre className="bg-muted/60 mt-1.5 max-h-72 overflow-auto rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">{text}</pre>
    </details>
  )
}

function Row({ row }: { row: PlanRow }) {
  const cols = Object.entries(row.values)
  return (
    <li className="bg-card flex flex-col gap-2.5 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold",
            row.op === "INSERT" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
          )}
        >
          {row.op}
        </span>
        <code className="text-sm font-semibold">{row.table}</code>
        {row.times && row.times > 1 ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">× {row.times}</span>
        ) : null}
        <span className="text-muted-foreground text-sm">· {row.title}</span>
      </div>
      {row.endpoint && <code className="text-primary -mt-1 font-mono text-[11px]">{row.endpoint}</code>}
      <p className="text-muted-foreground text-sm leading-relaxed">{row.note}</p>
      <dl className="grid grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        {cols.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground pt-0.5 font-mono">{k}</dt>
            <dd className="min-w-0">
              <Value v={v} column={k} />
            </dd>
          </div>
        ))}
        {row.where && (
          <div className="contents">
            <dt className="text-muted-foreground pt-0.5 font-mono font-semibold">WHERE</dt>
            <dd className="font-mono break-words">{whereToSql(row.where)}</dd>
          </div>
        )}
      </dl>
    </li>
  )
}

/** Explication des écritures en base déclenchées par le dossier qui vient d'être rempli */
export function BackendPlanView({ plan, toolbar }: { plan: BackendPlan; toolbar?: React.ReactNode }) {
  const [mode, setMode] = useState<"text" | "sql">("text")
  const sqlText = useMemo(() => planToSql(plan), [plan])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sqlText)
      toast.success("SQL copié")
    } catch {
      toast.error("Copie impossible : sélectionnez le texte puis Ctrl+C")
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <Database className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Ce qui se passe côté serveur</h2>
          <p className="text-muted-foreground text-sm">Les lignes écrites en base pour ce dossier, dans l&apos;ordre, calculées par le moteur à partir de vos réponses.</p>
          {toolbar}
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
          <ToggleGroupItem value="text" className="px-3">
            Explication
          </ToggleGroupItem>
          <ToggleGroupItem value="sql" className="px-3">
            SQL
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <ul className="bg-muted/50 flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm">
        {plan.summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      {plan.notices.length > 0 && (
        <ul className="flex flex-col gap-2">
          {plan.notices.map((n) => (
            <li
              key={n.message}
              className={cn(
                "flex gap-2 rounded-lg p-3 text-sm",
                n.level === "warning" ? "bg-condition text-condition-foreground" : "bg-accent text-accent-foreground",
              )}
            >
              {n.level === "warning" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
              {n.message}
            </li>
          ))}
        </ul>
      )}

      {mode === "sql" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Pseudo-SQL : <code>:nom</code> désigne un identifiant ou un paramètre fourni par le serveur. Tables submissions et suivantes : colonnes du brouillon OpenAPI, pas encore migrées.
            </p>
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy /> Copier
            </Button>
          </div>
          <pre className="bg-muted/50 max-h-[70vh] overflow-auto rounded-xl border p-4 font-mono text-xs leading-relaxed">{sqlText}</pre>
        </div>
      ) : (
        <ol className="flex flex-col gap-8">
          {plan.phases.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {p.title} <span className="text-muted-foreground text-sm font-normal">· {p.actor}</span>
                  </h3>
                  <p className="text-muted-foreground text-sm">{p.intro}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-3 sm:pl-10">
                {p.rows.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
            </li>
          ))}
          {plan.stays.length > 0 && (
            <li className="flex flex-col gap-3 sm:pl-10">
              <div>
                <h3 className="font-semibold">Réponses qui restent dans le dossier</h3>
                <p className="text-muted-foreground text-sm">
                  Conservées dans submissions.data (et donc dans la piste d&apos;audit), mais écrites sur aucune partie : le scoring et le screening ne les liront pas. Bindez-les à une propriété si vous en avez besoin dans le référentiel.
                </p>
              </div>
              <ul className="bg-card divide-y rounded-xl border text-sm">
                {plan.stays.map((s) => (
                  <li key={s.path} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                    <span className="font-medium">{s.label}</span>
                    <code className="text-muted-foreground font-mono text-xs">{s.path}</code>
                    <span className="text-muted-foreground ml-auto text-xs">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ol>
      )}
    </section>
  )
}
