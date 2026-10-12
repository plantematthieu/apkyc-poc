/**
 * Rapport de validation d'un schéma : renvoyé par l'API (validate, publish) et affiché par le
 * builder, qui met en évidence l'étape ou le champ concerné.
 * Messages en anglais : ils remontent dans les réponses de l'API.
 */

export const ISSUE_CODES = [
	// Forme du schéma : seul code produit par checkStructure (sauvegarde du brouillon)
	"invalid_structure",
	// Champs
	"duplicate_key",
	"duplicate_option_value",
	"invalid_pattern",
	"invalid_range",
	"empty_repeater",
	// Graphe des étapes
	"unknown_step_reference",
	"unreachable_step",
	"dead_end_branch",
	"unreachable_transition",
	"cycle",
	// Conditions JSON Logic
	"invalid_condition",
	"unknown_operator",
	"unknown_field_reference",
	"unavailable_field_reference",
	"self_reference",
	// Bind
	"unknown_property",
	"archived_property",
	"bind_scope_mismatch",
	"bind_nature_mismatch",
	"bind_relation_mismatch",
	"bind_type_mismatch",
	"duplicate_bind",
	"options_required",
	"options_not_allowed",
	"invalid_nature_option",
	// Pièces
	"unknown_document_type",
	"archived_document_type",
	"document_nature_mismatch",
	// Divers
	"missing_translation",
	"empty_step",
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
	code: IssueCode;
	/** error : bloque la publication ; warning : signalé, n'empêche rien. */
	severity: IssueSeverity;
	/**
	 * Emplacement dans le schéma : clés séparées par des points, index entre crochets
	 * (steps.identity.fields[2].bind). "$" pour la racine.
	 */
	path: string;
	/** Étape concernée, si l'anomalie se rattache à une étape. */
	stepKey?: string;
	/** Champ concerné : sa clé, préfixée de celle du repeater pour un champ d'item. */
	fieldPath?: string;
	message: string;
}

export interface ValidationReport {
	/** Vrai s'il n'y a aucune erreur (les avertissements n'empêchent pas la publication). */
	valid: boolean;
	issues: ValidationIssue[];
}

/** Construit le rapport à partir des anomalies trouvées. */
export function toReport(issues: ValidationIssue[]): ValidationReport {
	return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
