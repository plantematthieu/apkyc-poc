import type { LocalizedText, PartyNature } from "@/lib/dsl"

/**
 * Catalogue des types de pièces justificatives, recopié de la migration
 * 0002_seed_document_types.sql : global, en lecture seule (un seul GET dans l'API).
 */
export interface DocumentTypeRow {
  code: string
  label: LocalizedText
  allowedMimeTypes: string[]
  maxSizeBytes: number
  /** Fraîcheur exigée en jours depuis la date d'émission ; null = valable jusqu'à l'expiration portée sur la pièce. */
  validityDays: number | null
  twoSided: boolean
  /** Natures concernées ; vide = toutes. */
  applicableNatures: PartyNature[]
  archivedAt: string | null
}

const IMAGES_AND_PDF = ["application/pdf", "image/jpeg", "image/png"]
const PDF = ["application/pdf"]
const MB = 1024 * 1024

const row = (
  code: string,
  label: LocalizedText,
  allowedMimeTypes: string[],
  maxSizeBytes: number,
  validityDays: number | null,
  twoSided: boolean,
  applicableNatures: PartyNature[],
): DocumentTypeRow => ({ code, label, allowedMimeTypes, maxSizeBytes, validityDays, twoSided, applicableNatures, archivedAt: null })

export const DOCUMENT_TYPE_ROWS: DocumentTypeRow[] = [
  row("ID_CARD", { fr: "Carte nationale d'identité", en: "National identity card" }, IMAGES_AND_PDF, 10 * MB, null, true, ["natural_person"]),
  row("PASSPORT", { fr: "Passeport", en: "Passport" }, IMAGES_AND_PDF, 10 * MB, null, false, ["natural_person"]),
  row(
    "PROOF_OF_ADDRESS",
    { fr: "Justificatif de domicile de moins de 3 mois", en: "Proof of address less than 3 months old" },
    IMAGES_AND_PDF,
    10 * MB,
    90,
    false,
    ["natural_person"],
  ),
  row(
    "COMPANY_REGISTRATION_EXTRACT",
    { fr: "Extrait Kbis ou RNE de moins de 3 mois", en: "Company registration extract (Kbis or RNE) less than 3 months old" },
    IMAGES_AND_PDF,
    10 * MB,
    90,
    false,
    ["legal_person"],
  ),
  row("ARTICLES_OF_ASSOCIATION", { fr: "Statuts à jour", en: "Up-to-date articles of association" }, PDF, 20 * MB, null, false, [
    "legal_person",
    "legal_arrangement",
  ]),
  row("POWER_OF_ATTORNEY", { fr: "Pouvoirs du signataire", en: "Signatory's power of attorney" }, IMAGES_AND_PDF, 10 * MB, null, false, []),
  row("BENEFICIAL_OWNERS_REGISTER", { fr: "Registre des bénéficiaires effectifs", en: "Register of beneficial owners" }, PDF, 10 * MB, null, false, [
    "legal_person",
    "legal_arrangement",
  ]),
  row(
    "CERTIFIED_FINANCIAL_STATEMENTS",
    { fr: "Derniers comptes annuels certifiés", en: "Latest certified financial statements" },
    PDF,
    20 * MB,
    null,
    false,
    ["legal_person"],
  ),
  row("REGULATORY_LICENSE", { fr: "Agrément de l'autorité de tutelle", en: "Regulatory licence" }, PDF, 10 * MB, null, false, ["legal_person"]),
  row("PROSPECTUS", { fr: "Prospectus du fonds", en: "Fund prospectus" }, PDF, 20 * MB, null, false, ["legal_person", "legal_arrangement"]),
  row("BANK_DETAILS", { fr: "RIB", en: "Bank account details" }, IMAGES_AND_PDF, 10 * MB, null, false, []),
]
