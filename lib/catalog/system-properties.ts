import type { InputFieldType, LocalizedText, PartyNature } from "@/lib/dsl"

/**
 * Propriétés système, recopiées de la migration 0007_seed_properties.sql : communes à tous
 * les tenants, en lecture seule, cibles du bind des modèles de formulaire.
 */
export interface SystemPropertyRow {
  scope: "party" | "relation"
  key: string
  type: InputFieldType
  multiple: boolean
  label: LocalizedText
  natures: PartyNature[]
  relationTypes: string[]
}

const PP: PartyNature[] = ["natural_person"]
const PM_ARR: PartyNature[] = ["legal_person", "legal_arrangement"]

const party = (key: string, type: InputFieldType, multiple: boolean, label: LocalizedText, natures: PartyNature[]): SystemPropertyRow => ({
  scope: "party",
  key,
  type,
  multiple,
  label,
  natures,
  relationTypes: [],
})

const relation = (key: string, type: InputFieldType, label: LocalizedText, relationTypes: string[]): SystemPropertyRow => ({
  scope: "relation",
  key,
  type,
  multiple: false,
  label,
  natures: [],
  relationTypes,
})

export const SYSTEM_PROPERTY_ROWS: SystemPropertyRow[] = [
  // Partie, personne physique
  party("last_name", "text", false, { fr: "Nom", en: "Last name" }, PP),
  party("first_names", "text", true, { fr: "Prénoms", en: "First names" }, PP),
  party("birth_date", "date", false, { fr: "Date de naissance", en: "Birth date" }, PP),
  party("birth_place", "text", false, { fr: "Lieu de naissance", en: "Birth place" }, PP),
  party("birth_country", "country", false, { fr: "Pays de naissance", en: "Country of birth" }, PP),
  party("nationalities", "country", true, { fr: "Nationalités", en: "Nationalities" }, PP),
  party("address", "address", false, { fr: "Adresse", en: "Address" }, PP),
  party("email", "email", false, { fr: "Adresse e-mail", en: "Email address" }, PP),
  party("phone", "phone", false, { fr: "Téléphone", en: "Phone number" }, PP),
  party("profession", "text", false, { fr: "Profession", en: "Occupation" }, PP),
  party("tax_residence_country", "country", false, { fr: "Pays de résidence fiscale", en: "Country of tax residence" }, PP),
  // Partie, personne morale ou construction juridique
  party("company_name", "text", false, { fr: "Dénomination", en: "Legal name" }, PM_ARR),
  party("legal_form", "text", false, { fr: "Forme juridique", en: "Legal form" }, PM_ARR),
  party("siren", "text", false, { fr: "Numéro SIREN", en: "SIREN number" }, ["legal_person"]),
  party("registered_address", "address", false, { fr: "Adresse du siège", en: "Registered office address" }, PM_ARR),
  party("registration_country", "country", false, { fr: "Pays d'immatriculation", en: "Country of registration" }, PM_ARR),
  // Relation
  relation("capital_percentage", "number", { fr: "Pourcentage du capital détenu", en: "Percentage of capital held" }, ["beneficial_owner"]),
  relation("voting_rights_percentage", "number", { fr: "Pourcentage des droits de vote", en: "Percentage of voting rights" }, ["beneficial_owner"]),
  relation("role", "text", { fr: "Fonction", en: "Position" }, ["legal_representative"]),
]
