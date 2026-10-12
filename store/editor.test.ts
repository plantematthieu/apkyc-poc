import { beforeEach, describe, expect, it } from "vitest"
import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import type { FormDefinition, FormVersion } from "@/lib/local-api"
import { useEditor } from "./editor"

const form: FormDefinition = {
  id: "f",
  name: { fr: "F" },
  templateId: null,
  latestPublishedVersionId: null,
  draftVersionId: "v",
  archivedAt: null,
  createdAt: "",
  updatedAt: "",
}
const version = (status: FormVersion["status"] = "draft"): FormVersion => ({
  id: "v",
  formId: "f",
  number: 1,
  status,
  dslVersion: 1,
  revision: 1,
  hash: null,
  createdBy: "u",
  publishedBy: null,
  publishedAt: null,
  archivedAt: null,
  createdAt: "",
  updatedAt: "",
  schema: structuredClone(FORM_TEMPLATE_ROWS[1]!.schema),
})

const ed = () => useEditor.getState()

beforeEach(() => ed().load(form, version()))

describe("éditeur", () => {
  it("renommer un champ met à jour les conditions qui le lisent", () => {
    expect(ed().renameField("financing", "funding")).toBe(true)
    const op = ed().schema.steps.operation!
    expect(op.fields.find((f) => f.key === "own_funds_origin")!.visibleIf).toEqual({ in: [{ var: "funding" }, ["own_funds", "mixed"]] })
    expect(ed().renameField("funding", "price")).toBe(false)
    expect(ed().renameField("funding", "9bad")).toBe(false)
  })

  it("renommer une étape met à jour start et les branches", () => {
    expect(ed().renameStep("operation", "transaction")).toBe(true)
    expect(ed().schema.start).toBe("transaction")
    expect(Object.keys(ed().schema.steps)[0]).toBe("transaction")
    expect(ed().renameStep("buyer", "declarations")).toBe(false)
  })

  it("une nouvelle branche conditionnelle passe avant la branche « Sinon »", () => {
    ed().addTransition("buyer", "declarations", { "==": [{ var: "price" }, 1] })
    expect(ed().schema.steps.buyer!.next).toEqual([{ if: { "==": [{ var: "price" }, 1] }, goto: "declarations" }, { goto: "pep" }])
    expect(ed().selection).toEqual({ kind: "transition", from: "buyer", index: 0 })
  })

  it("« Sinon » retire la condition et place la branche en dernier", () => {
    ed().updateTransition("operation", 2, (t) => void (t.if = { missing: ["price"] }))
    ed().setFallback("operation", 0, true)
    const next = ed().schema.steps.operation!.next
    expect(next[2]).toEqual({ goto: "co_owners_step" })
  })

  it("supprimer une étape retire les branches qui y mènent", () => {
    ed().removeStep("pep")
    expect(ed().schema.steps.buyer!.next).toEqual([])
  })

  it("dupliquer un repeater renomme ses clés et ses règles", () => {
    ed().duplicateField("co_owners")
    const fields = ed().schema.steps.co_owners_step!.fields
    expect(fields[1]!.key).toBe("co_owners_copy")
    const copy = fields[1]!
    if (copy.type !== "repeater") throw new Error()
    expect(copy.fields.map((f) => f.key)).toContain("co_share_percentage_copy")
    expect(copy.validate![0]!.rule).toEqual({ "==": [{ sum: "co_share_percentage_copy" }, 100] })
  })

  it("une version publiée est figée", () => {
    ed().load(form, version("published"))
    const before = ed().schema
    ed().removeField("price")
    ed().addStep({ x: 0, y: 0 })
    expect(ed().schema).toBe(before)
    ed().moveStep("operation", { x: 5, y: 5 })
    expect(ed().positions.operation).toEqual({ x: 5, y: 5 })
  })
})
