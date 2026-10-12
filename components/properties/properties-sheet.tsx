"use client"

import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Archive, Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { allFields, FIELD_TYPE_LABELS, NATURES, show, withText } from "@/lib/builder"
import type { FormSchema } from "@/lib/dsl"
import { archiveProperty, updateProperty, type Property, type PropertyScope } from "@/lib/local-api"
import { cn } from "@/lib/utils"
import { useCatalog } from "@/store/catalog"
import { problemMessage } from "./problem-message"
import { PropertyForm, SCOPES } from "./property-form"

/** Nombre de champs du formulaire bindés à chaque propriété (« party.last_name »…). */
function usageOf(schema?: FormSchema): Map<string, number> {
  const m = new Map<string, number>()
  if (!schema) return m
  for (const { field } of allFields(schema)) {
    if (field.type === "info" || field.type === "document" || field.type === "repeater" || !field.bind) continue
    m.set(field.bind, (m.get(field.bind) ?? 0) + 1)
  }
  return m
}

type Tab = PropertyScope | "documents"

/** Propriétés (système et du tenant) et types de pièces : les référentiels du builder. */
export function PropertiesSheet({ children, schema }: { children: ReactNode; schema?: FormSchema }) {
  const { properties, documentTypes } = useCatalog()
  const [tab, setTab] = useState<Tab>("party")
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const usage = useMemo(() => usageOf(schema), [schema])

  const list = (scope: PropertyScope) =>
    properties
      .filter((p) => p.scope === scope && (showArchived || !p.archivedAt))
      .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || Number(b.isSystem) - Number(a.isSystem) || a.key.localeCompare(b.key))

  return (
    <Sheet onOpenChange={(o) => !o && setCreating(false)}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-10">
          <SheetTitle>Propriétés et pièces</SheetTitle>
          <SheetDescription>
            Les propriétés sont les cibles du bind : à la validation d&apos;un dossier, la réponse est écrite dans parties.properties ou
            party_relations.properties. Les propriétés système sont communes à tous les tenants et en lecture seule.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => (setTab(v as Tab), setCreating(false))} className="min-h-0 flex-1 gap-0">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <TabsList>
              {(Object.keys(SCOPES) as PropertyScope[]).map((s) => (
                <TabsTrigger key={s} value={s} className="px-3">
                  {SCOPES[s].label}
                  <span className="text-muted-foreground tabular-nums">{list(s).length}</span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="documents" className="px-3">
                Pièces <span className="text-muted-foreground tabular-nums">{documentTypes.length}</span>
              </TabsTrigger>
            </TabsList>
            {tab !== "documents" && (
              <div className="ml-auto flex items-center gap-2">
                <Switch id="ps-archived" checked={showArchived} onCheckedChange={setShowArchived} />
                <Label htmlFor="ps-archived" className="text-muted-foreground text-xs font-normal">
                  Archivées
                </Label>
              </div>
            )}
          </div>

          {tab !== "documents" && (
            <div className="border-b px-4 py-3">
              {creating ? (
                <PropertyForm
                  key={tab}
                  initial={{ scope: tab }}
                  scopes={[tab]}
                  onCreated={(p) => {
                    toast.success(`Propriété ${p.scope}.${p.key} créée`)
                    setCreating(false)
                  }}
                  onCancel={() => setCreating(false)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-muted-foreground flex-1 text-xs">{SCOPES[tab].hint}</p>
                  <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                    <Plus /> Nouvelle propriété
                  </Button>
                </div>
              )}
            </div>
          )}

          {(Object.keys(SCOPES) as PropertyScope[]).map((s) => (
            <TabsContent key={s} value={s} className="min-h-0 overflow-y-auto">
              <ul className="divide-y">
                {list(s).map((p) => (
                  <PropertyRow key={p.id} property={p} used={usage.get(`${p.scope}.${p.key}`) ?? 0} inForm={!!schema} />
                ))}
              </ul>
            </TabsContent>
          ))}
          <TabsContent value="documents" className="min-h-0 overflow-y-auto">
            <p className="text-muted-foreground border-b px-4 py-3 text-xs">
              Catalogue global en lecture seule (table document_types), référencé par code dans les champs pièce.
            </p>
            <ul className="divide-y">
              {documentTypes.map((d) => (
                <li key={d.code} className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                    <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">{d.code}</code>
                    <span>{d.applicableNatures.length ? d.applicableNatures.map((n) => NATURES[n].short).join(", ") : "toutes natures"}</span>
                    <span>· {d.validityDays ? `moins de ${d.validityDays} jours` : "jusqu'à l'expiration portée sur la pièce"}</span>
                    {d.twoSided && <span>· recto verso</span>}
                    <span>· {d.allowedMimeTypes.map((m) => m.split("/")[1]).join(", ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function PropertyRow({ property: p, used, inForm }: { property: Property; used: number; inForm: boolean }) {
  const [label, setLabel] = useState(p.label.fr)
  const editable = !p.isSystem && !p.archivedAt

  const saveLabel = async () => {
    if (label === p.label.fr) return
    try {
      await updateProperty(p.id, { label: withText(p.label, "fr", label) })
    } catch (e) {
      toast.error(problemMessage(e))
      setLabel(p.label.fr)
    }
  }

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", p.archivedAt && "opacity-60")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editable ? (
          <input
            value={label}
            aria-label="Libellé"
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="hover:bg-muted focus:bg-background focus:ring-ring/40 -mx-1.5 h-7 rounded-md bg-transparent px-1.5 text-sm font-medium outline-none focus:ring-2"
          />
        ) : (
          <span className="h-7 text-sm leading-7 font-medium">{show(p.label)}</span>
        )}
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
            {p.scope}.{p.key}
          </code>
          <span>
            {FIELD_TYPE_LABELS[p.type]}
            {p.multiple ? " (plusieurs valeurs)" : ""}
          </span>
          {p.scope === "party" && <span>· {p.natures.length ? p.natures.map((n) => NATURES[n].short).join(", ") : "toutes natures"}</span>}
          {p.scope === "relation" && <span>· {p.relationTypes.length ? p.relationTypes.join(", ") : "toutes relations"}</span>}
          {p.options && <span>· {p.options.map((o) => show(o.label)).join(" / ")}</span>}
          {inForm && used > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
              {used} champ{used > 1 ? "s" : ""} ici
            </span>
          )}
          {p.archivedAt && <span className="bg-muted rounded-full px-2 py-0.5">Archivée</span>}
        </div>
      </div>
      {p.isSystem ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
              <Lock className="size-3.5" /> Système
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">Commune à tous les tenants, cible des modèles de formulaire : ni modifiable ni archivable.</TooltipContent>
        </Tooltip>
      ) : (
        !p.archivedAt && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            title="Archiver : plus aucun nouveau bind ; les versions publiées et les dossiers restent lisibles. Définitif."
            onClick={async () => {
              try {
                await archiveProperty(p.id)
              } catch (e) {
                toast.error(problemMessage(e))
              }
            }}
          >
            <Archive /> Archiver
          </Button>
        )
      )}
    </li>
  )
}
