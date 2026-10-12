import { describe, expect, it } from "vitest"
import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import { listDocumentTypes, listProperties } from "@/lib/local-api"
import {
  collectData,
  computePath,
  createContext,
  evaluate,
  evaluateRepeaterRule,
  nextStep,
  planToSql,
  planWrites,
  requiredDocuments,
  validateStep,
  type PreviewDocument,
} from "./index"

const insurance = FORM_TEMPLATE_ROWS[0]!.schema
const acquisition = FORM_TEMPLATE_ROWS[1]!.schema

async function context(documents: PreviewDocument[] = [], locale = "fr") {
  const [{ data: properties }, { data: documentTypes }] = await Promise.all([listProperties(), listDocumentTypes()])
  return { properties, documentTypes, ctx: createContext(properties, documentTypes, documents, locale) }
}

const doc = (fieldPath: string, documentTypeCode: string, face: PreviewDocument["face"] = "single"): PreviewDocument => ({
  id: `${fieldPath}-${face}`,
  fieldPath,
  documentTypeCode,
  face,
  originalFilename: "f.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
})

describe("conditions (json-logic-js)", () => {
  it("évalue comme le portail", () => {
    expect(evaluate(undefined, {})).toBe(true)
    expect(evaluate({}, {})).toBe(false)
    expect(evaluate({ "==": [{ var: "is_pep" }, true] }, { is_pep: true })).toBe(true)
    expect(evaluate({ in: ["other", { var: "funds_origin" }] }, { funds_origin: ["savings", "other"] })).toBe(true)
    expect(evaluate({ "!=": [{ var: "home_address.country" }, "FR"] }, { home_address: { country: "BE" } })).toBe(true)
    expect(evaluate({ "!": { missing: ["a"] } }, { a: 0 })).toBe(true)
  })

  it("sum agrège un champ des items", () => {
    const rule = { "==": [{ sum: "share" }, 100] }
    expect(evaluateRepeaterRule(rule, {}, [{ share: 60 }, { share: 40 }])).toBe(true)
    expect(evaluateRepeaterRule(rule, {}, [{ share: 60 }, {}])).toBe(false)
  })
})

describe("navigation", () => {
  it("suit les branches dans l'ordre, la dernière sans condition", () => {
    expect(nextStep(acquisition, "operation", { acquisition_mode: "legal_arrangement" })).toBe("co_owners_step")
    expect(nextStep(acquisition, "operation", { acquisition_mode: "legal_person" })).toBe("buyer_company")
    expect(nextStep(acquisition, "operation", { acquisition_mode: "natural_person" })).toBe("buyer")
    expect(nextStep(acquisition, "declarations", {})).toBeNull()
  })

  it("computePath s'arrête à la première étape incomplète", async () => {
    const { ctx } = await context()
    const r = computePath(insurance, { product: "life_insurance", annual_premium: 100, subscriber_type: "natural_person" }, ctx)
    expect(r).toEqual({ path: ["subscription", "identity"], current: "identity", complete: false, deadEnd: false })
  })
})

describe("validateStep", () => {
  it("contrôle obligatoire, type, format, bornes, sans les champs masqués", async () => {
    const { ctx } = await context()
    const errors = validateStep(acquisition, "operation", { price: 500, acquisition_mode: "natural_person", financing: "bank_loan" }, ctx)
    expect(errors).toEqual([{ fieldPath: "price", code: "min", message: expect.stringMatching(/minimale/) }])
    const hidden = validateStep(acquisition, "operation", { price: 5000, acquisition_mode: "natural_person", financing: "mixed" }, ctx)
    expect(hidden.map((e) => e.fieldPath)).toEqual(["own_funds_origin"])
  })

  it("repeater : nombre d'items, champs d'item, règle de somme", async () => {
    const { ctx } = await context()
    const item = (share: number) => ({ co_last_name: "A", co_first_names: ["B"], co_birth_date: "1980-01-01", co_tax_residence_country: "FR", co_share_percentage: share })
    expect(validateStep(acquisition, "co_owners_step", { co_owners: [item(100)] }, ctx).map((e) => e.code)).toContain("min_items")
    const sum = validateStep(acquisition, "co_owners_step", { co_owners: [item(60), item(30)] }, ctx)
    expect(sum.map((e) => [e.fieldPath, e.code])).toEqual([
      ["co_owners[0].co_id_document", "document_required"],
      ["co_owners[1].co_id_document", "document_required"],
    ])
    const { ctx: withDocs } = await context([doc("co_owners[0].co_id_document", "PASSPORT"), doc("co_owners[1].co_id_document", "PASSPORT")])
    expect(validateStep(acquisition, "co_owners_step", { co_owners: [item(60), item(30)] }, withDocs)).toEqual([
      { fieldPath: "co_owners", code: "validate", message: "Le total des quotes-parts doit faire 100 %." },
    ])
  })

  it("une carte d'identité exige le recto et le verso", async () => {
    const { ctx } = await context([doc("id_document", "ID_CARD", "front")])
    const errors = validateStep(insurance, "identity_documents", {}, ctx)
    expect(errors[0]).toMatchObject({ fieldPath: "id_document", code: "document_face_missing" })
  })

  it("messages dans la langue du client, règles validate comprises", async () => {
    const { ctx } = await context([], "en")
    expect(validateStep(insurance, "declarations", { certification: false }, ctx)[0]!.message).toBe("You must certify that the information is accurate.")
  })
})

describe("dossier et projection", () => {
  const raw = {
    price: 300000,
    acquisition_mode: "legal_person",
    financing: "bank_loan",
    own_funds_origin: "branche abandonnée",
    company_name: "ACME",
    legal_form: "SAS",
    siren: "123456789",
    registered_address: { line1: "1 rue", postalCode: "56000", city: "Vannes", country: "FR" },
    beneficial_owners: [{ bo_last_name: "Martin", bo_first_names: ["Claire"], bo_birth_date: "1975-02-01", bo_nationalities: ["BE"], bo_capital_percentage: 60 }],
    certification: true,
  }
  const path = ["operation", "buyer_company", "declarations"]

  it("ne garde que le chemin suivi et les champs visibles", () => {
    const data = collectData(acquisition, path, raw)
    expect(data).not.toHaveProperty("own_funds_origin")
    expect(data.beneficial_owners).toHaveLength(1)
  })

  it("pièces exigées sur le chemin", async () => {
    const { ctx } = await context([doc("company_extract", "COMPANY_REGISTRATION_EXTRACT")])
    expect(requiredDocuments(acquisition, path, collectData(acquisition, path, raw), ctx)).toEqual([
      { fieldPath: "company_extract", acceptedDocumentTypes: ["COMPANY_REGISTRATION_EXTRACT"], faces: ["single"], status: "provided", documentIds: ["company_extract-single"] },
    ])
  })

  it("écrit la partie principale, les parties liées et leurs relations", async () => {
    const { properties, documentTypes } = await context()
    const plan = planWrites({
      schema: acquisition,
      formName: "Acquisition",
      versionNumber: 1,
      path,
      data: collectData(acquisition, path, raw),
      documents: [doc("company_extract", "COMPANY_REGISTRATION_EXTRACT")],
      properties,
      documentTypes: new Map(documentTypes.map((d) => [d.code, d])),
      externalRef: { system: "crm", externalId: "1" },
    })
    const approve = plan.phases.find((p) => p.id === "approve")!.rows
    const parties = approve.filter((r) => r.table === "parties")
    expect(parties.map((r) => [r.values.nature, r.values.display_name])).toEqual([
      ["legal_person", "ACME"],
      ["natural_person", "MARTIN Claire"],
    ])
    expect(parties[0]!.values.properties).toEqual({ company_name: "ACME", legal_form: "SAS", siren: "123456789", registered_address: raw.registered_address })
    const relation = approve.find((r) => r.table === "party_relations")!
    expect(relation.values).toMatchObject({ type: "beneficial_owner", properties: { capital_percentage: 60 } })
    expect(approve.some((r) => r.table === "party_external_refs")).toBe(true)
    expect(plan.stays.map((s) => s.path)).toEqual(["price", "financing", "certification"])
    expect(planToSql(plan)).toContain("INSERT INTO party_relations")
  })
})
