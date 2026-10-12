"use client"

import { useEffect, useMemo } from "react"
import { create } from "zustand"
import type { Catalog } from "@/lib/dsl"
import { listDocumentTypes, listProperties, onTablesChange, toCatalog, type DocumentType, type Property } from "@/lib/local-api"

/**
 * Référentiels lus par le builder : propriétés (système et tenant, archivées comprises) et
 * types de pièces. Rechargés à chaque écriture de l'API locale, y compris depuis un autre onglet.
 */
interface CatalogState {
  loaded: boolean
  properties: Property[]
  documentTypes: DocumentType[]
  refresh: () => Promise<void>
}

export const useCatalogStore = create<CatalogState>()((set) => ({
  loaded: false,
  properties: [],
  documentTypes: [],
  refresh: async () => {
    const [properties, documentTypes] = await Promise.all([listProperties({ includeArchived: true }), listDocumentTypes({ language: "fr" })])
    set({ loaded: true, properties: properties.data, documentTypes: documentTypes.data })
  },
}))

let subscribed = false

/** Charge les référentiels une fois et les garde à jour. */
export function useCatalog() {
  const state = useCatalogStore()
  useEffect(() => {
    if (subscribed) return
    subscribed = true
    void useCatalogStore.getState().refresh()
    onTablesChange(() => void useCatalogStore.getState().refresh())
  }, [])
  return state
}

/** Catalogue au format attendu par validateSchema. */
export function useValidationCatalog(): Catalog {
  const properties = useCatalogStore((s) => s.properties)
  return useMemo(() => toCatalog(properties), [properties])
}
