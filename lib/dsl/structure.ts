import type { IssueCode, ValidationIssue } from "./report";
import {
	FIELD_TYPES,
	PARTY_NATURES,
	type FormSchema,
	type InputFieldType,
} from "./types";

/**
 * Contrôle de forme d'un schéma : types, attributs permis, formats des clés et des
 * textes traduits. C'est le contrôle fait à chaque sauvegarde du brouillon ; il laisse
 * passer les états intermédiaires du builder (select sans options, étape inatteignable…),
 * qui ne sont refusés qu'à la publication (validateSchema).
 */

type Obj = Record<string, unknown>;

/** Clé d'étape, de champ, valeur d'option, type de relation. */
export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_KEY_LENGTH = 64;
const LANGUAGE_PATTERN = /^[a-z]{2}$/;
const DOCUMENT_TYPE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const BIND_PATTERN = /^(party|relation)\.[a-z][a-z0-9_]*$/;

const BASE_ATTRIBUTES = ["key", "type", "visibleIf"];
const ATTRIBUTES: Record<"input" | "document" | "repeater" | "info", Set<string>> = {
	input: new Set([
		...BASE_ATTRIBUTES,
		"label",
		"help",
		"required",
		"multiple",
		"bind",
		"options",
		"pattern",
		"min",
		"max",
		"validate",
	]),
	document: new Set([...BASE_ATTRIBUTES, "label", "help", "required", "documentTypes"]),
	repeater: new Set([
		...BASE_ATTRIBUTES,
		"label",
		"help",
		"min",
		"max",
		"bind",
		"fields",
		"validate",
	]),
	info: new Set([...BASE_ATTRIBUTES, "content"]),
};

export type StructureResult =
	| { ok: true; schema: FormSchema; issues: [] }
	| { ok: false; issues: ValidationIssue[] };

/** Vérifie la forme de `input` ; renvoie le schéma typé s'il est conforme. */
export function checkStructure(input: unknown): StructureResult {
	const checker = new StructureChecker();
	checker.root(input);
	if (checker.issues.length > 0) return { ok: false, issues: checker.issues };
	return { ok: true, schema: input as FormSchema, issues: [] };
}

interface Location {
	path: string;
	stepKey?: string;
	fieldPath?: string;
}

class StructureChecker {
	readonly issues: ValidationIssue[] = [];

	private fail(at: Location, message: string, code: IssueCode = "invalid_structure") {
		this.issues.push({ code, severity: "error", ...at, message });
	}

	root(input: unknown) {
		const at = { path: "$" };
		if (!isObject(input)) return this.fail(at, "The schema must be a JSON object");
		this.onlyAttributes(input, new Set(["start", "steps"]), at);

		if (typeof input.start !== "string" || !isKey(input.start)) {
			this.fail({ path: "start" }, "`start` must be a step key");
		}
		if (!isObject(input.steps)) {
			return this.fail(
				{ path: "steps" },
				"`steps` must be an object keyed by step key",
			);
		}
		for (const [stepKey, step] of Object.entries(input.steps)) {
			this.step(step, stepKey);
		}
	}

	private step(step: unknown, stepKey: string) {
		const at = { path: `steps.${stepKey}`, stepKey };
		if (!isKey(stepKey)) {
			this.fail(
				at,
				`Invalid step key \`${stepKey}\`: expected ${KEY_PATTERN.source}`,
			);
		}
		if (!isObject(step)) return this.fail(at, "A step must be an object");
		this.onlyAttributes(
			step,
			new Set(["title", "description", "fields", "next"]),
			at,
		);

		this.localizedText(step.title, { ...at, path: `${at.path}.title` }, true);
		this.localizedText(
			step.description,
			{ ...at, path: `${at.path}.description` },
			false,
		);

		if (!Array.isArray(step.fields)) {
			this.fail({ ...at, path: `${at.path}.fields` }, "`fields` must be an array");
		} else {
			step.fields.forEach((field, i) =>
				this.field(field, { path: `${at.path}.fields[${i}]`, stepKey }, false),
			);
		}

		if (!Array.isArray(step.next)) {
			this.fail({ ...at, path: `${at.path}.next` }, "`next` must be an array");
		} else {
			step.next.forEach((transition, i) =>
				this.transition(transition, { path: `${at.path}.next[${i}]`, stepKey }),
			);
		}
	}

	private transition(transition: unknown, at: Location) {
		if (!isObject(transition)) return this.fail(at, "A transition must be an object");
		this.onlyAttributes(transition, new Set(["if", "goto"]), at);
		if (typeof transition.goto !== "string" || !isKey(transition.goto)) {
			this.fail({ ...at, path: `${at.path}.goto` }, "`goto` must be a step key");
		}
		if ("if" in transition && !isObject(transition.if)) {
			this.fail(
				{ ...at, path: `${at.path}.if` },
				"`if` must be a JSON Logic object",
			);
		}
	}

	private field(field: unknown, at: Location, inRepeater: boolean) {
		if (!isObject(field)) return this.fail(at, "A field must be an object");

		const key = field.key;
		if (typeof key !== "string" || !isKey(key)) {
			this.fail(
				{ ...at, path: `${at.path}.key` },
				`\`key\` must match ${KEY_PATTERN.source} (at most ${MAX_KEY_LENGTH} characters)`,
			);
		} else {
			at = { ...at, fieldPath: at.fieldPath ? `${at.fieldPath}.${key}` : key };
		}

		const type = field.type;
		if (!(FIELD_TYPES as readonly unknown[]).includes(type)) {
			return this.fail(
				{ ...at, path: `${at.path}.type` },
				`\`type\` must be one of: ${FIELD_TYPES.join(", ")}`,
			);
		}
		if ("visibleIf" in field && !isObject(field.visibleIf)) {
			this.fail(
				{ ...at, path: `${at.path}.visibleIf` },
				"`visibleIf` must be a JSON Logic object",
			);
		}

		if (type === "info") {
			this.onlyAttributes(field, ATTRIBUTES.info, at);
			this.localizedText(
				field.content,
				{ ...at, path: `${at.path}.content` },
				true,
			);
			return;
		}

		this.localizedText(field.label, { ...at, path: `${at.path}.label` }, true);
		this.localizedText(field.help, { ...at, path: `${at.path}.help` }, false);

		if (type === "document") {
			this.onlyAttributes(field, ATTRIBUTES.document, at);
			this.optionalBoolean(field, "required", at);
			this.documentTypes(field.documentTypes, {
				...at,
				path: `${at.path}.documentTypes`,
			});
			return;
		}

		if (type === "repeater") {
			if (inRepeater) {
				return this.fail(at, "Nested repeaters are not allowed");
			}
			this.onlyAttributes(field, ATTRIBUTES.repeater, at);
			this.optionalInteger(field, "min", at);
			this.optionalInteger(field, "max", at);
			this.repeaterBind(field.bind, { ...at, path: `${at.path}.bind` });
			this.validationRules(field, at);
			if (!Array.isArray(field.fields)) {
				this.fail(
					{ ...at, path: `${at.path}.fields` },
					"`fields` must be an array",
				);
			} else {
				// Les champs d'item ne sont pas préfixés par la clé de leur étape : fieldPath
				// repeater.champ.
				field.fields.forEach((item, i) =>
					this.field(item, { ...at, path: `${at.path}.fields[${i}]` }, true),
				);
			}
			return;
		}

		this.inputField(field, type as InputFieldType, at);
	}

	private inputField(field: Obj, type: InputFieldType, at: Location) {
		this.onlyAttributes(field, ATTRIBUTES.input, at);
		this.optionalBoolean(field, "required", at);
		this.optionalBoolean(field, "multiple", at);

		if (field.multiple === true && type === "boolean") {
			this.fail(
				{ ...at, path: `${at.path}.multiple` },
				"A `boolean` field cannot be multiple",
			);
		}
		if (
			"bind" in field &&
			(typeof field.bind !== "string" || !BIND_PATTERN.test(field.bind))
		) {
			this.fail(
				{ ...at, path: `${at.path}.bind` },
				"`bind` must be `party.<key>` or `relation.<key>`",
			);
		}

		this.onlyFor(field, "options", type === "select", "select", at);
		this.onlyFor(field, "pattern", type === "text", "text", at);
		this.onlyFor(field, "min", type === "number", "number", at);
		this.onlyFor(field, "max", type === "number", "number", at);

		if ("options" in field)
			this.options(field.options, { ...at, path: `${at.path}.options` });
		if ("pattern" in field && typeof field.pattern !== "string") {
			this.fail(
				{ ...at, path: `${at.path}.pattern` },
				"`pattern` must be a string",
			);
		}
		for (const bound of ["min", "max"] as const) {
			if (bound in field && !Number.isFinite(field[bound])) {
				this.fail(
					{ ...at, path: `${at.path}.${bound}` },
					`\`${bound}\` must be a number`,
				);
			}
		}

		this.validationRules(field, at);
	}

	/** validate : règles JSON Logic, chacune avec son message traduit. */
	private validationRules(field: Obj, at: Location) {
		if (!("validate" in field)) return;
		const rulesAt = { ...at, path: `${at.path}.validate` };
		if (!Array.isArray(field.validate)) {
			return this.fail(rulesAt, "`validate` must be an array");
		}
		field.validate.forEach((rule, i) => {
			const ruleAt = { ...at, path: `${rulesAt.path}[${i}]` };
			if (!isObject(rule))
				return this.fail(ruleAt, "A validation rule must be an object");
			this.onlyAttributes(rule, new Set(["rule", "message"]), ruleAt);
			if (!isObject(rule.rule)) {
				this.fail(
					{ ...ruleAt, path: `${ruleAt.path}.rule` },
					"`rule` must be a JSON Logic object",
				);
			}
			this.localizedText(
				rule.message,
				{ ...ruleAt, path: `${ruleAt.path}.message` },
				true,
			);
		});
	}

	private options(options: unknown, at: Location) {
		if (!Array.isArray(options) || options.length === 0) {
			return this.fail(at, "`options` must be a non-empty array");
		}
		options.forEach((option, i) => {
			const optionAt = { ...at, path: `${at.path}[${i}]` };
			if (!isObject(option))
				return this.fail(optionAt, "An option must be an object");
			this.onlyAttributes(option, new Set(["value", "label"]), optionAt);
			if (typeof option.value !== "string" || !isKey(option.value)) {
				this.fail(
					{ ...optionAt, path: `${optionAt.path}.value` },
					`An option \`value\` must match ${KEY_PATTERN.source}`,
				);
			}
			this.localizedText(
				option.label,
				{ ...optionAt, path: `${optionAt.path}.label` },
				true,
			);
		});
	}

	private documentTypes(codes: unknown, at: Location) {
		if (!Array.isArray(codes) || codes.length === 0) {
			return this.fail(
				at,
				"`documentTypes` must be a non-empty array of document type codes",
			);
		}
		const seen = new Set<unknown>();
		codes.forEach((code, i) => {
			if (typeof code !== "string" || !DOCUMENT_TYPE_PATTERN.test(code)) {
				this.fail(
					{ ...at, path: `${at.path}[${i}]` },
					`A document type code must match ${DOCUMENT_TYPE_PATTERN.source}`,
				);
			} else if (seen.has(code)) {
				this.fail(
					{ ...at, path: `${at.path}[${i}]` },
					`Document type \`${code}\` is listed twice`,
				);
			}
			seen.add(code);
		});
	}

	private repeaterBind(bind: unknown, at: Location) {
		if (!isObject(bind)) {
			return this.fail(at, "A repeater requires `bind: { relation, nature }`");
		}
		this.onlyAttributes(bind, new Set(["relation", "nature"]), at);
		if (typeof bind.relation !== "string" || !isKey(bind.relation)) {
			this.fail(
				{ ...at, path: `${at.path}.relation` },
				`\`relation\` must match ${KEY_PATTERN.source}`,
			);
		}
		if (!(PARTY_NATURES as readonly unknown[]).includes(bind.nature)) {
			this.fail(
				{ ...at, path: `${at.path}.nature` },
				`\`nature\` must be one of: ${PARTY_NATURES.join(", ")}`,
			);
		}
	}

	private localizedText(value: unknown, at: Location, required: boolean) {
		if (value === undefined) {
			if (required)
				this.fail(at, "A translated text with at least `fr` is required");
			return;
		}
		if (!isObject(value)) {
			return this.fail(
				at,
				"A translated text must be an object keyed by language code",
			);
		}
		if (typeof value.fr !== "string" || value.fr.trim() === "") {
			this.fail(
				{ ...at, path: `${at.path}.fr` },
				"The French text (`fr`) is required",
			);
		}
		for (const [language, text] of Object.entries(value)) {
			if (!LANGUAGE_PATTERN.test(language)) {
				this.fail(
					{ ...at, path: `${at.path}.${language}` },
					`Invalid language code \`${language}\`: expected ISO 639-1 (two lowercase letters)`,
				);
			} else if (typeof text !== "string" || text.trim() === "") {
				this.fail(
					{ ...at, path: `${at.path}.${language}` },
					"A translation must be a non-empty string",
				);
			}
		}
	}

	private onlyAttributes(value: Obj, allowed: Set<string>, at: Location) {
		for (const name of Object.keys(value)) {
			if (!allowed.has(name)) {
				const path = at.path === "$" ? name : `${at.path}.${name}`;
				this.fail({ ...at, path }, `Unknown attribute \`${name}\``);
			}
		}
	}

	/** Signale un attribut présent sur un type de champ qui ne l'accepte pas. */
	private onlyFor(
		field: Obj,
		name: string,
		allowed: boolean,
		fieldType: string,
		at: Location,
	) {
		if (name in field && !allowed) {
			this.fail(
				{ ...at, path: `${at.path}.${name}` },
				`\`${name}\` only applies to \`${fieldType}\` fields`,
			);
		}
	}

	private optionalBoolean(value: Obj, name: string, at: Location) {
		if (name in value && typeof value[name] !== "boolean") {
			this.fail(
				{ ...at, path: `${at.path}.${name}` },
				`\`${name}\` must be a boolean`,
			);
		}
	}

	private optionalInteger(value: Obj, name: string, at: Location) {
		if (
			name in value &&
			!(Number.isInteger(value[name]) && (value[name] as number) >= 0)
		) {
			this.fail(
				{ ...at, path: `${at.path}.${name}` },
				`\`${name}\` must be a non-negative integer`,
			);
		}
	}
}

function isObject(value: unknown): value is Obj {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isKey(value: string): boolean {
	return value.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(value);
}
