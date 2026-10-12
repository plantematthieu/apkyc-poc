import type { Field, FormSchema, JsonLogic, LocalizedText, PartyNature, SelectOption } from "@/lib/dsl"

/**
 * Modèles de parcours système (table form_templates) : communs à tous les tenants, en lecture
 * seule. Le schéma est copié dans le premier brouillon d'un formulaire créé à partir du modèle.
 * Ils ne se bindent qu'aux propriétés système.
 */
export interface FormTemplateRow {
  id: string
  name: LocalizedText
  description: LocalizedText | null
  natures: PartyNature[]
  schema: FormSchema
  dslVersion: number
  archivedAt: string | null
}

const t = (fr: string, en: string): LocalizedText => ({ fr, en })
const opt = (value: string, fr: string, en: string): SelectOption => ({ value, label: t(fr, en) })
const v = (key: string) => ({ var: key })
const eq = (key: string, value: unknown): JsonLogic => ({ "==": [v(key), value] })

// ---------------------------------------------------------------- Blocs communs

const naturalPersonIdentity = (): Field[] => [
  { key: "last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
  { key: "first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
  { key: "birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
  { key: "birth_place", type: "text", label: t("Lieu de naissance", "Birth place"), required: true, bind: "party.birth_place" },
  { key: "nationalities", type: "country", multiple: true, label: t("Nationalités", "Nationalities"), required: true, bind: "party.nationalities" },
]

const pep = (): Field[] => [
  {
    key: "pep_notice",
    type: "info",
    content: t(
      "Une personne politiquement exposée (PPE) exerce ou a exercé une fonction publique importante (élu, magistrat, dirigeant d'entreprise publique…), ou en est un proche. Son dossier fait l'objet de contrôles renforcés.",
      "A politically exposed person (PEP) holds or has held a prominent public function (elected official, judge, head of a state-owned company…), or is a close relative or associate of such a person. Their file is subject to enhanced checks.",
    ),
  },
  {
    key: "is_pep",
    type: "boolean",
    label: t(
      "Êtes-vous une personne politiquement exposée, ou un proche d'une telle personne ?",
      "Are you a politically exposed person, or a relative or close associate of one?",
    ),
    required: true,
  },
  {
    key: "pep_position",
    type: "text",
    label: t("Fonction exercée", "Position held"),
    required: true,
    visibleIf: eq("is_pep", true),
  },
]

const declarations = (): Field[] => [
  {
    key: "data_notice",
    type: "info",
    content: t(
      "Ces informations servent aux obligations de lutte contre le blanchiment et le financement du terrorisme. Elles sont conservées 5 ans après la fin de la relation.",
      "This information is used for anti-money laundering and counter-terrorist financing obligations. It is kept for 5 years after the end of the relationship.",
    ),
  },
  {
    key: "certification",
    type: "boolean",
    label: t("Je certifie l'exactitude des informations fournies", "I certify that the information provided is accurate"),
    required: true,
    validate: [
      {
        rule: eq("certification", true),
        message: t("Vous devez certifier l'exactitude des informations.", "You must certify that the information is accurate."),
      },
    ],
  },
]

const companyFields = (): Field[] => [
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
    key: "company_extract",
    type: "document",
    label: t("Extrait Kbis de moins de 3 mois", "Company registration extract less than 3 months old"),
    required: true,
    documentTypes: ["COMPANY_REGISTRATION_EXTRACT"],
  },
]

const beneficialOwners = (): Field => ({
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
    { key: "bo_nationalities", type: "country", multiple: true, label: t("Nationalités", "Nationalities"), required: true, bind: "party.nationalities" },
    {
      key: "bo_capital_percentage",
      type: "number",
      label: t("Pourcentage du capital détenu", "Percentage of capital held"),
      required: true,
      min: 0,
      max: 100,
      bind: "relation.capital_percentage",
    },
  ],
  validate: [
    {
      rule: { "<=": [{ sum: "bo_capital_percentage" }, 100] },
      message: t("Le total des pourcentages dépasse 100 %.", "The total percentage exceeds 100%."),
    },
  ],
})

// ---------------------------------------------------------------- Souscription assurance

function insuranceSubscription(): FormSchema {
  return {
    start: "subscription",
    steps: {
      subscription: {
        title: t("Votre souscription", "Your subscription"),
        description: t("Le contrat souscrit et qui le souscrit.", "The contract and who subscribes to it."),
        fields: [
          {
            key: "product",
            type: "select",
            label: t("Contrat souscrit", "Contract"),
            required: true,
            options: [
              opt("life_insurance", "Assurance vie", "Life insurance"),
              opt("protection", "Prévoyance", "Protection insurance"),
              opt("multi_risk", "Multirisque", "Multi-risk insurance"),
            ],
          },
          { key: "annual_premium", type: "number", label: t("Prime annuelle (€)", "Annual premium (€)"), required: true, min: 1 },
          {
            key: "subscriber_type",
            type: "select",
            label: t("Vous souscrivez en tant que", "You are subscribing as"),
            required: true,
            bind: "party.nature",
            options: [opt("natural_person", "Particulier", "An individual"), opt("legal_person", "Société", "A company")],
          },
        ],
        next: [{ if: eq("subscriber_type", "legal_person"), goto: "company" }, { goto: "identity" }],
      },
      identity: {
        title: t("Identité", "Identity"),
        description: t("La personne qui souscrit le contrat.", "The person subscribing to the contract."),
        fields: [
          ...naturalPersonIdentity(),
          { key: "profession", type: "text", label: t("Profession", "Occupation"), required: true, bind: "party.profession" },
          { key: "home_address", type: "address", label: t("Adresse", "Address"), required: true, bind: "party.address" },
          { key: "email", type: "email", label: t("Adresse e-mail", "Email address"), required: true, bind: "party.email" },
          { key: "phone", type: "phone", label: t("Téléphone", "Phone number"), bind: "party.phone" },
        ],
        next: [{ goto: "pep" }],
      },
      pep: {
        title: t("Exposition politique", "Political exposure"),
        fields: pep(),
        next: [{ goto: "identity_documents" }],
      },
      identity_documents: {
        title: t("Pièces justificatives", "Supporting documents"),
        fields: [
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
            help: t("Facture ou avis d'imposition de moins de 3 mois.", "Utility bill or tax notice less than 3 months old."),
            required: true,
            documentTypes: ["PROOF_OF_ADDRESS"],
          },
        ],
        next: [{ goto: "declarations" }],
      },
      company: {
        title: t("Société", "Company"),
        description: t("La société qui souscrit le contrat.", "The company subscribing to the contract."),
        fields: [
          ...companyFields(),
          {
            key: "articles_of_association",
            type: "document",
            label: t("Statuts à jour", "Up-to-date articles of association"),
            required: true,
            documentTypes: ["ARTICLES_OF_ASSOCIATION"],
          },
        ],
        next: [{ goto: "representatives" }],
      },
      representatives: {
        title: t("Représentants légaux", "Legal representatives"),
        description: t("Les personnes qui signent au nom de la société.", "The people who sign on behalf of the company."),
        fields: [
          {
            key: "legal_representatives",
            type: "repeater",
            label: t("Représentants légaux", "Legal representatives"),
            help: t("Gérant, président ou directeur général.", "Manager, chairman or chief executive."),
            min: 1,
            max: 2,
            bind: { relation: "legal_representative", nature: "natural_person" },
            fields: [
              { key: "lr_last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
              { key: "lr_first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
              { key: "lr_birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
              { key: "lr_role", type: "text", label: t("Fonction", "Position"), required: true, bind: "relation.role" },
              {
                key: "lr_is_pep",
                type: "boolean",
                label: t("Personne politiquement exposée ?", "Politically exposed person?"),
                required: true,
              },
              {
                key: "lr_id_document",
                type: "document",
                label: t("Pièce d'identité", "Identity document"),
                required: true,
                documentTypes: ["ID_CARD", "PASSPORT"],
              },
            ],
          },
        ],
        next: [{ goto: "beneficial_owners_step" }],
      },
      beneficial_owners_step: {
        title: t("Bénéficiaires effectifs", "Beneficial owners"),
        fields: [beneficialOwners()],
        next: [{ goto: "declarations" }],
      },
      declarations: {
        title: t("Déclarations", "Declarations"),
        fields: declarations(),
        next: [],
      },
    },
  }
}

// ---------------------------------------------------------------- Acquisition immobilière

function realEstateAcquisition(): FormSchema {
  return {
    start: "operation",
    steps: {
      operation: {
        title: t("L'opération", "The transaction"),
        description: t("Le bien, qui l'achète et son financement.", "The property, who buys it and how it is financed."),
        fields: [
          { key: "price", type: "number", label: t("Prix d'acquisition (€)", "Purchase price (€)"), required: true, min: 1000 },
          {
            key: "acquisition_mode",
            type: "select",
            label: t("Vous achetez", "You are buying"),
            required: true,
            bind: "party.nature",
            options: [
              opt("natural_person", "Seul", "On your own"),
              opt("legal_arrangement", "En indivision", "In joint ownership"),
              opt("legal_person", "Via une société", "Through a company"),
            ],
          },
          {
            key: "financing",
            type: "select",
            label: t("Financement", "Financing"),
            required: true,
            options: [
              opt("bank_loan", "Prêt bancaire", "Bank loan"),
              opt("own_funds", "Apport personnel", "Own funds"),
              opt("mixed", "Mixte", "Mixed"),
            ],
          },
          {
            key: "own_funds_origin",
            type: "text",
            label: t("Origine des fonds apportés", "Origin of the funds provided"),
            help: t("Épargne, héritage, vente d'un bien…", "Savings, inheritance, sale of a property…"),
            required: true,
            visibleIf: { in: [v("financing"), ["own_funds", "mixed"]] },
          },
        ],
        next: [
          { if: eq("acquisition_mode", "legal_arrangement"), goto: "co_owners_step" },
          { if: eq("acquisition_mode", "legal_person"), goto: "buyer_company" },
          { goto: "buyer" },
        ],
      },
      buyer: {
        title: t("Acquéreur", "Buyer"),
        description: t("Identité de la personne qui achète.", "Identity of the person buying."),
        fields: [
          ...naturalPersonIdentity(),
          { key: "home_address", type: "address", label: t("Adresse", "Address"), required: true, bind: "party.address" },
          { key: "email", type: "email", label: t("Adresse e-mail", "Email address"), required: true, bind: "party.email" },
        ],
        next: [{ goto: "pep" }],
      },
      pep: {
        title: t("Exposition politique", "Political exposure"),
        fields: pep(),
        next: [{ goto: "buyer_documents" }],
      },
      buyer_documents: {
        title: t("Pièces justificatives", "Supporting documents"),
        fields: [
          {
            key: "id_document",
            type: "document",
            label: t("Pièce d'identité", "Identity document"),
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
          {
            key: "funds_notice",
            type: "info",
            visibleIf: { ">": [v("price"), 150000] },
            content: t(
              "Au-delà de 150 000 €, votre conseiller vous demandera un justificatif de l'origine des fonds (seuil d'exemple).",
              "Above €150,000, your adviser will ask you for proof of the origin of funds (example threshold).",
            ),
          },
        ],
        next: [{ goto: "declarations" }],
      },
      co_owners_step: {
        title: t("Indivisaires", "Joint owners"),
        description: t("Une fiche par indivisaire.", "One entry per joint owner."),
        fields: [
          {
            key: "co_owners",
            type: "repeater",
            label: t("Indivisaires", "Joint owners"),
            min: 2,
            max: 10,
            bind: { relation: "co_owner", nature: "natural_person" },
            fields: [
              { key: "co_last_name", type: "text", label: t("Nom", "Last name"), required: true, bind: "party.last_name" },
              { key: "co_first_names", type: "text", multiple: true, label: t("Prénoms", "First names"), required: true, bind: "party.first_names" },
              { key: "co_birth_date", type: "date", label: t("Date de naissance", "Birth date"), required: true, bind: "party.birth_date" },
              {
                key: "co_tax_residence_country",
                type: "country",
                label: t("Pays de résidence fiscale", "Country of tax residence"),
                required: true,
                bind: "party.tax_residence_country",
              },
              { key: "co_share_percentage", type: "number", label: t("Quote-part (%)", "Share (%)"), required: true, min: 1, max: 100 },
              {
                key: "co_id_document",
                type: "document",
                label: t("Pièce d'identité", "Identity document"),
                required: true,
                documentTypes: ["ID_CARD", "PASSPORT"],
              },
            ],
            validate: [
              {
                rule: { "==": [{ sum: "co_share_percentage" }, 100] },
                message: t("Le total des quotes-parts doit faire 100 %.", "The shares must add up to 100%."),
              },
            ],
          },
        ],
        next: [{ goto: "declarations" }],
      },
      buyer_company: {
        title: t("Société acquéreuse", "Buying company"),
        description: t("La société et ses bénéficiaires effectifs.", "The company and its beneficial owners."),
        fields: [...companyFields(), beneficialOwners()],
        next: [{ goto: "declarations" }],
      },
      declarations: {
        title: t("Déclarations", "Declarations"),
        fields: declarations(),
        next: [],
      },
    },
  }
}

export const FORM_TEMPLATE_ROWS: FormTemplateRow[] = [
  {
    id: "6f1d6c1e-2b7a-4c55-9a43-1f0d2a3b4c01",
    name: t("Souscription assurance", "Insurance subscription"),
    description: t(
      "Personne physique ou société avec ses représentants et bénéficiaires effectifs. Champs reliés aux propriétés système.",
      "Individual or company with its representatives and beneficial owners. Fields bound to system properties.",
    ),
    natures: ["natural_person", "legal_person"],
    schema: insuranceSubscription(),
    dslVersion: 1,
    archivedAt: null,
  },
  {
    id: "6f1d6c1e-2b7a-4c55-9a43-1f0d2a3b4c02",
    name: t("Acquisition immobilière", "Real estate acquisition"),
    description: t(
      "Acheteur seul, indivision ou société : trois branches selon la nature de l'acquéreur.",
      "Single buyer, joint ownership or company: three branches depending on the buyer's nature.",
    ),
    natures: [],
    schema: realEstateAcquisition(),
    dslVersion: 1,
    archivedAt: null,
  },
]
