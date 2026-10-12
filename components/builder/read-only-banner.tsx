"use client"

import { FilePlus2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditor } from "@/store/editor"
import { openNewDraft, StatusBadge, useVersions } from "./versions-menu"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" })

/** Version publiée ou archivée : figée (trigger form_versions_guard), on la modifie via un nouveau brouillon. */
export function ReadOnlyBanner({ onOpenVersion }: { onOpenVersion: (id: string) => void }) {
  const form = useEditor((s) => s.form)
  const version = useEditor((s) => s.version)
  const readOnly = useEditor((s) => s.readOnly)
  const versions = useVersions(form?.id)
  if (!readOnly || !form || !version) return null
  const draft = versions.find((v) => v.status === "draft")

  return (
    <div className="bg-muted/60 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
      <Lock className="text-muted-foreground size-4" />
      <span>
        Version n° {version.number} <StatusBadge status={version.status} />
        {version.publishedAt && ` le ${dateFmt.format(new Date(version.publishedAt))}`} · figée, lecture seule
      </span>
      {version.hash && (
        <code className="text-muted-foreground font-mono text-xs" title={version.hash}>
          sha256 {version.hash.slice(0, 12)}…
        </code>
      )}
      {form.archivedAt ? (
        <span className="text-muted-foreground ml-auto text-xs">Formulaire archivé.</span>
      ) : draft ? (
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => onOpenVersion(draft.id)}>
          Ouvrir le brouillon n° {draft.number}
        </Button>
      ) : (
        <Button size="sm" className="ml-auto" onClick={() => void openNewDraft(form.id, version.id, onOpenVersion)}>
          <FilePlus2 /> Nouveau brouillon depuis cette version
        </Button>
      )}
    </div>
  )
}
