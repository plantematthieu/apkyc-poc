"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Archive, Database, FileStack, GitBranch, MoreHorizontal, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { NATURES, show } from "@/lib/builder"
import {
  archiveForm,
  createForm,
  listForms,
  listFormTemplates,
  listFormVersions,
  onTablesChange,
  type FormDefinition,
  type FormTemplate,
  type FormVersionSummary,
} from "@/lib/local-api"
import { PropertiesSheet } from "@/components/properties/properties-sheet"
import { problemMessage } from "@/components/properties/problem-message"
import { StatusBadge } from "@/components/builder/versions-menu"
import { useCatalog } from "@/store/catalog"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" })

interface Row {
  form: FormDefinition
  versions: FormVersionSummary[]
}

export function FormsHome() {
  const router = useRouter()
  useCatalog()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [templates, setTemplates] = useState<{ fr: FormTemplate; en?: FormTemplate }[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [toArchive, setToArchive] = useState<FormDefinition | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await listForms({ includeArchived: showArchived })
      setRows(await Promise.all(data.map(async (form) => ({ form, versions: (await listFormVersions(form.id)).data }))))
    }
    void load()
    return onTablesChange(() => void load())
  }, [showArchived])

  useEffect(() => {
    void Promise.all([listFormTemplates({ language: "fr" }), listFormTemplates({ language: "en" })]).then(([fr, en]) =>
      setTemplates(fr.data.map((t) => ({ fr: t, en: en.data.find((x) => x.id === t.id) }))),
    )
  }, [])

  const create = async (template?: { fr: FormTemplate; en?: FormTemplate }) => {
    try {
      const name = template ? { fr: template.fr.name, ...(template.en ? { en: template.en.name } : {}) } : { fr: "Nouveau formulaire" }
      const form = await createForm({ name, templateId: template?.fr.id })
      router.push(`/forms/${form.id}`)
    } catch (e) {
      toast.error(problemMessage(e))
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm font-medium">apkyc · POC (API locale)</p>
          <h1 className="text-2xl font-semibold tracking-tight">Formulaires de collecte</h1>
          <p className="text-muted-foreground max-w-prose text-sm">
            Les parcours que vos clients rempliront : étapes, branches selon leurs réponses, pièces à fournir. Chaque formulaire a ses versions : un
            brouillon modifiable, des versions publiées figées.
          </p>
        </div>
        <PropertiesSheet>
          <Button variant="outline" size="sm">
            <Database /> Propriétés et pièces
          </Button>
        </PropertiesSheet>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Créer</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.fr.id}
              onClick={() => void create(t)}
              className="group bg-card hover:border-primary/40 hover:bg-accent/40 flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
            >
              <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                <GitBranch className="size-4" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t.fr.name}</span>
                <span className="text-muted-foreground text-sm">{t.fr.description}</span>
                <span className="text-muted-foreground text-xs">
                  Modèle système · {t.fr.natures.length ? t.fr.natures.map((n) => NATURES[n].short).join(", ") : "toutes natures"}
                </span>
              </span>
            </button>
          ))}
          <button
            onClick={() => void create()}
            className="group bg-card hover:border-primary/40 hover:bg-accent/40 flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
          >
            <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
              <Plus className="size-4" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Formulaire vierge</span>
              <span className="text-muted-foreground text-sm">Schéma de départ du DSL : une étape finale vide.</span>
            </span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Mes formulaires</h2>
          <div className="ml-auto flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="text-muted-foreground text-xs font-normal">
              Archivés
            </Label>
          </div>
        </div>
        {rows === null ? null : rows.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-sm">
            <FileStack className="size-5" />
            Aucun formulaire pour l&apos;instant. Partez d&apos;un modèle ci-dessus.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ form, versions }) => {
              const latest = versions[0]
              const published = versions.find((v) => v.id === form.latestPublishedVersionId)
              return (
                <Card key={form.id} className="relative gap-2 p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/forms/${form.id}`} className="font-medium after:absolute after:inset-0">
                      {show(form.name)}
                    </Link>
                    {!form.archivedAt && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="relative z-10 -mt-1 -mr-2 size-8" aria-label="Actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setToArchive(form)}>
                            <Archive /> Archiver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {published && (
                      <span className="flex items-center gap-1">
                        n° {published.number} <StatusBadge status="published" />
                      </span>
                    )}
                    {form.draftVersionId && latest?.status === "draft" && (
                      <span className="flex items-center gap-1">
                        n° {latest.number} <StatusBadge status="draft" />
                      </span>
                    )}
                    {form.archivedAt && <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">Formulaire archivé</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">Modifié le {dateFmt.format(new Date(form.updatedAt))}</p>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <AlertDialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce formulaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toArchive && show(toArchive.name)} » ne pourra plus servir à de nouvelles demandes de collecte ; les dossiers existants restent
              lisibles. Un formulaire n&apos;est jamais supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toArchive) await archiveForm(toArchive.id)
                setToArchive(null)
              }}
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
