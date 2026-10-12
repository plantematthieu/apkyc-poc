import { isProblem } from "@/lib/local-api"

/** Message français pour une erreur de l'API locale (codes stables de l'API). */
export function problemMessage(e: unknown): string {
  if (!isProblem(e)) return (e as Error)?.message ?? "Erreur inattendue."
  switch (e.code) {
    case "property_key_taken":
      return "Cette clé est déjà utilisée pour ce scope (propriété du tenant, même archivée, ou propriété système)."
    case "reserved_key":
      return "La clé « nature » est réservée : party.nature cible la nature figée de la partie."
    case "invalid_key":
      return "Clé : minuscules, chiffres et _, en commençant par une lettre."
    case "options_required":
      return "Une propriété « liste de choix » a besoin d'au moins un choix."
    case "duplicate_option_value":
      return "Deux choix ont la même valeur."
    case "invalid_option_value":
      return "Valeur de choix invalide : minuscules, chiffres et _."
    case "multiple_not_allowed":
      return "Une propriété oui / non ne peut pas avoir plusieurs valeurs."
    case "invalid_localized_text":
      return "Le libellé français est obligatoire ; une traduction ne peut pas être vide."
    case "system_property_read_only":
      return "Propriété système : en lecture seule."
    case "property_archived":
      return "Propriété archivée : elle ne se modifie plus."
    case "revision_mismatch":
      return "Le brouillon a été modifié ailleurs (autre onglet) : rechargez-le."
    case "draft_exists":
      return "Ce formulaire a déjà un brouillon ouvert."
    case "version_not_draft":
      return "Cette version est figée."
    case "publication_checks_failed":
      return "Les contrôles de publication ont relevé des erreurs."
    case "form_archived":
      return "Ce formulaire est archivé."
    default:
      return `${e.detail} (${e.code})`
  }
}
