import { SYSTEM_PROPERTY_ROWS } from "@/lib/catalog/system-properties"
import { KEY_PATTERN, PARTY_NATURES, type LocalizedText } from "@/lib/dsl"
import { CURRENT_USER_ID, newId, now, readTables, TENANT_ID, tick, transaction, type PropertyRow } from "./db"
import { conflict, notFound, unprocessable } from "./problem"
import type { Property, PropertyCreate, PropertyOption, PropertyScope, PropertyUpdate } from "./types"

/**
 * /v1/properties : propriétés système (lecture seule, communes à tous les tenants) et
 * propriétés du tenant, créées par l'admin. Mêmes règles que l'API (check-definition,
 * properties_guard) : clé immuable et jamais réutilisée, archivage sans suppression.
 */

const SYSTEM_CREATED_AT = "2026-01-01T00:00:00.000Z"

/** Ids stables des propriétés système, pour que les liens survivent à un rechargement. */
const SYSTEM_PROPERTIES: Property[] = SYSTEM_PROPERTY_ROWS.map((row, i) => ({
  id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
  key: row.key,
  scope: row.scope,
  type: row.type,
  multiple: row.multiple,
  label: row.label,
  options: null,
  natures: row.natures,
  relationTypes: row.relationTypes,
  isSystem: true,
  archivedAt: null,
  createdAt: SYSTEM_CREATED_AT,
  updatedAt: SYSTEM_CREATED_AT,
}))

const toProperty = (row: PropertyRow): Property => ({
  id: row.id,
  key: row.key,
  scope: row.scope,
  type: row.type,
  multiple: row.multiple,
  label: row.label,
  options: row.options,
  natures: row.natures,
  relationTypes: row.relationTypes,
  isSystem: false,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

function allProperties(): Property[] {
  const tenant = readTables()
    .properties.filter((p) => p.tenantId === TENANT_ID)
    .map(toProperty)
  return [...SYSTEM_PROPERTIES, ...tenant]
}

/** GET /v1/properties — triées par scope puis clé, non paginées. */
export async function listProperties(
  params: { scope?: PropertyScope; nature?: (typeof PARTY_NATURES)[number]; includeArchived?: boolean } = {},
): Promise<{ data: Property[] }> {
  await tick()
  const data = allProperties()
    .filter((p) => params.includeArchived || !p.archivedAt)
    .filter((p) => !params.scope || p.scope === params.scope)
    .filter((p) => !params.nature || p.natures.length === 0 || p.natures.includes(params.nature))
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.key.localeCompare(b.key))
  return { data }
}

/** GET /v1/properties/{propertyId} */
export async function getProperty(propertyId: string): Promise<Property> {
  await tick()
  const property = allProperties().find((p) => p.id === propertyId)
  if (!property) throw notFound("property_not_found", `Property ${propertyId} not found`)
  return property
}

/** POST /v1/properties */
export async function createProperty(input: PropertyCreate): Promise<Property> {
  await tick()
  checkLabel(input.label)
  if (!KEY_PATTERN.test(input.key) || input.key.length > 63) {
    throw unprocessable("invalid_key", `Key \`${input.key}\` must match ${KEY_PATTERN.source} (at most 63 characters)`)
  }
  const definition = {
    key: input.key,
    scope: input.scope,
    type: input.type,
    multiple: input.multiple ?? false,
    options: input.options ?? null,
    relationTypes: input.relationTypes ?? [],
  }
  checkDefinition(definition)

  return transaction((tables) => {
    // Archivées comprises : une clé n'est jamais réutilisée ; ni celle d'une propriété système.
    const taken =
      SYSTEM_PROPERTIES.some((p) => p.scope === input.scope && p.key === input.key) ||
      tables.properties.some((p) => p.tenantId === TENANT_ID && p.scope === input.scope && p.key === input.key)
    if (taken) {
      throw conflict("property_key_taken", `Key \`${input.key}\` is already used by a property with scope \`${input.scope}\``)
    }
    const at = now()
    const row: PropertyRow = {
      id: newId(),
      tenantId: TENANT_ID,
      ...definition,
      label: input.label,
      natures: input.natures ?? [],
      createdBy: CURRENT_USER_ID,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    tables.properties.push(row)
    return toProperty(row)
  })
}

/** PATCH /v1/properties/{propertyId} — key, scope, type et multiple sont immuables. */
export async function updateProperty(propertyId: string, changes: PropertyUpdate): Promise<Property> {
  await tick()
  if (SYSTEM_PROPERTIES.some((p) => p.id === propertyId)) {
    throw conflict("system_property_read_only", `Property ${propertyId} is a system property and cannot be changed`)
  }
  if (Object.keys(changes).length === 0) {
    throw unprocessable("no_updatable_field", "Only `label`, `options`, `natures` and `relationTypes` can be updated")
  }
  if (changes.label) checkLabel(changes.label)

  return transaction((tables) => {
    const row = tables.properties.find((p) => p.id === propertyId && p.tenantId === TENANT_ID)
    if (!row) throw notFound("property_not_found", `Property ${propertyId} not found`)
    if (row.archivedAt) throw conflict("property_archived", `Property ${propertyId} is archived and cannot be updated`)
    checkDefinition({
      ...row,
      options: changes.options ?? row.options,
      relationTypes: changes.relationTypes ?? row.relationTypes,
    })
    if (changes.label) row.label = changes.label
    if (changes.options) row.options = changes.options
    if (changes.natures) row.natures = changes.natures
    if (changes.relationTypes) row.relationTypes = changes.relationTypes
    row.updatedAt = now()
    return toProperty(row)
  })
}

/** POST /v1/properties/{propertyId}/archive — sans retour arrière : la clé reste prise. */
export async function archiveProperty(propertyId: string): Promise<Property> {
  await tick()
  if (SYSTEM_PROPERTIES.some((p) => p.id === propertyId)) {
    throw conflict("system_property_read_only", `Property ${propertyId} is a system property and cannot be archived`)
  }
  return transaction((tables) => {
    const row = tables.properties.find((p) => p.id === propertyId && p.tenantId === TENANT_ID)
    if (!row) throw notFound("property_not_found", `Property ${propertyId} not found`)
    if (!row.archivedAt) {
      row.archivedAt = now()
      row.updatedAt = row.archivedAt
    }
    return toProperty(row)
  })
}

// ---------------------------------------------------------------- Règles (check-definition.ts)

interface Definition {
  key: string
  scope: PropertyScope
  type: string
  multiple: boolean
  options: PropertyOption[] | null
  relationTypes: string[]
}

function checkDefinition(definition: Definition) {
  if (definition.scope === "party" && definition.key === "nature") {
    throw unprocessable("reserved_key", "The key `nature` is reserved for scope `party`: it targets the party's fixed nature")
  }
  if (definition.type === "select" && !definition.options) {
    throw unprocessable("options_required", "A `select` property requires `options`")
  }
  if (definition.type !== "select" && definition.options) {
    throw unprocessable("options_not_allowed", `A \`${definition.type}\` property cannot have \`options\``)
  }
  if (definition.options) {
    if (definition.options.length === 0) throw unprocessable("options_required", "`options` must not be empty")
    const seen = new Set<string>()
    for (const option of definition.options) {
      if (!/^[a-z0-9][a-z0-9_]*$/.test(option.value) || option.value.length > 63) {
        throw unprocessable("invalid_option_value", `Option value \`${option.value}\` must match ^[a-z0-9][a-z0-9_]*$`)
      }
      if (seen.has(option.value)) {
        throw unprocessable("duplicate_option_value", `Option value \`${option.value}\` is used more than once`)
      }
      seen.add(option.value)
      checkLabel(option.label)
    }
  }
  if (definition.multiple && definition.type === "boolean") {
    throw unprocessable("multiple_not_allowed", "A `boolean` property cannot hold multiple values")
  }
  if (definition.scope === "party" && definition.relationTypes.length > 0) {
    throw unprocessable("relation_types_not_allowed", "`relationTypes` only applies to properties with scope `relation`")
  }
}

export function checkLabel(text: LocalizedText) {
  if (!text || typeof text.fr !== "string" || text.fr.trim() === "") {
    throw unprocessable("invalid_localized_text", "The French text (`fr`) is required")
  }
  for (const [language, value] of Object.entries(text)) {
    if (!/^[a-z]{2}$/.test(language) || typeof value !== "string" || value.trim() === "") {
      throw unprocessable("invalid_localized_text", `Invalid translation \`${language}\``)
    }
  }
}
