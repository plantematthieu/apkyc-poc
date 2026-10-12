import type { Field, FormSchema, ItemField, JsonLogic, LocalizedText } from "@/lib/dsl"
import { uniqueKey } from "./factory"
import { fieldKeys, renameLogicRefs } from "./schema"

/** Blocs métier KYC prêts à glisser, bindés aux propriétés système. */
export interface Preset {
  id: string
  label: string
  description: string
  build: () => Field[]
}

const t = (fr: string, en: string): LocalizedText => ({ fr, en })

export const PRESETS: Preset[] = [
  {
    id: "natural_person_identity",
    label: "Identité personne physique",
    description: "Nom, prénoms, naissance, nationalités",
    build: () => [
      { key: "last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
      { key: "first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
      { key: "birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
      { key: "birth_place", type: "text", label: t("Lieu de naissance", "Birth place"), required: true, bind: "party.birth_place" },
      { key: "birth_country", type: "country", label: t("Pays de naissance", "Country of birth"), required: true, bind: "party.birth_country" },
      { key: "nationalities", type: "country", multiple: true, label: t("Nationalités", "Nationalities"), required: true, bind: "party.nationalities" },
    ],
  },
  {
    id: "address",
    label: "Adresse",
    description: "Adresse de résidence (rue, code postal, ville, pays)",
    build: () => [{ key: "home_address", type: "address", label: t("Adresse", "Address"), required: true, bind: "party.address" }],
  },
  {
    id: "contact",
    label: "Coordonnées",
    description: "E-mail et téléphone",
    build: () => [
      { key: "email", type: "email", label: t("Adresse e-mail", "Email address"), required: true, bind: "party.email" },
      { key: "phone", type: "phone", label: t("Téléphone", "Phone number"), bind: "party.phone" },
    ],
  },
  {
    id: "identity_documents",
    label: "Pièces d'identité",
    description: "Pièce d'identité et justificatif de domicile de moins de 3 mois",
    build: () => [
      {
        key: "id_document",
        type: "document",
        label: t("Pièce d'identité", "Identity document"),
        help: t("Carte d'identité (recto verso) ou passeport en cours de validité.", "Valid identity card (both sides) or passport."),
        required: true,
        documentTypes: ["ID_CARD", "PASSPORT"],
      },
      {
        key: "proof_of_address",
        type: "document",
        label: t("Justificatif de domicile", "Proof of address"),
        required: true,
        documentTypes: ["PROOF_OF_ADDRESS"],
      },
    ],
  },
  {
    id: "pep",
    label: "Personne politiquement exposée",
    description: "Question PPE et fonction exercée",
    build: () => [
      {
        key: "pep_notice",
        type: "info",
        content: t(
          "Une personne politiquement exposée (PPE) exerce ou a exercé une fonction publique importante, ou en est un proche. Son dossier fait l'objet de contrôles renforcés.",
          "A politically exposed person (PEP) holds or has held a prominent public function, or is close to such a person. Their file is subject to enhanced checks.",
        ),
      },
      {
        key: "is_pep",
        type: "boolean",
        label: t("Êtes-vous une personne politiquement exposée, ou un proche d'une telle personne ?", "Are you a politically exposed person, or close to one?"),
        required: true,
      },
      { key: "pep_position", type: "text", label: t("Fonction exercée", "Position held"), required: true, visibleIf: { "==": [{ var: "is_pep" }, true] } },
    ],
  },
  {
    id: "source_of_funds",
    label: "Origine des fonds",
    description: "Provenance de l'argent, avec précision si « Autre »",
    build: () => [
      {
        key: "funds_origin",
        type: "select",
        multiple: true,
        label: t("Origine des fonds", "Origin of funds"),
        required: true,
        options: [
          { value: "savings", label: t("Épargne", "Savings") },
          { value: "inheritance", label: t("Héritage ou donation", "Inheritance or gift") },
          { value: "property_sale", label: t("Vente d'un bien immobilier", "Sale of a property") },
          { value: "business_sale", label: t("Cession d'entreprise", "Sale of a business") },
          { value: "other", label: t("Autre", "Other") },
        ],
      },
      {
        key: "funds_origin_other",
        type: "text",
        label: t("Précisez", "Please specify"),
        required: true,
        visibleIf: { in: ["other", { var: "funds_origin" }] },
      },
    ],
  },
  {
    id: "company",
    label: "Société",
    description: "Dénomination, forme, SIREN, siège, Kbis",
    build: () => [
      { key: "company_name", type: "text", label: t("Dénomination", "Legal name"), required: true, bind: "party.company_name" },
      { key: "legal_form", type: "text", label: t("Forme juridique", "Legal form"), required: true, bind: "party.legal_form" },
      {
        key: "siren",
        type: "text",
        label: t("Numéro SIREN", "SIREN number"),
        help: t("9 chiffres.", "9 digits."),
        required: true,
        pattern: "^[0-9]{9}$",
        bind: "party.siren",
      },
      { key: "registered_address", type: "address", label: t("Adresse du siège", "Registered office address"), required: true, bind: "party.registered_address" },
      {
        key: "registration_country",
        type: "country",
        label: t("Pays d'immatriculation", "Country of registration"),
        required: true,
        bind: "party.registration_country",
      },
      {
        key: "company_extract",
        type: "document",
        label: t("Extrait Kbis de moins de 3 mois", "Company registration extract less than 3 months old"),
        required: true,
        documentTypes: ["COMPANY_REGISTRATION_EXTRACT"],
      },
    ],
  },
  {
    id: "beneficial_owners",
    label: "Bénéficiaires effectifs",
    description: "Une fiche par personne qui détient plus de 25 % ou contrôle la société",
    build: () => [
      {
        key: "beneficial_owners",
        type: "repeater",
        label: t("Bénéficiaires effectifs", "Beneficial owners"),
        help: t(
          "Personnes physiques qui détiennent plus de 25 % du capital ou des droits de vote, ou qui contrôlent la société.",
          "Individuals who hold more than 25% of the capital or voting rights, or who control the company.",
        ),
        min: 1,
        max: 4,
        bind: { relation: "beneficial_owner", nature: "natural_person" },
        fields: [
          { key: "bo_last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
          { key: "bo_first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
          { key: "bo_birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
          {
            key: "bo_capital_percentage",
            type: "number",
            label: t("Pourcentage du capital détenu", "Percentage of capital held"),
            required: true,
            min: 0,
            max: 100,
            bind: "relation.capital_percentage",
          },
          { key: "bo_id_document", type: "document", label: t("Pièce d'identité", "Identity document"), required: true, documentTypes: ["ID_CARD", "PASSPORT"] },
        ],
        validate: [
          {
            rule: { "<=": [{ sum: "bo_capital_percentage" }, 100] },
            message: t("Le total des pourcentages dépasse 100 %.", "The total percentage exceeds 100%."),
          },
        ],
      },
    ],
  },
  {
    id: "legal_representatives",
    label: "Représentants légaux",
    description: "Une fiche par représentant, avec sa fonction",
    build: () => [
      {
        key: "legal_representatives",
        type: "repeater",
        label: t("Représentants légaux", "Legal representatives"),
        min: 1,
        max: 3,
        bind: { relation: "legal_representative", nature: "natural_person" },
        fields: [
          { key: "lr_last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
          { key: "lr_first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
          { key: "lr_birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
          { key: "lr_role", type: "text", label: t("Fonction", "Position"), required: true, bind: "relation.role" },
          { key: "lr_id_document", type: "document", label: t("Pièce d'identité", "Identity document"), required: true, documentTypes: ["ID_CARD", "PASSPORT"] },
        ],
      },
    ],
  },
]

/**
 * Prépare un bloc métier pour l'insertion : les clés déjà prises dans le formulaire sont
 * renommées (_2, _3…) et les conditions du bloc suivent.
 */
export function instantiatePreset(preset: Preset, schema: FormSchema): Field[] {
  const fields = preset.build()
  const taken = fieldKeys(schema)
  const renames = new Map<string, string>()
  const claim = (f: Field | ItemField) => {
    const key = uniqueKey(f.key, taken)
    if (key !== f.key) renames.set(f.key, key)
    f.key = key
    taken.add(key)
  }
  for (const f of fields) {
    claim(f)
    if (f.type === "repeater") f.fields.forEach(claim)
  }
  if (renames.size === 0) return fields
  const fix = (logic: JsonLogic) => {
    let out: unknown = logic
    for (const [from, to] of renames) out = renameLogicRefs(out, from, to)
    return out as JsonLogic
  }
  const visit = (f: Field | ItemField) => {
    if (f.visibleIf) f.visibleIf = fix(f.visibleIf)
    if (f.type !== "info" && f.type !== "document") f.validate?.forEach((r) => (r.rule = fix(r.rule)))
    if (f.type === "repeater") f.fields.forEach(visit)
  }
  fields.forEach(visit)
  return fields
}
