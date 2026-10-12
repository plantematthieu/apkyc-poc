import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import { createEmptySchema, DSL_VERSION } from "@/lib/dsl"
import { CURRENT_USER_ID, newId, now, readTables, TENANT_ID, tick, transaction, type FormRow, type Tables } from "./db"
import { notFound, unprocessable } from "./problem"
import { checkLabel } from "./properties"
import type { FormDefinition, FormDefinitionCreate, Page } from "./types"

/** /v1/forms : formulaires logiques du tenant ; leur contenu vit dans les versions. */

export function toFormDefinition(row: FormRow, tables: Tables): FormDefinition {
  const versions = tables.formVersions.filter((v) => v.formId === row.id)
  const published = versions.filter((v) => v.status === "published").sort((a, b) => b.number - a.number)[0]
  const draft = versions.find((v) => v.status === "draft")
  return {
    id: row.id,
    name: row.name,
    templateId: row.templateId,
    latestPublishedVersionId: published?.id ?? null,
    draftVersionId: draft?.id ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function findFormRow(tables: Tables, formId: string): FormRow {
  const row = tables.forms.find((f) => f.id === formId && f.tenantId === TENANT_ID)
  if (!row) throw notFound("form_not_found", `Form ${formId} not found`)
  return row
}

/** GET /v1/forms — plus récemment modifiés d'abord (le POC ne pagine pas). */
export async function listForms(params: { includeArchived?: boolean } = {}): Promise<Page<FormDefinition>> {
  await tick()
  const tables = readTables()
  const data = tables.forms
    .filter((f) => f.tenantId === TENANT_ID && (params.includeArchived || !f.archivedAt))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((row) => toFormDefinition(row, tables))
  return { data, nextCursor: null }
}

/** GET /v1/forms/{formId} */
export async function getForm(formId: string): Promise<FormDefinition> {
  await tick()
  const tables = readTables()
  return toFormDefinition(findFormRow(tables, formId), tables)
}

/**
 * POST /v1/forms — crée le formulaire et sa version 1 en brouillon. Avec un modèle, son schéma
 * est copié ; sinon le brouillon part du schéma vide du DSL (une étape finale vide).
 */
export async function createForm(input: FormDefinitionCreate): Promise<FormDefinition> {
  await tick()
  checkLabel(input.name)
  let schema = createEmptySchema()
  let dslVersion = DSL_VERSION
  if (input.templateId) {
    const template = FORM_TEMPLATE_ROWS.find((t) => t.id === input.templateId && !t.archivedAt)
    if (!template) throw unprocessable("unknown_template", `Form template ${input.templateId} does not exist or is archived`)
    schema = structuredClone(template.schema)
    dslVersion = template.dslVersion
  }

  return transaction((tables) => {
    const at = now()
    const form: FormRow = {
      id: newId(),
      tenantId: TENANT_ID,
      name: input.name,
      templateId: input.templateId ?? null,
      createdBy: CURRENT_USER_ID,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    tables.forms.push(form)
    tables.formVersions.push({
      id: newId(),
      formId: form.id,
      number: 1,
      status: "draft",
      schema,
      dslVersion,
      revision: 1,
      hash: null,
      createdBy: CURRENT_USER_ID,
      publishedBy: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    })
    return toFormDefinition(form, tables)
  })
}

/** PATCH /v1/forms/{formId} — renommage. */
export async function updateForm(formId: string, changes: { name: FormDefinition["name"] }): Promise<FormDefinition> {
  await tick()
  checkLabel(changes.name)
  return transaction((tables) => {
    const row = findFormRow(tables, formId)
    row.name = changes.name
    row.updatedAt = now()
    return toFormDefinition(row, tables)
  })
}

/**
 * POST /v1/forms/{formId}/archive — plus aucune nouvelle demande de collecte ; les dossiers
 * existants restent lisibles. Un formulaire n'est jamais supprimé.
 */
export async function archiveForm(formId: string): Promise<FormDefinition> {
  await tick()
  return transaction((tables) => {
    const row = findFormRow(tables, formId)
    if (!row.archivedAt) {
      row.archivedAt = now()
      row.updatedAt = row.archivedAt
    }
    return toFormDefinition(row, tables)
  })
}

/** Touche le formulaire quand une de ses versions change (tri de la liste). */
export function touchForm(tables: Tables, formId: string, at: string) {
  const row = tables.forms.find((f) => f.id === formId)
  if (row) row.updatedAt = at
}
