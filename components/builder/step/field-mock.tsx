"use client"

import { Calendar, ChevronDown, Plus, Upload } from "lucide-react"
import type { DocumentField, InputField } from "@/lib/dsl"
import { show } from "@/lib/builder"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { OptionsInline } from "./options-inline"

const box = "border-input bg-background text-muted-foreground/70 flex h-9 w-full items-center rounded-md border px-3 text-sm"

/** Rendu du champ tel que le client le verra (non interactif, sauf les choix). */
export function FieldMock({ field }: { field: InputField }) {
  const properties = useCatalogStore((s) => s.properties)
  const lang = useEditor((s) => s.lang)
  const control = (() => {
    switch (field.type) {
      case "number":
        return <div className={`${box} max-w-40`}>0</div>
      case "date":
        return (
          <div className={`${box} max-w-48 justify-between`}>
            jj/mm/aaaa <Calendar className="size-4" />
          </div>
        )
      case "country":
        return (
          <div className={`${box} max-w-72 justify-between`}>
            Sélectionner un pays… <ChevronDown className="size-4" />
          </div>
        )
      case "boolean":
        return (
          <div className="flex w-fit overflow-hidden rounded-md border text-sm">
            <span className="px-4 py-1.5">Oui</span>
            <span className="border-l px-4 py-1.5">Non</span>
          </div>
        )
      case "address":
        return (
          <div className="grid grid-cols-6 gap-2">
            <div className={`${box} col-span-6`}>Adresse</div>
            <div className={`${box} col-span-2`}>Code postal</div>
            <div className={`${box} col-span-4`}>Ville</div>
            <div className={`${box} col-span-6 justify-between`}>
              Pays <ChevronDown className="size-4" />
            </div>
          </div>
        )
      case "select": {
        const bound = field.bind && field.bind !== "party.nature" ? properties.find((p) => `${p.scope}.${p.key}` === field.bind) : undefined
        if (bound)
          return (
            <div className="flex flex-col gap-1.5">
              {!field.multiple && (
                <div className={`${box} max-w-72 justify-between`}>
                  Sélectionner… <ChevronDown className="size-4" />
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                Choix de la propriété : {(bound.options ?? []).map((o) => show(o.label, lang)).join(" · ") || "aucun"}
              </p>
            </div>
          )
        return (
          <div className="flex flex-col gap-2">
            {!field.multiple && (
              <div className={`${box} max-w-72 justify-between`}>
                Sélectionner… <ChevronDown className="size-4" />
              </div>
            )}
            <OptionsInline field={field} />
          </div>
        )
      }
      default:
        return <div className={box} />
    }
  })()

  if (!field.multiple || field.type === "select") return control
  return (
    <div className="flex flex-col gap-2">
      {control}
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Plus className="size-3.5" /> Ajouter une valeur
      </span>
    </div>
  )
}

export function DocumentMock({ field }: { field: DocumentField }) {
  const documentTypes = useCatalogStore((s) => s.documentTypes)
  const types = field.documentTypes.map((code) => documentTypes.find((d) => d.code === code))
  return (
    <div className="text-muted-foreground flex items-start gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
      <Upload className="mt-0.5 size-4 shrink-0" />
      <ul className="flex flex-col gap-0.5">
        {types.map((t, i) => (
          <li key={field.documentTypes[i]}>
            {t ? (
              <>
                <span className="text-foreground">{t.label}</span>
                {t.twoSided && " · recto verso"}
                {t.validityDays ? ` · moins de ${t.validityDays} jours` : ""}
              </>
            ) : (
              <span className="text-destructive">{field.documentTypes[i]} (type inconnu)</span>
            )}
          </li>
        ))}
        {types.length === 0 && <li>Aucun type de pièce accepté</li>}
      </ul>
    </div>
  )
}
