/**
 * DSL des formulaires, version 1 : forme du JSON stocké dans form_versions.schema.
 *
 * Un formulaire est un graphe orienté sans cycle d'étapes (nœuds) reliées par des
 * transitions (flèches) éventuellement conditionnelles. Les positions des nœuds ne sont pas
 * stockées : le builder recalcule la disposition à l'ouverture.
 *
 * Ce package ne dépend ni de la base ni du navigateur : il est partagé par l'API, le
 * back-office (builder) et le portail.
 */

/** Version du format décrit ici ; stockée dans form_versions.dsl_version. */
export const DSL_VERSION = 1;

/**
 * Texte traduit, indexé par code langue ISO 639-1. Le français est obligatoire ; les autres
 * langues sont facultatives, avec repli sur le français à l'affichage.
 * Même forme que LocalizedText de @apkyc/db, redéclaré ici pour ne pas dépendre de la base.
 */
export type LocalizedText = { fr: string } & Partial<Record<string, string>>;

/**
 * Nature d'une partie. Doit rester identique à l'enum PostgreSQL party_nature.
 * - natural_person : personne physique ;
 * - legal_person : personne morale (société, association) ;
 * - legal_arrangement : construction juridique sans personnalité morale (indivision, fiducie).
 */
export const PARTY_NATURES = [
	"natural_person",
	"legal_person",
	"legal_arrangement",
] as const;
export type PartyNature = (typeof PARTY_NATURES)[number];

/** Condition JSON Logic, évaluée à l'identique côté navigateur et côté serveur. */
export type JsonLogic = Record<string, unknown>;

export interface FormSchema {
	/** Clé de la première étape. */
	start: string;
	/** Étapes indexées par leur clé (^[a-z][a-z0-9_]*$). */
	steps: Record<string, Step>;
}

export interface Step {
	title: LocalizedText;
	description?: LocalizedText;
	fields: Field[];
	/**
	 * Transitions évaluées dans l'ordre : la première dont la condition est vraie (ou
	 * absente) l'emporte. Vide = étape finale. Sinon, la dernière doit être sans condition.
	 */
	next: Transition[];
}

export interface Transition {
	if?: JsonLogic;
	goto: string;
}

/** Types de champ qui portent une valeur saisie et peuvent être bindés à une propriété. */
export const INPUT_FIELD_TYPES = [
	"text",
	"number",
	"date",
	"boolean",
	"select",
	"country",
	"email",
	"phone",
	"address",
] as const;
export type InputFieldType = (typeof INPUT_FIELD_TYPES)[number];

export const FIELD_TYPES = [
	...INPUT_FIELD_TYPES,
	"document",
	"repeater",
	"info",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type Field = InputField | DocumentField | RepeaterField | InfoField;

/** Champ admis dans un item de repeater : pas de repeater imbriqué. */
export type ItemField = InputField | DocumentField | InfoField;

interface BaseField {
	/**
	 * Clé du champ (^[a-z][a-z0-9_]*$), unique sur tout le formulaire, champs des items de
	 * repeater compris : les réponses sont stockées à plat et les conditions s'y réfèrent
	 * par cette clé.
	 */
	key: string;
	/** Champ affiché seulement si la condition est vraie. */
	visibleIf?: JsonLogic;
}

export interface InputField extends BaseField {
	type: InputFieldType;
	label: LocalizedText;
	help?: LocalizedText;
	/** Ne s'applique qu'à un champ visible. */
	required?: boolean;
	/** Liste de valeurs ; interdit sur boolean. */
	multiple?: boolean;
	/**
	 * Propriété alimentée à la validation du dossier : party.<key> (la partie décrite),
	 * relation.<key> (sa relation avec la partie principale, dans un repeater uniquement).
	 * party.nature cible la nature figée de la partie.
	 */
	bind?: string;
	/**
	 * select : options proposées. Obligatoires si le champ n'est pas bindé ou est bindé à
	 * party.nature (valeurs prises dans PARTY_NATURES) ; interdites si le champ est bindé à
	 * une autre propriété, dont il reprend les options.
	 */
	options?: SelectOption[];
	/** text : expression régulière que la valeur doit respecter. */
	pattern?: string;
	/** number : bornes de la valeur. */
	min?: number;
	max?: number;
	/** Règles supplémentaires, chacune avec le message affiché si elle est fausse. */
	validate?: ValidationRule[];
}

export interface SelectOption {
	/** Code stable en snake_case, seul stocké et utilisé par les conditions. */
	value: string;
	label: LocalizedText;
}

export interface ValidationRule {
	rule: JsonLogic;
	message: LocalizedText;
}

export interface DocumentField extends BaseField {
	type: "document";
	label: LocalizedText;
	help?: LocalizedText;
	required?: boolean;
	/** Codes document_types acceptés : le client fournit l'un d'eux. */
	documentTypes: string[];
}

export interface RepeaterField extends BaseField {
	type: "repeater";
	label: LocalizedText;
	help?: LocalizedText;
	/** Bornes du nombre d'items. */
	min?: number;
	max?: number;
	/** Chaque item décrit une partie liée à la partie principale. */
	bind: RepeaterBind;
	/**
	 * Champs de chaque item. Leurs conditions voient les champs de l'item et ceux du
	 * formulaire.
	 */
	fields: ItemField[];
	/**
	 * Règles sur l'ensemble des items (quotes-parts des indivisaires qui totalisent 100).
	 * Elles voient les champs du formulaire et peuvent agréger un champ number des items
	 * avec l'opérateur sum : { "==": [{ "sum": "share_percentage" }, 100] }.
	 */
	validate?: ValidationRule[];
}

export interface RepeaterBind {
	/** Type de relation en snake_case : 'beneficial_owner', 'co_owner'. */
	relation: string;
	/** Nature des parties décrites par les items. */
	nature: PartyNature;
}

/** Texte affiché au client, sans saisie. */
export interface InfoField extends BaseField {
	type: "info";
	content: LocalizedText;
}

/** Parties d'une adresse, lisibles par les conditions : { "var": "address.country" }. */
export const ADDRESS_PARTS = ["line1", "line2", "postalCode", "city", "country"] as const;

/** Valeur d'un champ ou d'une propriété de type address. */
export interface AddressValue {
	line1: string;
	line2?: string;
	postalCode: string;
	city: string;
	/** Code ISO 3166-1 alpha-2. */
	country: string;
}

/**
 * Schéma de départ d'un formulaire créé sans modèle : une étape finale vide, que le builder
 * complète. Il passe le contrôle de structure.
 */
export function createEmptySchema(): FormSchema {
	return {
		start: "start",
		steps: {
			start: { title: { fr: "Début", en: "Start" }, fields: [], next: [] },
		},
	};
}
