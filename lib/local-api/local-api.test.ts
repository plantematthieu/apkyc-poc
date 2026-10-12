import { beforeEach, describe, expect, it } from "vitest"
import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import {
  archiveFormVersion,
  archiveProperty,
  createForm,
  createFormVersion,
  createProperty,
  diffFormVersions,
  getForm,
  getFormVersion,
  isProblem,
  listDocumentTypes,
  listFormTemplates,
  listFormVersions,
  listProperties,
  publishFormVersion,
  resetTables,
  saveFormVersionSchema,
  updateProperty,
} from "./index"

const rejects = async (p: Promise<unknown>, status: number, code: string) => {
  try {
    await p
  } catch (e) {
    expect(isProblem(e, code), `${(e as Error).message}`).toBe(true)
    expect((e as { status: number }).status).toBe(status)
    return
  }
  throw new Error(`expected ${status} ${code}`)
}

beforeEach(() => resetTables())

describe("formulaires et versions", () => {
  it("crée la version 1 en brouillon depuis un modèle", async () => {
    const form = await createForm({ name: { fr: "Test" }, templateId: FORM_TEMPLATE_ROWS[0]!.id })
    expect(form.draftVersionId).toBeTruthy()
    const { version, etag } = await getFormVersion(form.id, form.draftVersionId!)
    expect(version).toMatchObject({ number: 1, status: "draft", revision: 1, hash: null, dslVersion: 1 })
    expect(etag).toBe('"1"')
    expect(version.schema).toEqual(FORM_TEMPLATE_ROWS[0]!.schema)
  })

  it("sans modèle, part du schéma vide du DSL", async () => {
    const form = await createForm({ name: { fr: "Vide" } })
    const { version } = await getFormVersion(form.id, form.draftVersionId!)
    expect(Object.keys(version.schema.steps)).toEqual(["start"])
  })

  it("refuse un nom sans français, un modèle inconnu", async () => {
    await rejects(createForm({ name: { fr: "" } }), 422, "invalid_localized_text")
    await rejects(createForm({ name: { fr: "X" }, templateId: "nope" }), 422, "unknown_template")
  })

  it("sauvegarde : If-Match obligatoire, révision périmée = 412, forme invalide = 422", async () => {
    const form = await createForm({ name: { fr: "F" } })
    const id = form.draftVersionId!
    const { version } = await getFormVersion(form.id, id)
    await rejects(saveFormVersionSchema(form.id, id, { schema: version.schema }, undefined), 428, "precondition_required")
    const saved = await saveFormVersionSchema(form.id, id, { schema: version.schema }, '"1"')
    expect(saved.version.revision).toBe(2)
    expect(saved.etag).toBe('"2"')
    await rejects(saveFormVersionSchema(form.id, id, { schema: version.schema }, '"1"'), 412, "revision_mismatch")
    await rejects(saveFormVersionSchema(form.id, id, { schema: { start: "x" } }, 2), 422, "invalid_schema_structure")
    // Un état intermédiaire (étape inatteignable, select sans options) passe la sauvegarde.
    const draft = structuredClone(version.schema)
    draft.steps.orphan = { title: { fr: "Orpheline" }, fields: [{ key: "pick", type: "select", label: { fr: "Choix" } }], next: [] }
    expect((await saveFormVersionSchema(form.id, id, { schema: draft }, 2)).version.revision).toBe(3)
  })

  it("publication : refusée avec le rapport s'il y a une erreur, puis figée et hachée", async () => {
    const form = await createForm({ name: { fr: "F" }, templateId: FORM_TEMPLATE_ROWS[1]!.id })
    const id = form.draftVersionId!
    const { version } = await getFormVersion(form.id, id)
    const broken = structuredClone(version.schema)
    broken.steps.operation!.next = [{ if: { "==": [{ var: "price" }, 1] }, goto: "buyer" }]
    await saveFormVersionSchema(form.id, id, { schema: broken }, 1)
    try {
      await publishFormVersion(form.id, id)
      throw new Error("should fail")
    } catch (e) {
      expect(isProblem(e, "publication_checks_failed")).toBe(true)
      expect((e as { report: { issues: { code: string }[] } }).report.issues.map((i) => i.code)).toContain("dead_end_branch")
    }
    await saveFormVersionSchema(form.id, id, { schema: version.schema }, 2)
    await rejects(publishFormVersion(form.id, id, '"2"'), 412, "revision_mismatch")
    const published = await publishFormVersion(form.id, id, '"3"')
    expect(published.status).toBe("published")
    expect(published.hash).toMatch(/^[0-9a-f]{64}$/)
    await rejects(saveFormVersionSchema(form.id, id, { schema: version.schema }, 3), 409, "version_not_draft")
    expect((await getForm(form.id)).latestPublishedVersionId).toBe(id)
  })

  it("un seul brouillon ; nouveau brouillon copié de la dernière version publiée ; diff ; archivage", async () => {
    const form = await createForm({ name: { fr: "F" }, templateId: FORM_TEMPLATE_ROWS[0]!.id })
    const v1 = form.draftVersionId!
    await rejects(createFormVersion(form.id), 409, "draft_exists")
    await publishFormVersion(form.id, v1)
    await rejects(archiveFormVersion(form.id, (await createFormVersion(form.id)).id), 409, "version_is_draft")
    const { data } = await listFormVersions(form.id)
    expect(data.map((v) => [v.number, v.status])).toEqual([
      [2, "draft"],
      [1, "published"],
    ])
    const v2 = data[0]!.id
    const { version } = await getFormVersion(form.id, v2)
    const changed = structuredClone(version.schema)
    changed.steps.subscription!.title.fr = "Souscription"
    await saveFormVersionSchema(form.id, v2, { schema: changed }, 1)
    const diff = await diffFormVersions(form.id, v2, v1)
    expect(diff.changes).toEqual([{ op: "modified", path: "steps.subscription.title.fr", before: "Votre souscription", after: "Souscription" }])
    expect((await archiveFormVersion(form.id, v1)).status).toBe("archived")
  })
})

describe("propriétés", () => {
  it("liste les 19 propriétés système, en lecture seule", async () => {
    const { data } = await listProperties()
    expect(data).toHaveLength(19)
    expect(data.every((p) => p.isSystem)).toBe(true)
    await rejects(updateProperty(data[0]!.id, { label: { fr: "X" } }), 409, "system_property_read_only")
    await rejects(archiveProperty(data[0]!.id), 409, "system_property_read_only")
  })

  it("applique les règles de création de l'API", async () => {
    const base = { scope: "party" as const, label: { fr: "X" } }
    await rejects(createProperty({ ...base, key: "last_name", type: "text" }), 409, "property_key_taken")
    await rejects(createProperty({ ...base, key: "nature", type: "text" }), 422, "reserved_key")
    await rejects(createProperty({ ...base, key: "risk", type: "select" }), 422, "options_required")
    await rejects(createProperty({ ...base, key: "risk", type: "text", options: [{ value: "a", label: { fr: "A" } }] }), 422, "options_not_allowed")
    await rejects(createProperty({ ...base, key: "flag", type: "boolean", multiple: true }), 422, "multiple_not_allowed")
    await rejects(createProperty({ ...base, key: "k", type: "text", relationTypes: ["x"] }), 422, "relation_types_not_allowed")
    const p = await createProperty({ ...base, key: "risk_band", type: "select", options: [{ value: "low", label: { fr: "Faible" } }] })
    expect(p).toMatchObject({ isSystem: false, archivedAt: null, natures: [] })
    await archiveProperty(p.id)
    await rejects(updateProperty(p.id, { label: { fr: "Y" } }), 409, "property_archived")
    // Archivée, sa clé reste prise.
    await rejects(createProperty({ ...base, key: "risk_band", type: "text" }), 409, "property_key_taken")
    expect((await listProperties()).data.some((x) => x.key === "risk_band")).toBe(false)
    expect((await listProperties({ includeArchived: true })).data.some((x) => x.key === "risk_band")).toBe(true)
  })
})

describe("référentiels globaux", () => {
  it("types de pièces et modèles dans la langue de l'appelant", async () => {
    const fr = await listDocumentTypes()
    const en = await listDocumentTypes({ language: "en" })
    expect(fr.data).toHaveLength(11)
    expect(en.data.find((d) => d.code === "BANK_DETAILS")!.label).toBe("Bank account details")
    expect((await listDocumentTypes({ nature: "legal_person" })).data.map((d) => d.code)).not.toContain("PASSPORT")
    expect((await listFormTemplates({ language: "en" })).data.map((t) => t.name)).toEqual(["Insurance subscription", "Real estate acquisition"])
  })
})
