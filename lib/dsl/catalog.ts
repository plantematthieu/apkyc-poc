import type { InputFieldType, PartyNature } from "./types";

/**
 * Référentiels dont dépend la validation d'un schéma, fournis par l'appelant (l'API les lit
 * en base). Archivés compris : un bind vers une propriété archivée doit être signalé comme
 * tel, pas comme inconnu.
 */
export interface Catalog {
	/** Propriétés système et propriétés du tenant. */
	properties: CatalogProperty[];
	documentTypes: CatalogDocumentType[];
}

export interface CatalogProperty {
	scope: "party" | "relation";
	key: string;
	/** Les types de propriété sont un sous-ensemble des types de champ de saisie. */
	type: InputFieldType;
	multiple: boolean;
	/** Natures concernées ; vide = toutes. */
	natures: PartyNature[];
	/** Types de relation concernés (scope relation) ; vide = tous. */
	relationTypes: string[];
	archived: boolean;
}

export interface CatalogDocumentType {
	code: string;
	/** Natures concernées ; vide = toutes. */
	applicableNatures: PartyNature[];
	archived: boolean;
}
