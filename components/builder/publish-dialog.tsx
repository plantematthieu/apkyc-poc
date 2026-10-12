"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { CircleCheck, Loader2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { ValidationReport } from "@/lib/dsl"
import { publishFormVersion, validateFormVersion } from "@/lib/local-api"
import { problemMessage } from "@/components/properties/problem-message"
import { useEditor } from "@/store/editor"
import { flushSave } from "./autosave"
import { IssueList } from "./problems-button"

/**
 * Publication d'un brouillon : POST …/validate puis …/publish avec If-Match = révision relue.
 * La version devient figée et son schéma canonique est haché (sha256).
 */
export function PublishDialog({ children, onPublished }: { children: ReactNode; onPublished: (versionId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useEditor((s) => s.version)
  const form = useEditor((s) => s.form)

  const check = async () => {
    setReport(null)
    await flushSave()
    const { form, version, save } = useEditor.getState()
    if (!form || !version) return
    if (save.status !== "saved") {
      setReport({ valid: false, issues: save.issues ?? [] })
      return
    }
    setReport(await validateFormVersion(form.id, version.id))
  }

  const publish = async () => {
    const { form, version } = useEditor.getState()
    if (!form || !version) return
    setBusy(true)
    try {
      const published = await publishFormVersion(form.id, version.id, `"${version.revision}"`)
      toast.success(`Version n° ${published.number} publiée`, { description: `sha256 ${published.hash?.slice(0, 16)}…` })
      setOpen(false)
      onPublished(published.id)
    } catch (e) {
      toast.error(problemMessage(e))
      void check()
    } finally {
      setBusy(false)
    }
  }

  const errors = report?.issues.filter((i) => i.severity === "error") ?? []
  const warnings = report?.issues.filter((i) => i.severity === "warning") ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) void check()
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publier la version n° {version?.number}</DialogTitle>
          <DialogDescription>
            Une version publiée est figée : c&apos;est celle que voient les clients des demandes de collecte de « {form?.name.fr} ». Pour la
            modifier ensuite, on ouvre un nouveau brouillon.
          </DialogDescription>
        </DialogHeader>
        {!report ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Contrôles de publication…
          </p>
        ) : errors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-destructive text-sm font-medium">
              {errors.length} erreur{errors.length > 1 ? "s" : ""} : la publication serait refusée (422 publication_checks_failed).
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <IssueList issues={report.issues} onPick={() => setOpen(false)} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CircleCheck className="size-4" /> Aucune erreur.
              {warnings.length > 0 && ` ${warnings.length} avertissement${warnings.length > 1 ? "s" : ""} (ne bloquent pas).`}
            </p>
            {warnings.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                <IssueList issues={warnings} onPick={() => setOpen(false)} />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={publish} disabled={!report || errors.length > 0 || busy}>
            <Rocket /> Publier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
