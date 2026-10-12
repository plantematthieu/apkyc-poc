import { checkStructure, DSL_VERSION, validateSchema, type FormSchema, type ValidationReport } from "@/lib/dsl"
import { canonicalHash } from "./canonical-json"
import { toCatalog } from "./catalog"
import { CURRENT_USER_ID, newId, now, readTables, tick, transaction, type FormVersionRow, type Tables } from "./db"
import { findFormRow, touchForm } from "./forms"
import { diffJson } from "./json-diff"
import { conflict, notFound, preconditionFailed, preconditionRequired, unprocessable } from "./problem"
import { listProperties } from "./properties"
import type { FormVersion, FormVersionDiff, FormVersionStatus, FormVersionSummary } from "./types"

/**
 * /v1/forms/{formId}/versions : cycle de vie draft → published → archived, un seul brouillon
 * par formulaire, verrou optimiste par `revision` (ETag / If-Match), version publiée figée.
 */

const toSummary = (row: FormVersionRow): FormVersionSummary => ({
  id: row.id,
  formId: row.formId,
  number: row.number,
  status: row.status,
  dslVersion: row.dslVersion,
  revision: row.revision,
  hash: row.hash,
  createdBy: row.createdBy,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toVersion = (row: FormVersionRow): FormVersion => ({ ...toSummary(row), schema: structuredClone(row.schema) })

function findVersionRow(tables: Tables, formId: string, versionId: string): FormVersionRow {
  findFormRow(tables, formId)
  const row = tables.formVersions.find((v) => v.id === versionId && v.formId === formId)
  if (!row) throw notFound("form_version_not_found", `Form version ${versionId} not found`)
  return row
}

/** "3" ou 3 → 3 ; l'en-tête If-Match porte la révision entre guillemets. */
function parseRevision(ifMatch: string | number): number {
  return typeof ifMatch === "number" ? ifMatch : Number(ifMatch.replace(/^W\//, "").replace(/"/g, ""))
}

/** GET /v1/forms/{formId}/versions */
export async function listFormVersions(formId: string, params: { status?: FormVersionStatus } = {}): Promise<{ data: FormVersionSummary[] }> {
  await tick()
  const tables = readTables()
  findFormRow(tables, formId)
  const data = tables.formVersions
    .filter((v) => v.formId === formId && (!params.status || v.status === params.status))
    .sort((a, b) => b.number - a.number)
    .map(toSummary)
  return { data }
}

/** GET /v1/forms/{formId}/versions/{versionId} — l'ETag est la révision. */
export async function getFormVersion(formId: string, versionId: string): Promise<{ version: FormVersion; etag: string }> {
  await tick()
  const row = findVersionRow(readTables(), formId, versionId)
  return { version: toVersion(row), etag: `"${row.revision}"` }
}

/**
 * POST /v1/forms/{formId}/versions — nouveau brouillon, copie de `fromVersionId` ou de la
 * dernière version publiée. 409 s'il existe déjà un brouillon.
 */
export async function createFormVersion(formId: string, body: { fromVersionId?: string } = {}): Promise<FormVersion> {
  await tick()
  return transaction((tables) => {
    const form = findFormRow(tables, formId)
    if (form.archivedAt) throw conflict("form_archived", `Form ${formId} is archived`)
    const versions = tables.formVersions.filter((v) => v.formId === formId)
    const draft = versions.find((v) => v.status === "draft")
    if (draft) throw conflict("draft_exists", `Form ${formId} already has an open draft: ${draft.id}`)

    const source = body.fromVersionId
      ? versions.find((v) => v.id === body.fromVersionId)
      : versions.filter((v) => v.status === "published").sort((a, b) => b.number - a.number)[0]
    if (!source) {
      if (body.fromVersionId) {
        throw unprocessable("unknown_source_version", `Version ${body.fromVersionId} does not belong to form ${formId}`)
      }
      throw conflict("no_published_version", `Form ${formId} has no published version to copy: provide fromVersionId`)
    }

    const at = now()
    const row: FormVersionRow = {
      id: newId(),
      formId,
      number: Math.max(0, ...versions.map((v) => v.number)) + 1,
      status: "draft",
      schema: structuredClone(source.schema),
      dslVersion: source.dslVersion,
      revision: 1,
      hash: null,
      createdBy: CURRENT_USER_ID,
      publishedBy: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    tables.formVersions.push(row)
    touchForm(tables, formId, at)
    return toVersion(row)
  })
}

/**
 * PUT /v1/forms/{formId}/versions/{versionId} — remplace le schéma d'un brouillon.
 * Seule la forme du DSL est contrôlée (checkStructure) : les états intermédiaires du builder
 * passent, ils ne sont refusés qu'à la publication. If-Match obligatoire (428), révision
 * périmée = 412 sans rien écraser.
 */
export async function saveFormVersionSchema(
  formId: string,
  versionId: string,
  body: { schema: unknown },
  ifMatch: string | number | undefined,
): Promise<{ version: FormVersion; etag: string }> {
  await tick()
  if (ifMatch === undefined) throw preconditionRequired("`If-Match` header missing")
  const expected = parseRevision(ifMatch)
  return transaction((tables) => {
    const form = findFormRow(tables, formId)
    const row = findVersionRow(tables, formId, versionId)
    if (form.archivedAt) throw conflict("form_archived", `Form ${formId} is archived`)
    if (row.status !== "draft") {
      throw conflict("version_not_draft", `Form version ${versionId} is ${row.status} and cannot be changed`)
    }
    if (row.revision !== expected) {
      throw preconditionFailed("revision_mismatch", `Form version is at revision ${row.revision}: reload it`)
    }
    if (row.dslVersion !== DSL_VERSION) {
      throw unprocessable("unsupported_dsl_version", `DSL version ${row.dslVersion} is not supported`)
    }
    const structure = checkStructure(body.schema)
    if (!structure.ok) {
      throw unprocessable("invalid_schema_structure", "The schema does not have the shape of the DSL", {
        valid: false,
        issues: structure.issues,
      })
    }
    row.schema = structuredClone(structure.schema)
    row.revision += 1
    row.updatedAt = now()
    touchForm(tables, formId, row.updatedAt)
    return { version: toVersion(row), etag: `"${row.revision}"` }
  })
}

/** Contrôles de publication contre les propriétés du tenant et les types de pièces. */
export async function checkSchema(schema: FormSchema | unknown): Promise<ValidationReport> {
  const { data } = await listProperties({ includeArchived: true })
  return validateSchema(schema, toCatalog(data))
}

/** POST /v1/forms/{formId}/versions/{versionId}/validate */
export async function validateFormVersion(formId: string, versionId: string): Promise<ValidationReport> {
  await tick()
  const row = findVersionRow(readTables(), formId, versionId)
  return checkSchema(row.schema)
}

/**
 * POST /v1/forms/{formId}/versions/{versionId}/publish — refusé (422 avec le rapport) s'il y a
 * une erreur ; sinon la version est figée et le sha256 de son schéma canonique calculé.
 * If-Match facultatif : publie exactement la révision relue.
 */
export async function publishFormVersion(formId: string, versionId: string, ifMatch?: string | number): Promise<FormVersion> {
  await tick()
  const tables = readTables()
  const form = findFormRow(tables, formId)
  const row = findVersionRow(tables, formId, versionId)
  if (form.archivedAt) throw conflict("form_archived", `Form ${formId} is archived`)
  if (row.status !== "draft") {
    throw conflict("version_not_draft", `Form version ${versionId} is ${row.status} and cannot be published`)
  }
  if (ifMatch !== undefined && row.revision !== parseRevision(ifMatch)) {
    throw preconditionFailed("revision_mismatch", `Form version is at revision ${row.revision}: reload it`)
  }
  const report = await checkSchema(row.schema)
  if (!report.valid) {
    const errors = report.issues.filter((i) => i.severity === "error").length
    throw unprocessable("publication_checks_failed", `Form version ${versionId} fails the publication checks: ${errors} error(s)`, report)
  }
  const hash = await canonicalHash(row.schema)

  return transaction((fresh) => {
    const current = findVersionRow(fresh, formId, versionId)
    // Même garde que l'UPDATE de l'API : rien n'a changé entre le contrôle et l'écriture.
    if (current.status !== "draft" || current.revision !== row.revision) {
      throw conflict("concurrent_change", `Form version ${versionId} changed while being published: reload it`)
    }
    const at = now()
    current.status = "published"
    current.hash = hash
    current.publishedAt = at
    current.publishedBy = CURRENT_USER_ID
    current.updatedAt = at
    touchForm(fresh, formId, at)
    return toVersion(current)
  })
}

/** POST /v1/forms/{formId}/versions/{versionId}/archive — un brouillon ne s'archive pas. */
export async function archiveFormVersion(formId: string, versionId: string): Promise<FormVersion> {
  await tick()
  return transaction((tables) => {
    const row = findVersionRow(tables, formId, versionId)
    if (row.status === "draft") throw conflict("version_is_draft", `Form version ${versionId} is a draft and cannot be archived`)
    if (row.status === "published") {
      const at = now()
      row.status = "archived"
      row.archivedAt = at
      row.updatedAt = at
      touchForm(tables, formId, at)
    }
    return toVersion(row)
  })
}

/** GET /v1/forms/{formId}/versions/{versionId}/diff?against= — changements de `against` vers cette version. */
export async function diffFormVersions(formId: string, versionId: string, against: string): Promise<FormVersionDiff> {
  await tick()
  const tables = readTables()
  const to = findVersionRow(tables, formId, versionId)
  const from = tables.formVersions.find((v) => v.id === against && v.formId === formId)
  if (!from) throw unprocessable("unknown_version", `Version ${against} does not belong to form ${formId}`)
  return { fromVersionId: from.id, toVersionId: to.id, changes: diffJson(from.schema, to.schema) }
}
