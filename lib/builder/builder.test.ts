import { describe, expect, it } from "vitest"
import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import { createEmptySchema, validateSchema, type FormSchema } from "@/lib/dsl"
import { listProperties, toCatalog } from "@/lib/local-api"
import {
  describeLogic,
  fieldKeys,
  fromLogic,
  instantiatePreset,
  issueMessage,
  newField,
  PRESETS,
  renameLogicRefs,
  renameOptionRefs,
  schemaLanguages,
  slugify,
  toLogic,
  withOptionalText,
  withText,
  type UiGroup,
} from "./index"

const catalog = async () => toCatalog((await listProperties({ includeArchived: true })).data)

describe("modèles et blocs métier", () => {
  it("les modèles système passent validateSchema sans anomalie", async () => {
    const c = await catalog()
    for (const t of FORM_TEMPLATE_ROWS) expect(validateSchema(t.schema, c).issues).toEqual([])
  })

  it("chaque bloc métier passe validateSchema dans une étape vide", async () => {
    const c = await catalog()
    for (const p of PRESETS) {
      const schema: FormSchema = { start: "s", steps: { s: { title: { fr: "S", en: "S" }, fields: p.build(), next: [] } } }
      expect(validateSchema(schema, c).issues, p.id).toEqual([])
    }
  })

  it("renomme les clés déjà prises et les conditions du bloc suivent", () => {
    const schema = createEmptySchema()
    const pep = PRESETS.find((p) => p.id === "pep")!
    schema.steps.start!.fields.push(...instantiatePreset(pep, schema))
    const again = instantiatePreset(pep, schema)
    expect(again.map((f) => f.key)).toEqual(["pep_notice_2", "is_pep_2", "pep_position_2"])
    expect(again[2]!.visibleIf).toEqual({ "==": [{ var: "is_pep_2" }, true] })
  })

  it("une clé de champ neuve est unique sur tout le formulaire, items compris", () => {
    const schema = createEmptySchema()
    schema.steps.start!.fields.push(newField("repeater", schema))
    const text = newField("text", schema)
    expect(fieldKeys(schema).has(text.key)).toBe(false)
  })
})

describe("conditions en phrases ⇄ JSON Logic", () => {
  const cases: [string, unknown][] = [
    ["égalité", { "==": [{ var: "a" }, "x"] }],
    ["booléen", { "==": [{ var: "is_pep" }, true] }],
    ["liste", { in: [{ var: "financing" }, ["own_funds", "mixed"]] }],
    ["contient", { in: ["other", { var: "funds_origin" }] }],
    ["ne contient pas", { "!": { in: ["other", { var: "funds_origin" }] } }],
    ["renseigné", { "!": { missing: ["a"] } }],
    ["vide", { missing: ["a"] }],
    ["partie d'adresse", { "!=": [{ var: "home_address.country" }, "FR"] }],
    ["somme", { "<=": [{ sum: "share" }, 100] }],
    ["et / ou", { and: [{ "==": [{ var: "a" }, 1] }, { or: [{ ">": [{ var: "b" }, 2] }, { missing: ["c"] }] }] }],
  ]
  it.each(cases)("%s : aller-retour sans perte", (_, logic) => {
    const ui = fromLogic(logic as never)
    expect(ui).not.toBeNull()
    expect(toLogic(ui!)).toEqual(logic)
  })

  it("lit la forme tableau de « ! » (fixture du DSL)", () => {
    expect(fromLogic({ "!": [{ missing: ["bo_last_name"] }] })!.rules[0]).toMatchObject({ operator: "filled", field: "bo_last_name" })
  })

  it("une condition vide s'écrit {} (refusée à la publication : invalid_condition)", () => {
    const empty: UiGroup = { kind: "group", combinator: "and", rules: [] }
    expect(toLogic(empty)).toEqual({})
    expect(fromLogic({})).toEqual(empty)
  })

  it("une condition hors du sous-ensemble n'est pas éditable en phrases", () => {
    expect(fromLogic({ "+": [1, 2] })).toBeNull()
    expect(describeLogic({ "+": [1, 2] }, { label: (f) => f, value: (_, v) => String(v) })).toBe("condition JSON Logic")
  })

  it("décrit une condition", () => {
    const text = describeLogic(
      { and: [{ "==": [{ var: "a" }, "x"] }, { "!": { missing: ["b"] } }] },
      { label: (f) => f.toUpperCase(), value: (_, v) => `«${v}»` },
    )
    expect(text).toBe("A est «x» et B est renseigné")
  })
})

describe("références dans les conditions", () => {
  it("suit le renommage d'un champ (var, partie d'adresse, missing, sum)", () => {
    const logic = { and: [{ "==": [{ var: "addr.country" }, "FR"] }, { missing: ["addr"] }, { "<": [{ sum: "addr" }, 3] }] }
    expect(renameLogicRefs(logic, "addr", "home_address")).toEqual({
      and: [{ "==": [{ var: "home_address.country" }, "FR"] }, { missing: ["home_address"] }, { "<": [{ sum: "home_address" }, 3] }],
    })
  })

  it("suit le renommage d'une valeur d'option", () => {
    const logic = { or: [{ "==": [{ var: "mode" }, "seul"] }, { in: [{ var: "mode" }, ["seul", "societe"]] }, { "==": [{ var: "other" }, "seul"] }] }
    expect(renameOptionRefs(logic, "mode", new Map([["seul", "alone"]]))).toEqual({
      or: [{ "==": [{ var: "mode" }, "alone"] }, { in: [{ var: "mode" }, ["alone", "societe"]] }, { "==": [{ var: "other" }, "seul"] }],
    })
  })
})

describe("textes traduits", () => {
  it("garde le français, retire une traduction vidée", () => {
    expect(withText({ fr: "Nom", en: "Name" }, "en", "")).toEqual({ fr: "Nom" })
    expect(withText({ fr: "Nom" }, "de", "Name")).toEqual({ fr: "Nom", de: "Name" })
    expect(withOptionalText({ fr: "Aide" }, "fr", "")).toBeUndefined()
  })

  it("liste les langues du schéma", () => {
    expect(schemaLanguages(FORM_TEMPLATE_ROWS[0]!.schema)).toEqual(["fr", "en"])
    expect(schemaLanguages({ start: "s", steps: { s: { title: { fr: "S" }, fields: [], next: [] } } })).toEqual(["fr"])
  })
})

describe("divers", () => {
  it("slugify produit une clé du DSL", () => {
    expect(slugify("Prime annuelle (€)")).toBe("prime_annuelle")
    expect(slugify("2e adresse")).toBe("f_2e_adresse")
  })

  it("traduit les codes du rapport", () => {
    expect(issueMessage({ code: "dead_end_branch", severity: "error", path: "steps.a.next[0]", message: "" })).toMatch(/Sinon/)
    expect(issueMessage({ code: "missing_translation", severity: "warning", path: "x", message: "Missing translation: en" })).toBe(
      "Traduction manquante : Anglais.",
    )
  })
})
