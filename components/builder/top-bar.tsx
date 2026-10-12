"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Braces, Database, Eye, GitBranch, LayoutList, Redo2, Rocket, Search, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { show, textIn, withText } from "@/lib/builder"
import { updateForm } from "@/lib/local-api"
import { PropertiesSheet } from "@/components/properties/properties-sheet"
import { useEditor, useHistory, type View } from "@/store/editor"
import { JsonDialog } from "./json-dialog"
import { LanguageMenu } from "./language-menu"
import { ProblemsButton } from "./problems-button"
import { PublishDialog } from "./publish-dialog"
import { SaveStatus } from "./save-status"
import { VersionsMenu } from "./versions-menu"

/** Nom du formulaire (PATCH /v1/forms/{formId}), dans la langue d'édition. */
function FormName() {
  const form = useEditor((s) => s.form)
  const lang = useEditor((s) => s.lang)
  const [draft, setDraft] = useState(() => textIn(form?.name, lang))
  const [key, setKey] = useState(`${form?.id}-${lang}`)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  if (key !== `${form?.id}-${lang}`) {
    setKey(`${form?.id}-${lang}`)
    setDraft(textIn(form?.name, lang))
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!form) return null
  return (
    <input
      value={draft}
      placeholder={lang !== "fr" ? `${form.name.fr} (à traduire)` : "Nom du formulaire"}
      onChange={(e) => {
        const value = e.target.value
        setDraft(value)
        clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
          if (lang === "fr" && !value.trim()) return
          const updated = await updateForm(form.id, { name: withText(form.name, lang, value.trim()) })
          useEditor.getState().setForm(updated)
        }, 500)
      }}
      aria-label="Nom du formulaire"
      className="hover:bg-muted focus:bg-background focus:ring-ring/40 h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-2 text-sm font-semibold outline-none focus:ring-2 sm:max-w-56"
    />
  )
}

export function TopBar({ onOpenCommands, onReload, onOpenVersion }: { onOpenCommands: () => void; onReload: () => void; onOpenVersion: (id: string) => void }) {
  const view = useEditor((s) => s.view)
  const setView = useEditor((s) => s.setView)
  const schema = useEditor((s) => s.schema)
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const activeStep = useEditor((s) => s.activeStep)
  const activeTitle = show(schema.steps[activeStep]?.title, lang)
  const canUndo = useHistory((s) => s.pastStates.length > 0)
  const canRedo = useHistory((s) => s.futureStates.length > 0)
  const { undo, redo } = useEditor.temporal.getState()

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-1.5 border-b px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/" aria-label="Retour aux formulaires">
              <ArrowLeft />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mes formulaires</TooltipContent>
      </Tooltip>

      <FormName />
      <VersionsMenu />

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mx-auto">
        <TabsList>
          <TabsTrigger value="flow" className="gap-1.5 px-3">
            <GitBranch /> <span className="hidden sm:inline">Parcours</span>
          </TabsTrigger>
          <TabsTrigger value="step" className="max-w-56 gap-1.5 px-3">
            <LayoutList />
            <span className="hidden truncate sm:inline">{activeTitle ? `Étape : ${activeTitle}` : "Étape"}</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5 px-3">
            <Eye /> <span className="hidden sm:inline">Aperçu</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-1">
        {!readOnly && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => undo()} disabled={!canUndo} aria-label="Annuler">
                  <Undo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Annuler <Kbd>Ctrl Z</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => redo()} disabled={!canRedo} aria-label="Rétablir">
                  <Redo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Rétablir <Kbd>Ctrl Y</Kbd>
              </TooltipContent>
            </Tooltip>
          </>
        )}
        <LanguageMenu />
        <ProblemsButton />
        <PropertiesSheet schema={schema}>
          <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Propriétés">
            <Database /> <span className="hidden xl:inline">Propriétés</span>
          </Button>
        </PropertiesSheet>
        <JsonDialog>
          <Button variant="ghost" size="icon-sm" aria-label="Schéma JSON">
            <Braces />
          </Button>
        </JsonDialog>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hidden md:inline-flex" onClick={onOpenCommands} aria-label="Actions (Ctrl K)">
          <Search />
        </Button>
        <SaveStatus onReload={onReload} />
        {!readOnly && (
          <PublishDialog onPublished={onOpenVersion}>
            <Button size="sm" className="gap-1.5">
              <Rocket /> Publier
            </Button>
          </PublishDialog>
        )}
      </div>
    </header>
  )
}
