"use client"

import type { FormSchema } from "@/lib/dsl"
import { isProblem, saveFormVersionSchema } from "@/lib/local-api"
import { useEditor } from "@/store/editor"

/**
 * Sauvegarde automatique du brouillon : PUT …/versions/{versionId} avec If-Match = révision
 * lue. 412 si un autre onglet a enregistré entre-temps (rien n'est écrasé), 422 si le schéma
 * n'a pas la forme du DSL (checkStructure) : le brouillon reste alors non enregistré.
 */

let lastSaved: FormSchema | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let inFlight: Promise<void> | null = null

/** Schéma déjà enregistré (chargement, sauvegarde réussie) : pas de nouvelle sauvegarde. */
export function markSaved(schema: FormSchema) {
  lastSaved = schema
}

async function saveNow(): Promise<void> {
  if (inFlight) await inFlight
  const { form, version, schema, readOnly, save } = useEditor.getState()
  if (!form || !version || readOnly || schema === lastSaved || save.status === "conflict") return
  useEditor.getState().setSave({ status: "saving" })
  inFlight = (async () => {
    try {
      const { version: saved } = await saveFormVersionSchema(form.id, version.id, { schema }, version.revision)
      lastSaved = schema
      const { schema: latest } = useEditor.getState()
      useEditor.getState().setVersion({ ...version, revision: saved.revision, updatedAt: saved.updatedAt })
      useEditor.getState().setSave({ status: latest === schema ? "saved" : "pending" })
      if (latest !== schema) schedule()
    } catch (e) {
      if (isProblem(e, "revision_mismatch")) useEditor.getState().setSave({ status: "conflict", message: e.detail })
      else if (isProblem(e, "invalid_schema_structure")) useEditor.getState().setSave({ status: "invalid", issues: e.report?.issues })
      else useEditor.getState().setSave({ status: "error", message: (e as Error).message })
    } finally {
      inFlight = null
    }
  })()
  await inFlight
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => void saveNow(), 600)
}

/** Enregistre tout de suite ce qui est en attente (avant de publier, en quittant). */
export async function flushSave() {
  clearTimeout(timer)
  await saveNow()
}

/** Branche la sauvegarde automatique sur les modifications du schéma. */
export function startAutosave(): () => void {
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.schema === prev.schema || s.readOnly || s.schema === lastSaved) return
    if (s.save.status !== "conflict") useEditor.getState().setSave({ status: "pending" })
    schedule()
  })
  return () => {
    unsub()
    void flushSave()
  }
}
