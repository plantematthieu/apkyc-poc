import type { FormSchema, ValidationIssue } from "@/lib/dsl"
import { languageName, show } from "./text"
import { locateField } from "./schema"

/**
 * Rapport de validateSchema (le même que renverra POST …/validate) lu dans le builder :
 * emplacement de l'anomalie et message en français. Les messages du moteur restent en
 * anglais (ils sortent de l'API) ; ils servent de repli.
 */

export interface IssueLocation {
  stepKey?: string
  fieldKey?: string
  transition?: { from: string; index: number }
}

export function locateIssue(issue: ValidationIssue): IssueLocation {
  const fieldKey = issue.fieldPath?.split(".").pop()
  const m = /^steps\.([a-z0-9_]+)\.next\[(\d+)\]/.exec(issue.path)
  return {
    stepKey: issue.stepKey ?? m?.[1],
    fieldKey,
    transition: m && !fieldKey ? { from: m[1]!, index: Number(m[2]) } : undefined,
  }
}

/** Contenu des `…` du message anglais : propriété, valeur, langue… */
const quoted = (message: string) => [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1]!)

const TYPE_FR: Record<string, string> = {
  text: "texte",
  number: "nombre",
  date: "date",
  boolean: "oui / non",
  select: "liste de choix",
  country: "pays",
  email: "e-mail",
  phone: "téléphone",
  address: "adresse",
}

export function issueMessage(issue: ValidationIssue): string {
  const q = quoted(issue.message)
  switch (issue.code) {
    case "invalid_structure":
      if (/French text/.test(issue.message)) return "Texte français obligatoire."
      if (/translation must be a non-empty/.test(issue.message)) return "Traduction vide."
      if (/`key` must match/.test(issue.message)) return "Clé invalide : minuscules, chiffres et _, en commençant par une lettre."
      if (/Invalid step key/.test(issue.message)) return "Clé d'étape invalide : minuscules, chiffres et _, en commençant par une lettre."
      if (/option `value`/.test(issue.message)) return "Valeur de choix invalide : minuscules, chiffres et _, en commençant par une lettre."
      if (/`options` must be a non-empty/.test(issue.message)) return "Ajoutez au moins un choix."
      if (/`documentTypes` must be a non-empty/.test(issue.message)) return "Choisissez au moins un type de pièce."
      return `Forme du schéma : ${issue.message}`
    case "duplicate_key":
      return "Clé déjà utilisée : les clés sont uniques sur tout le formulaire, items de repeater compris."
    case "duplicate_option_value":
      return `Deux choix ont la même valeur « ${q[0] ?? ""} ».`
    case "invalid_pattern":
      return "Le format attendu (expression régulière) est invalide."
    case "invalid_range":
      return "Le minimum dépasse le maximum."
    case "empty_repeater":
      return "Le repeater ne contient aucun champ."
    case "unknown_step_reference":
      return issue.path === "start" ? "L'étape de départ n'existe pas." : `Branche vers une étape inconnue (« ${q[0] ?? ""} »).`
    case "unreachable_step":
      return "Étape jamais atteinte : reliez-la au parcours."
    case "dead_end_branch":
      return "Pas de branche « Sinon » : si aucune condition n'est remplie, le parcours s'arrête. Retirez la condition de la dernière branche."
    case "unreachable_transition":
      return "Branche jamais suivie : une branche sans condition passe avant elle."
    case "cycle":
      return `Boucle : cette étape ramène à « ${q[1] ?? ""} ». Un parcours ne peut pas revenir en arrière.`
    case "invalid_condition":
      if (/`sum` is only allowed/.test(issue.message)) return "La somme n'est permise que dans les règles d'un repeater."
      if (/exactly one operator/.test(issue.message)) return "Condition à définir."
      return `Condition invalide : ${issue.message}`
    case "unknown_operator":
      return `Opérateur « ${q[0] ?? ""} » non autorisé.`
    case "unknown_field_reference":
      if (/belongs to repeater/.test(issue.message)) return `La condition lit « ${q[0]} », champ d'un repeater, lisible seulement par ses propres items.`
      if (/info text/.test(issue.message)) return `La condition lit « ${q[0]} », un texte d'information sans valeur.`
      return `La condition lit un champ inconnu (« ${q[0] ?? ""} »).`
    case "unavailable_field_reference":
      return `La condition lit « ${q[0]} », rempli à une étape qui ne vient jamais avant : sa valeur sera toujours vide.`
    case "self_reference":
      return "L'affichage du champ dépend de lui-même."
    case "unknown_property":
      return `La propriété ${q[0] ?? ""} n'existe pas.`
    case "archived_property":
      return `La propriété ${q[0] ?? ""} est archivée.`
    case "bind_scope_mismatch":
      return /party\.nature/.test(issue.message)
        ? "La nature ne se bind pas dans un repeater : le repeater fixe la nature de ses items."
        : "Une propriété de relation (relation.*) ne se bind que dans un repeater : la partie principale n'a pas de relation."
    case "bind_nature_mismatch":
      return `La propriété ${q[0] ?? ""} ne s'applique pas à la nature des items (${q[1] ?? ""}).`
    case "bind_relation_mismatch":
      return `La propriété ${q[0] ?? ""} ne s'applique pas à la relation « ${q[1] ?? ""} ».`
    case "bind_type_mismatch": {
      if (/party\.nature/.test(issue.message)) return "La nature ne se bind qu'à une liste de choix unique."
      const m = /is a (single|multiple) `(\w+)`, the field is a (single|multiple) `(\w+)`/.exec(issue.message)
      if (!m) return `Type incompatible avec la propriété : ${issue.message}`
      const kind = (multi: string, type: string) => `${TYPE_FR[type] ?? type}${multi === "multiple" ? " (plusieurs valeurs)" : ""}`
      return `La propriété ${q[0]} attend : ${kind(m[1]!, m[2]!)} ; le champ est : ${kind(m[3]!, m[4]!)}.`
    }
    case "duplicate_bind":
      return `« ${q[0]} » et « ${q[1]} » alimentent tous deux ${q[2]} sur un même parcours.`
    case "options_required":
      return "Ajoutez des choix : une liste non bindée, ou bindée à la nature, porte ses propres choix."
    case "options_not_allowed":
      return `Un champ bindé à ${q[0] ?? "une propriété"} reprend les choix de la propriété : retirez les siens.`
    case "invalid_nature_option":
      return `« ${q[0]} » n'est pas une nature : les choix valent natural_person, legal_person ou legal_arrangement.`
    case "unknown_document_type":
      return `Type de pièce inconnu (${q[0] ?? ""}).`
    case "archived_document_type":
      return `Type de pièce archivé (${q[0] ?? ""}).`
    case "document_nature_mismatch":
      return `Le type de pièce ${q[0]} n'est pas prévu pour la nature des items (${q[1]}).`
    case "missing_translation": {
      const langs = issue.message.replace(/^Missing translation: /, "").split(", ")
      return `Traduction manquante : ${langs.map(languageName).join(", ")}.`
    }
    case "empty_step":
      return "Étape sans champ."
    default:
      return issue.message
  }
}

/** « Étape Identité · Nom » : où se trouve l'anomalie. */
export function issueWhere(issue: ValidationIssue, schema: FormSchema): string {
  const loc = locateIssue(issue)
  const parts: string[] = []
  const step = loc.stepKey ? schema.steps[loc.stepKey] : undefined
  if (step) parts.push(`Étape « ${show(step.title) || loc.stepKey} »`)
  if (loc.fieldKey) {
    const f = locateField(schema, loc.fieldKey)
    const label = f ? (f.field.type === "info" ? "Texte d'information" : show(f.field.label)) : ""
    if (f?.repeater) parts.push(show(f.repeater.label))
    parts.push(label ? `« ${label} »` : loc.fieldKey)
  } else if (loc.transition) {
    const goto = schema.steps[loc.transition.from]?.next[loc.transition.index]?.goto
    parts.push(`branche vers « ${(goto && show(schema.steps[goto]?.title)) || goto} »`)
  } else if (issue.path === "start") parts.push("Départ")
  return parts.join(" · ")
}
