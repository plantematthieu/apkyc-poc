"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, Check, ChevronDown, FilePlus2, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { archiveFormVersion, createFormVersion, listFormVersions, onTablesChange, type FormVersionStatus, type FormVersionSummary } from "@/lib/local-api"
import { problemMessage } from "@/components/properties/problem-message"
import { cn } from "@/lib/utils"
import { useEditor } from "@/store/editor"
import { DiffDialog } from "./diff-dialog"

export const STATUS_LABEL: Record<FormVersionStatus, string> = { draft: "Brouillon", published: "Publiée", archived: "Archivée" }
const STATUS_CLASS: Record<FormVersionStatus, string> = {
  draft: "bg-condition text-condition-foreground",
  published: "bg-emerald-50 text-emerald-700",
  archived: "bg-muted text-muted-foreground",
}
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" })

export function StatusBadge({ status }: { status: FormVersionStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
}

export function useVersions(formId: string | undefined) {
  const [versions, setVersions] = useState<FormVersionSummary[]>([])
  useEffect(() => {
    if (!formId) return
    const load = () => void listFormVersions(formId).then((r) => setVersions(r.data))
    load()
    return onTablesChange(load)
  }, [formId])
  return versions
}

/** Ouvre un nouveau brouillon copié de la version donnée (POST …/versions). */
export async function openNewDraft(formId: string, fromVersionId: string, go: (versionId: string) => void) {
  try {
    const draft = await createFormVersion(formId, { fromVersionId })
    toast.success(`Brouillon n° ${draft.number} ouvert`)
    go(draft.id)
  } catch (e) {
    toast.error(problemMessage(e))
  }
}

/** Versions du formulaire : statut, ouverture, nouveau brouillon, archivage, comparaison. */
export function VersionsMenu() {
  const router = useRouter()
  const form = useEditor((s) => s.form)
  const version = useEditor((s) => s.version)
  const versions = useVersions(form?.id)
  const [diffOpen, setDiffOpen] = useState(false)
  if (!form || !version) return null
  const go = (id: string) => router.push(`/forms/${form.id}?v=${id}`)
  const draft = versions.find((v) => v.status === "draft")

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2">
            <span className="text-sm font-medium tabular-nums">v{version.number}</span>
            <StatusBadge status={version.status} />
            <ChevronDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Versions (form_versions)</DropdownMenuLabel>
          {versions.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => go(v.id)} className="gap-2">
              <Check className={v.id === version.id ? "opacity-100" : "opacity-0"} />
              <span className="font-medium tabular-nums">n° {v.number}</span>
              <StatusBadge status={v.status} />
              <span className="text-muted-foreground ml-auto text-xs">
                {v.status === "draft" ? `rév. ${v.revision}` : v.publishedAt ? dateFmt.format(new Date(v.publishedAt)) : ""}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {!draft && version.status !== "draft" && (
            <DropdownMenuItem onSelect={() => void openNewDraft(form.id, version.id, go)}>
              <FilePlus2 /> Nouveau brouillon depuis la n° {version.number}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={versions.length < 2} onSelect={() => setDiffOpen(true)}>
            <GitCompare /> Comparer avec une autre version
          </DropdownMenuItem>
          {version.status === "published" && (
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  const archived = await archiveFormVersion(form.id, version.id)
                  useEditor.getState().setVersion(archived)
                  toast.success(`Version n° ${archived.number} archivée : plus proposée pour de nouvelles demandes`)
                } catch (e) {
                  toast.error(problemMessage(e))
                }
              }}
            >
              <Archive /> Archiver cette version
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DiffDialog open={diffOpen} onOpenChange={setDiffOpen} formId={form.id} version={version} versions={versions} />
    </>
  )
}
