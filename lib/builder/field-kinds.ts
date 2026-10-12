import type { FieldType, InputFieldType, PartyNature } from "@/lib/dsl"

/** Libellés des types du DSL dans le builder. */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texte",
  number: "Nombre",
  date: "Date",
  boolean: "Oui / Non",
  select: "Liste de choix",
  country: "Pays",
  email: "E-mail",
  phone: "Téléphone",
  address: "Adresse",
  document: "Pièce justificative",
  repeater: "Parties liées (repeater)",
  info: "Texte d'information",
}

export const INPUT_TYPE_HINTS: Record<InputFieldType, string> = {
  text: "Nom, ville, référence…",
  number: "Montant, pourcentage",
  date: "Naissance, signature…",
  boolean: "Question fermée",
  select: "Un choix dans une liste",
  country: "Code ISO du pays",
  email: "Adresse vérifiée",
  phone: "Format international",
  address: "Rue, code postal, ville, pays",
}

/** Éléments de la palette : un type du DSL, éventuellement multiple. */
export type PaletteKind = InputFieldType | "select_multiple" | "document" | "repeater" | "info"

export const PALETTE: Record<PaletteKind, { label: string; hint: string }> = {
  text: { label: "Texte", hint: INPUT_TYPE_HINTS.text },
  number: { label: "Nombre", hint: INPUT_TYPE_HINTS.number },
  date: { label: "Date", hint: INPUT_TYPE_HINTS.date },
  email: { label: "E-mail", hint: INPUT_TYPE_HINTS.email },
  phone: { label: "Téléphone", hint: INPUT_TYPE_HINTS.phone },
  country: { label: "Pays", hint: INPUT_TYPE_HINTS.country },
  address: { label: "Adresse", hint: INPUT_TYPE_HINTS.address },
  select: { label: "Choix unique", hint: "Une réponse dans une liste" },
  select_multiple: { label: "Choix multiples", hint: "Plusieurs réponses (select multiple)" },
  boolean: { label: "Oui / Non", hint: INPUT_TYPE_HINTS.boolean },
  document: { label: "Pièce justificative", hint: "Document à déposer" },
  repeater: { label: "Parties liées", hint: "Une fiche par personne (repeater)" },
  info: { label: "Texte d'information", hint: "Message affiché au client" },
}

export const PALETTE_GROUPS: { title: string; kinds: PaletteKind[] }[] = [
  { title: "Saisie", kinds: ["text", "number", "date", "email", "phone", "country", "address"] },
  { title: "Choix", kinds: ["select", "select_multiple", "boolean"] },
  { title: "Pièces et structure", kinds: ["document", "repeater", "info"] },
]

export const NATURES: Record<PartyNature, { label: string; short: string }> = {
  natural_person: { label: "Personne physique", short: "PP" },
  legal_person: { label: "Personne morale", short: "PM" },
  legal_arrangement: { label: "Construction juridique (indivision, fiducie)", short: "Construction" },
}

export const NATURE_LIST: PartyNature[] = ["natural_person", "legal_person", "legal_arrangement"]

/** Types de relation courants (texte libre en snake_case dans le DSL). */
export const RELATION_SUGGESTIONS: { value: string; label: string }[] = [
  { value: "beneficial_owner", label: "Bénéficiaire effectif" },
  { value: "legal_representative", label: "Représentant légal" },
  { value: "co_owner", label: "Indivisaire" },
  { value: "signatory", label: "Signataire" },
  { value: "partner", label: "Associé" },
  { value: "co_holder", label: "Co-titulaire" },
]

export const relationLabel = (value: string) => RELATION_SUGGESTIONS.find((r) => r.value === value)?.label ?? value
