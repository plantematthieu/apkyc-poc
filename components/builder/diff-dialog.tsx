"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { diffFormVersions, type FormVersionDiff, type FormVersionSummary } from "@/lib/local-api"
import { cn } from "@/lib/utils"
import { STATUS_LABEL } from "./versions-menu"

const short = (v: unknown) => {
  const text = JSON.stringify(v)
  return text && text.length > 120 ? `${text.slice(0, 117)}…` : text
}

/** GET …/versions/{versionId}/diff?against= : changements d'une version à l'autre. */
export function DiffDialog({
  open,
  onOpenChange,
  formId,
  version,
  versions,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  formId: string
  version: FormVersionSummary
  versions: FormVersionSummary[]
}) {
  const others = versions.filter((v) => v.id !== version.id)
  const [picked, setPicked] = useState<string | undefined>()
  const against = picked && others.some((v) => v.id === picked) ? picked : others[0]?.id
  const [diff, setDiff] = useState<FormVersionDiff | null>(null)

  useEffect(() => {
    if (!open || !against) return
    let alive = true
    void diffFormVersions(formId, version.id, against).then((d) => alive && setDiff(d))
    return () => {
      alive = false
    }
  }, [open, formId, version.id, against])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Comparer la version n° {version.number}</DialogTitle>
          <DialogDescription>Différences JSON génériques du schéma : objets clé par clé, tableaux index par index.</DialogDescription>
        </DialogHeader>
        {others.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune autre version.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              Depuis
              <Select value={against} onValueChange={setPicked}>
                <SelectTrigger size="sm" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      Version n° {v.number} · {STATUS_LABEL[v.status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
              {diff && diff.changes.length === 0 && <p className="text-muted-foreground p-4 text-sm">Schémas identiques.</p>}
              <ul className="divide-y font-mono text-xs">
                {diff?.changes.map((c, i) => (
                  <li key={i} className="flex flex-col gap-1 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          c.op === "added" ? "bg-emerald-50 text-emerald-700" : c.op === "removed" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700",
                        )}
                      >
                        {c.op}
                      </span>
                      <span className="break-all">{c.path}</span>
                    </span>
                    {c.op !== "added" && <span className="text-red-700/80 break-all">− {short(c.before)}</span>}
                    {c.op !== "removed" && <span className="break-all text-emerald-700/80">+ {short(c.after)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
