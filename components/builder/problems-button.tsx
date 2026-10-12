"use client"

import { useMemo, useState } from "react"
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { issueMessage, issueWhere, locateField, locateIssue } from "@/lib/builder"
import { validateSchema, type ValidationIssue } from "@/lib/dsl"
import { cn } from "@/lib/utils"
import { useValidationCatalog } from "@/store/catalog"
import { useEditor } from "@/store/editor"

/**
 * Rapport de validateSchema sur le schéma en cours : exactement les contrôles de
 * POST …/validate et de la publication. Les erreurs bloquent la publication.
 */
export function useIssues(): ValidationIssue[] {
  const schema = useEditor((s) => s.schema)
  const catalog = useValidationCatalog()
  return useMemo(() => validateSchema(schema, catalog).issues, [schema, catalog])
}

export function goToIssue(issue: ValidationIssue) {
  const ed = useEditor.getState()
  const loc = locateIssue(issue)
  if (loc.fieldKey) {
    const field = locateField(ed.schema, loc.fieldKey)
    if (field) {
      ed.openStep(field.stepKey)
      ed.select({ kind: "field", key: loc.fieldKey })
      return
    }
  }
  if (loc.transition && ed.schema.steps[loc.transition.from]?.next[loc.transition.index]) {
    ed.setView("flow")
    ed.select({ kind: "transition", ...loc.transition })
  } else if (loc.stepKey && loc.stepKey in ed.schema.steps) {
    ed.setView("flow")
    ed.select({ kind: "step", key: loc.stepKey })
  }
}

export function IssueList({ issues, onPick }: { issues: ValidationIssue[]; onPick?: () => void }) {
  const schema = useEditor((s) => s.schema)
  return (
    <ul className="flex flex-col p-1">
      {issues.map((i, n) => (
        <li key={`${i.code}-${i.path}-${n}`}>
          <button
            className="hover:bg-muted flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm"
            onClick={() => {
              goToIssue(i)
              onPick?.()
            }}
          >
            {i.severity === "error" ? (
              <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert className="text-condition-foreground mt-0.5 size-4 shrink-0" />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{issueMessage(i)}</span>
              <span className="text-muted-foreground text-xs">
                {issueWhere(i, schema) || "Formulaire"} · <code className="font-mono">{i.code}</code>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ProblemsButton() {
  const issues = useIssues()
  const [open, setOpen] = useState(false)
  const errors = issues.filter((i) => i.severity === "error").length
  const warnings = issues.length - errors

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5", errors ? "text-destructive" : warnings ? "text-condition-foreground" : "text-muted-foreground")}
          aria-label="Problèmes"
        >
          {errors ? <CircleAlert /> : warnings ? <TriangleAlert /> : <CircleCheck />}
          <span className="tabular-nums">{issues.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Contrôles de publication</p>
          <p className="text-muted-foreground text-xs">
            {issues.length === 0
              ? "Le schéma passe validateSchema : il peut être publié."
              : `${errors} erreur${errors > 1 ? "s" : ""} (bloquent la publication), ${warnings} avertissement${warnings > 1 ? "s" : ""}`}
          </p>
        </div>
        {issues.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            <IssueList issues={issues} onPick={() => setOpen(false)} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
