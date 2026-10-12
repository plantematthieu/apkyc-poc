"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleAlert, CircleCheck, Monitor, RotateCcw, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { languageName, schemaLanguages, show } from "@/lib/builder"
import { listDocumentTypes, type DocumentType } from "@/lib/local-api"
import {
  collectData,
  computePath,
  createContext,
  documentSlots,
  documentsToSubmit,
  isFinalStep,
  nextStep,
  planWrites,
  requiredDocuments,
  stepValues,
  validateStep,
  type DocumentFace,
  type ItemData,
  type PreviewDocument,
  type SubmissionData,
} from "@/lib/runtime"
import { cn } from "@/lib/utils"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { BackendPlanView } from "./backend-plan-view"
import { StepForm, type DocumentActions } from "./step-form"

/** Repeaters d'une étape : autant d'items vides que le minimum demandé. */
function withRepeaterDefaults(schema: ReturnType<typeof useEditor.getState>["schema"], stepKey: string, raw: SubmissionData): SubmissionData {
  const next = { ...raw }
  for (const f of schema.steps[stepKey]?.fields ?? [])
    if (f.type === "repeater" && !Array.isArray(next[f.key]) && f.min) next[f.key] = Array.from({ length: f.min }, () => ({}))
  return next
}

/** Retire l'item `index` d'un repeater et renumérote les pièces des items suivants. */
function shiftDocuments(documents: PreviewDocument[], repeaterKey: string, index: number): PreviewDocument[] {
  const re = new RegExp(`^${repeaterKey}\\[(\\d+)\\]\\.`)
  return documents.flatMap((d) => {
    const m = re.exec(d.fieldPath)
    if (!m) return [d]
    const i = Number(m[1])
    if (i === index) return []
    return i > index ? [{ ...d, fieldPath: d.fieldPath.replace(re, `${repeaterKey}[${i - 1}].`) }] : [d]
  })
}

export function PreviewView() {
  const schema = useEditor((s) => s.schema)
  const form = useEditor((s) => s.form)
  const version = useEditor((s) => s.version)
  const editLang = useEditor((s) => s.lang)
  const properties = useCatalogStore((s) => s.properties)
  const languages = useMemo(() => schemaLanguages(schema), [schema])
  const [locale, setLocale] = useState(editLang)
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [raw, setRaw] = useState<SubmissionData>(() => withRepeaterDefaults(schema, schema.start, {}))
  const [documents, setDocuments] = useState<PreviewDocument[]>([])
  const [history, setHistory] = useState<string[]>([schema.start])
  const [attempted, setAttempted] = useState(false)
  const [done, setDone] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [externalRef, setExternalRef] = useState(true)

  useEffect(() => {
    let alive = true
    void listDocumentTypes({ language: locale }).then((r) => alive && setDocumentTypes(r.data))
    return () => {
      alive = false
    }
  }, [locale])

  // Si une étape du chemin a été supprimée entre-temps, on repart du début
  const path = useMemo(() => (history.every((k) => k in schema.steps) ? history : [schema.start]), [schema, history])
  const current = path[path.length - 1]!
  const ctx = useMemo(() => createContext(properties, documentTypes, documents, locale), [properties, documentTypes, documents, locale])
  const scope = useMemo(() => ({ ...collectData(schema, path.slice(0, -1), raw), ...stepValues(schema, current, raw) }), [schema, path, raw, current])
  const errors = useMemo(() => (attempted ? validateStep(schema, current, scope, ctx) : []), [attempted, schema, current, scope, ctx])
  const data = useMemo(() => collectData(schema, path, raw), [schema, path, raw])
  const server = useMemo(() => computePath(schema, raw, ctx), [schema, raw, ctx])
  const required = useMemo(() => requiredDocuments(schema, path, data, ctx), [schema, path, data, ctx])
  const submitted = useMemo(() => documentsToSubmit(documents, documentSlots(schema, path, data).map((s) => s.fieldPath)), [documents, schema, path, data])

  const plan = useMemo(
    () =>
      done
        ? planWrites({
            schema,
            formName: show(form?.name),
            versionNumber: version?.number ?? 1,
            path,
            data,
            documents: submitted,
            properties,
            documentTypes: new Map(documentTypes.map((d) => [d.code, { label: d.label, validityDays: d.validityDays }])),
            externalRef: externalRef ? { system: "crm", externalId: "48213" } : null,
          })
        : null,
    [done, schema, form, version, path, data, submitted, properties, documentTypes, externalRef],
  )

  const restart = () => {
    setRaw(withRepeaterDefaults(schema, schema.start, {}))
    setDocuments([])
    setHistory([schema.start])
    setAttempted(false)
    setDone(false)
    setRefused(null)
  }

  const onContinue = () => {
    setAttempted(true)
    setRefused(null)
    if (validateStep(schema, current, scope, ctx).length > 0) return
    const next = nextStep(schema, current, data)
    if (next && !path.includes(next)) {
      setHistory([...path, next])
      setRaw((r) => withRepeaterDefaults(schema, next, r))
      setAttempted(false)
      return
    }
    if (!isFinalStep(schema, current))
      return setRefused("Aucune branche ne s'applique et l'étape n'est pas finale : le parcours s'arrête ici (dead_end_branch, refusé à la publication).")
    // Transmission : le serveur rejoue tout le parcours (computePath) avant d'accepter.
    const replay = computePath(schema, raw, ctx)
    if (!replay.complete) return setRefused(`Transmission refusée : le serveur bloque à l'étape « ${replay.current} ».`)
    setDone(true)
  }

  const docs: DocumentActions = {
    upload: (doc) =>
      setDocuments((all) => [...all.filter((d) => !(d.fieldPath === doc.fieldPath && d.face === doc.face)), { ...doc, id: crypto.randomUUID() }]),
    remove: (fieldPath, face: DocumentFace) => setDocuments((all) => all.filter((d) => !(d.fieldPath === fieldPath && d.face === face))),
    dates: (fieldPath, dates) => setDocuments((all) => all.map((d) => (d.fieldPath === fieldPath ? { ...d, ...dates } : d))),
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_380px] max-lg:grid-cols-1">
      <div className="bg-muted/40 flex min-h-0 flex-col">
        <div className="bg-background flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={device} onValueChange={(v) => v && setDevice(v as typeof device)}>
            <ToggleGroupItem value="desktop" aria-label="Ordinateur" className="px-2.5">
              <Monitor />
            </ToggleGroupItem>
            <ToggleGroupItem value="mobile" aria-label="Mobile" className="px-2.5">
              <Smartphone />
            </ToggleGroupItem>
          </ToggleGroup>
          {languages.length > 1 && (
            <ToggleGroup type="single" variant="outline" size="sm" value={locale} onValueChange={(v) => v && setLocale(v)}>
              {languages.map((l) => (
                <ToggleGroupItem key={l} value={l} className="px-2.5 text-xs uppercase" title={languageName(l)}>
                  {l}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <p className="text-muted-foreground text-sm">Aperçu : le portail tel que le client le remplira (brouillon courant, non enregistré).</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={restart}>
            <RotateCcw /> Recommencer
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
          <div className={cn("bg-background mx-auto rounded-2xl border shadow-sm transition-[max-width]", device === "mobile" ? "max-w-[390px] p-5" : "max-w-2xl p-8")}>
            <p className="text-muted-foreground mb-6 text-xs font-medium">{show(form?.name, locale)}</p>
            {done ? (
              <div className="flex flex-col items-start gap-3 py-6">
                <CircleCheck className="size-8 text-emerald-600" />
                <h2 className="text-xl font-semibold">{locale === "en" ? "Submitted" : "Dossier transmis"}</h2>
                <p className="text-muted-foreground text-sm">Le détail des écritures en base est affiché ci-dessous.</p>
                <Button variant="outline" onClick={restart}>
                  <RotateCcw /> Recommencer
                </Button>
              </div>
            ) : current in schema.steps ? (
              <>
                <StepForm
                  key={`${current}-${path.length}`}
                  schema={schema}
                  stepKey={current}
                  scope={scope}
                  raw={raw}
                  setValue={(key, value) =>
                    setRaw((r) => {
                      const next = { ...r }
                      if (value === undefined) delete next[key]
                      else next[key] = value
                      return next
                    })
                  }
                  addItem={(key) => setRaw((r) => ({ ...r, [key]: [...((r[key] as ItemData[] | undefined) ?? []), {}] }))}
                  removeItem={(key, index) => {
                    setRaw((r) => ({ ...r, [key]: ((r[key] as ItemData[] | undefined) ?? []).filter((_, i) => i !== index) }))
                    setDocuments((all) => shiftDocuments(all, key, index))
                  }}
                  errors={errors}
                  ctx={ctx}
                  documentTypes={documentTypes}
                  docs={docs}
                  index={path.length - 1}
                  isFinal={isFinalStep(schema, current)}
                  onBack={path.length > 1 ? () => (setHistory(path.slice(0, -1)), setAttempted(false), setRefused(null)) : undefined}
                  onContinue={onContinue}
                />
                {refused && (
                  <p className="text-destructive mt-4 flex gap-2 text-sm">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {refused}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune étape de départ.</p>
            )}
          </div>
          {plan && (
            <div className="bg-background mx-auto mt-6 max-w-4xl rounded-2xl border p-5 shadow-sm sm:p-8">
              <BackendPlanView
                plan={plan}
                toolbar={
                  <div className="mt-2 flex items-center gap-2">
                    <Switch id="ext-ref" checked={externalRef} onCheckedChange={setExternalRef} />
                    <Label htmlFor="ext-ref" className="text-muted-foreground text-xs font-normal">
                      Demande de collecte créée avec une référence externe (crm / 48213)
                    </Label>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>

      <aside className="bg-background flex min-h-0 flex-col overflow-y-auto border-l max-lg:hidden">
        <div className="flex flex-col gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Chemin suivi</p>
          <ol className="flex flex-wrap items-center gap-1 text-xs">
            {path.map((k, i) => (
              <li key={k} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <span className={cn("rounded-full px-2 py-0.5", i === path.length - 1 && !done ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {show(schema.steps[k]?.title, locale) || k}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">
            computePath (rejoué par le serveur) : <code className="font-mono">[{server.path.join(", ")}]</code>
            {server.complete ? " · complet" : server.current ? ` · bloque à ${server.current}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Pièces exigées sur le chemin</p>
          {required.length === 0 ? (
            <p className="text-muted-foreground text-xs">Aucune pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {required.map((r) => (
                <li key={r.fieldPath} className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", r.status === "provided" ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  <code className="truncate font-mono">{r.fieldPath}</code>
                  <span className="text-muted-foreground ml-auto">{r.status === "provided" ? "fournie" : "manquante"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold">submissions.data</p>
          <p className="text-muted-foreground text-xs">Réponses des étapes parcourues et des champs affichés, indexées par clé de champ.</p>
          <pre className="bg-muted/50 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
          <p className="mt-2 text-sm font-semibold">documents</p>
          <pre className="bg-muted/50 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
            {JSON.stringify(
              submitted.map((d) => ({ fieldPath: d.fieldPath, documentTypeCode: d.documentTypeCode, face: d.face, originalFilename: d.originalFilename })),
              null,
              2,
            )}
          </pre>
        </div>
      </aside>
    </div>
  )
}
