"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PreviewView } from "@/components/runner/preview-view"
import { getForm, getFormVersion, listFormVersions } from "@/lib/local-api"
import { useCatalog } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { markSaved, startAutosave } from "./autosave"
import { FlowView } from "./flow/flow-view"
import { ReadOnlyBanner } from "./read-only-banner"
import { StepEditor } from "./step/step-editor"
import { TopBar } from "./top-bar"

/**
 * Ouvre une version du formulaire : celle de l'URL (?v=), sinon le brouillon, sinon la
 * dernière version publiée.
 */
async function resolveVersion(formId: string, versionId?: string) {
  const form = await getForm(formId)
  const id = versionId ?? form.draftVersionId ?? form.latestPublishedVersionId ?? (await listFormVersions(formId)).data[0]?.id
  if (!id) throw new Error("no version")
  const { version } = await getFormVersion(formId, id)
  return { form, version }
}

export function Builder({ formId, versionId }: { formId: string; versionId?: string }) {
  const router = useRouter()
  const { loaded: catalogLoaded } = useCatalog()
  const view = useEditor((s) => s.view)
  const loadedVersion = useEditor((s) => s.version?.id)
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading")

  const load = useCallback(
    (alive: () => boolean = () => true) =>
      resolveVersion(formId, versionId)
        .then(({ form, version }) => {
          if (!alive()) return
          markSaved(version.schema)
          useEditor.getState().load(form, version)
          setStatus("ready")
        })
        .catch(() => alive() && setStatus("missing")),
    [formId, versionId],
  )

  useEffect(() => {
    let alive = true
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  useEffect(() => startAutosave(), [])

  const openVersion = (id: string) => (id === versionId ? void load() : router.push(`/forms/${formId}?v=${id}`))

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (typing) return
      const ed = useEditor.getState()
      const history = useEditor.temporal.getState()
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault()
        history.redo()
      } else if ((e.key === "Delete" || e.key === "Backspace") && ed.selection && ed.view !== "preview") {
        e.preventDefault()
        const sel = ed.selection
        if (sel.kind === "field") ed.removeField(sel.key)
        else if (sel.kind === "transition") ed.removeTransition(sel.from, sel.index)
        else if (sel.kind === "step" && ed.view === "flow") ed.removeStep(sel.key)
      } else if (e.key === "Escape") {
        ed.select(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (status === "missing")
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-lg font-semibold">Formulaire introuvable</h1>
        <p className="text-muted-foreground text-sm">Il a peut-être été créé dans un autre navigateur : le POC stocke tout en local.</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft /> Retour aux formulaires
          </Link>
        </Button>
      </main>
    )
  if (status === "loading" || !catalogLoaded || !loadedVersion) return null

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar onReload={() => void load()} onOpenVersion={openVersion} />
      <ReadOnlyBanner onOpenVersion={openVersion} />
      <div className="relative min-h-0 flex-1">
        {view === "flow" && <FlowView />}
        {view === "step" && <StepEditor />}
        {view === "preview" && <PreviewView key={loadedVersion} />}
      </div>
    </div>
  )
}
