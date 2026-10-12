import type { FormSchema, InputFieldType, LocalizedText, PartyNature } from "@/lib/dsl"
import type { FormVersionStatus, PropertyOption, PropertyScope } from "./types"

/**
 * « Base » du POC : les lignes des tables forms, form_versions et properties (propriétés du
 * tenant), en colonnes camelCase, stockées dans le localStorage. Les tables globales
 * (document_types, form_templates, propriétés système) viennent de lib/catalog.
 *
 * Chaque appel relit le stockage : deux onglets voient les écritures l'un de l'autre, ce qui
 * permet d'éprouver le verrou optimiste (revision / If-Match).
 */

export const STORAGE_KEY = "apkyc-poc-db"
const SCHEMA_VERSION = 2

/** Tenant et utilisateur fictifs : dans l'appli, ils viennent du token. */
export const TENANT_ID = "poc-tenant"
export const CURRENT_USER_ID = "00000000-0000-4000-8000-000000000001"

export interface FormRow {
  id: string
  tenantId: string
  name: LocalizedText
  templateId: string | null
  createdBy: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FormVersionRow {
  id: string
  formId: string
  number: number
  status: FormVersionStatus
  schema: FormSchema
  dslVersion: number
  revision: number
  hash: string | null
  createdBy: string
  publishedBy: string | null
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PropertyRow {
  id: string
  tenantId: string
  scope: PropertyScope
  key: string
  type: InputFieldType
  multiple: boolean
  label: LocalizedText
  options: PropertyOption[] | null
  natures: PartyNature[]
  relationTypes: string[]
  createdBy: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Tables {
  version: number
  forms: FormRow[]
  formVersions: FormVersionRow[]
  properties: PropertyRow[]
}

const empty = (): Tables => ({ version: SCHEMA_VERSION, forms: [], formVersions: [], properties: [] })

/** Repli en mémoire hors navigateur (tests). */
let memory: Tables = empty()

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function readTables(): Tables {
  const store = storage()
  if (!store) return structuredClone(memory)
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Tables
    return parsed.version === SCHEMA_VERSION ? parsed : empty()
  } catch {
    return empty()
  }
}

const listeners = new Set<() => void>()

/** Prévient les vues d'une écriture (même onglet ; les autres onglets reçoivent l'événement storage). */
export function onTablesChange(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener()
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage)
  }
}

/** Lit, applique la modification et réécrit : l'équivalent d'une transaction. */
export function transaction<T>(fn: (tables: Tables) => T): T {
  const tables = readTables()
  const result = fn(tables)
  const store = storage()
  if (store) store.setItem(STORAGE_KEY, JSON.stringify(tables))
  else memory = structuredClone(tables)
  listeners.forEach((l) => l())
  return result
}

/** Vide la base (tests, bouton de remise à zéro). */
export function resetTables() {
  transaction((tables) => Object.assign(tables, empty()))
}

export const newId = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

/** Laisse la main comme le ferait un appel réseau. */
export const tick = () => Promise.resolve()
