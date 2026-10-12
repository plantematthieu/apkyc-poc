import type { Catalog, CatalogDocumentType, CatalogProperty } from "./catalog";
import { buildStepGraph, type StepGraph } from "./graph";
import { analyzeLogic } from "./json-logic";
import {
	toReport,
	type IssueCode,
	type ValidationIssue,
	type ValidationReport,
} from "./report";
import { checkStructure } from "./structure";
import {
	ADDRESS_PARTS,
	PARTY_NATURES,
	type DocumentField,
	type Field,
	type FormSchema,
	type InputField,
	type JsonLogic,
	type LocalizedText,
	type RepeaterField,
} from "./types";

/**
 * Contrôles de publication d'un schéma : forme (checkStructure), puis, si la forme est
 * correcte, graphe des étapes, clés, conditions, bind et pièces, contre le catalogue du
 * tenant. Les erreurs bloquent la publication ; les avertissements sont seulement signalés.
 */
export function validateSchema(input: unknown, catalog: Catalog): ValidationReport {
	const structure = checkStructure(input);
	if (!structure.ok) return toReport(structure.issues);
	return toReport(new SchemaChecker(structure.schema, catalog).run());
}

/** Un champ du schéma et sa position. */
interface FieldEntry {
	field: Field;
	stepKey: string;
	/** Chemin dans le schéma : steps.identity.fields[2]. */
	path: string;
	/** Clé du champ, préfixée de celle du repeater pour un champ d'item. */
	fieldPath: string;
	/** Repeater contenant le champ, pour un champ d'item. */
	repeater?: RepeaterField;
}

interface Location {
	path: string;
	stepKey?: string;
	fieldPath?: string;
}

const PARTY_NATURE_BIND = "party.nature";

class SchemaChecker {
	private readonly issues: ValidationIssue[] = [];
	private readonly entries: FieldEntry[] = [];
	/** Champs hors repeater, par clé (première occurrence). */
	private readonly topLevel = new Map<string, FieldEntry>();
	/** Champs d'item, par clé de repeater puis clé de champ. */
	private readonly items = new Map<string, Map<string, FieldEntry>>();
	private readonly texts: { text: LocalizedText; at: Location }[] = [];
	private readonly properties: Map<string, CatalogProperty>;
	private readonly documentTypes: Map<string, CatalogDocumentType>;
	private graph!: StepGraph;
	private hasCycle = false;

	constructor(
		private readonly schema: FormSchema,
		catalog: Catalog,
	) {
		this.properties = new Map(
			catalog.properties.map((p) => [`${p.scope}.${p.key}`, p]),
		);
		this.documentTypes = new Map(catalog.documentTypes.map((d) => [d.code, d]));
	}

	run(): ValidationIssue[] {
		this.collect();
		this.checkGraph();
		for (const entry of this.entries) this.checkField(entry);
		this.checkConditions();
		this.checkDuplicateBinds();
		this.checkTranslations();
		return this.issues;
	}

	private report(
		code: IssueCode,
		at: Location,
		message: string,
		severity: "error" | "warning" = "error",
	) {
		this.issues.push({ code, severity, ...at, message });
	}

	private at(entry: FieldEntry, suffix = ""): Location {
		return {
			path: entry.path + suffix,
			stepKey: entry.stepKey,
			fieldPath: entry.fieldPath,
		};
	}

	// ------------------------------------------------------------------ Inventaire

	private collect() {
		const keyOwners = new Map<string, FieldEntry>();

		const add = (
			field: Field,
			path: string,
			stepKey: string,
			repeater?: RepeaterField,
		) => {
			const entry: FieldEntry = {
				field,
				stepKey,
				path,
				fieldPath: repeater ? `${repeater.key}.${field.key}` : field.key,
				repeater,
			};
			this.entries.push(entry);

			const owner = keyOwners.get(field.key);
			if (owner) {
				this.report(
					"duplicate_key",
					this.at(entry, ".key"),
					`Field key \`${field.key}\` is already used by ${owner.path}: keys must be ` +
						"unique across the whole form, repeater items included",
				);
			} else {
				keyOwners.set(field.key, entry);
				if (repeater) this.items.get(repeater.key)?.set(field.key, entry);
				else this.topLevel.set(field.key, entry);
			}

			this.collectTexts(field, this.at(entry));
		};

		for (const [stepKey, step] of Object.entries(this.schema.steps)) {
			const stepPath = `steps.${stepKey}`;
			this.texts.push({
				text: step.title,
				at: { path: `${stepPath}.title`, stepKey },
			});
			if (step.description) {
				this.texts.push({
					text: step.description,
					at: { path: `${stepPath}.description`, stepKey },
				});
			}

			step.fields.forEach((field, i) => {
				const path = `${stepPath}.fields[${i}]`;
				add(field, path, stepKey);
				if (field.type === "repeater") {
					if (!this.items.has(field.key)) this.items.set(field.key, new Map());
					field.fields.forEach((item, j) =>
						add(item, `${path}.fields[${j}]`, stepKey, field),
					);
				}
			});
		}
	}

	private collectTexts(field: Field, at: Location) {
		const push = (text: LocalizedText | undefined, suffix: string) => {
			if (text) this.texts.push({ text, at: { ...at, path: at.path + suffix } });
		};
		if (field.type === "info") return push(field.content, ".content");
		push(field.label, ".label");
		push(field.help, ".help");
		if (field.type === "document") return;
		if (field.type !== "repeater") {
			field.options?.forEach((option, i) =>
				push(option.label, `.options[${i}].label`),
			);
		}
		field.validate?.forEach((rule, i) =>
			push(rule.message, `.validate[${i}].message`),
		);
	}

	// ------------------------------------------------------------------ Graphe

	private checkGraph() {
		const { steps, start } = this.schema;
		const startKnown = start in steps;
		if (!startKnown) {
			this.report(
				"unknown_step_reference",
				{ path: "start" },
				`Start step \`${start}\` does not exist`,
			);
		}

		for (const [stepKey, step] of Object.entries(steps)) {
			const stepPath = `steps.${stepKey}`;
			if (step.fields.length === 0) {
				this.report(
					"empty_step",
					{ path: `${stepPath}.fields`, stepKey },
					`Step \`${stepKey}\` has no field`,
					"warning",
				);
			}

			step.next.forEach((transition, i) => {
				if (!(transition.goto in steps)) {
					this.report(
						"unknown_step_reference",
						{ path: `${stepPath}.next[${i}].goto`, stepKey },
						`Transition to unknown step \`${transition.goto}\``,
					);
				}
			});

			const fallback = step.next.findIndex((t) => t.if === undefined);
			if (step.next.length > 0 && fallback === -1) {
				this.report(
					"dead_end_branch",
					{ path: `${stepPath}.next[${step.next.length - 1}]`, stepKey },
					`Step \`${stepKey}\` has no unconditional transition: when no condition holds, ` +
						"the journey stops. Remove the condition of the last transition",
				);
			}
			for (let i = fallback + 1; fallback !== -1 && i < step.next.length; i++) {
				this.report(
					"unreachable_transition",
					{ path: `${stepPath}.next[${i}]`, stepKey },
					`This transition is never used: transition ${fallback} has no condition and always applies first`,
					"warning",
				);
			}
		}

		this.graph = buildStepGraph(this.schema);
		this.hasCycle = this.graph.backEdges.length > 0;

		if (startKnown) {
			for (const stepKey of Object.keys(steps)) {
				if (!this.graph.reachable.has(stepKey)) {
					this.report(
						"unreachable_step",
						{ path: `steps.${stepKey}`, stepKey },
						`Step \`${stepKey}\` cannot be reached from the start step`,
					);
				}
			}
		}
		for (const [from, to] of this.graph.backEdges) {
			this.report(
				"cycle",
				{ path: `steps.${from}.next`, stepKey: from },
				`Step \`${from}\` leads back to step \`${to}\`: a journey cannot loop`,
			);
		}
	}

	// ------------------------------------------------------------------ Champs

	private checkField(entry: FieldEntry) {
		const { field } = entry;
		switch (field.type) {
			case "info":
				return;
			case "document":
				return this.checkDocument(entry, field);
			case "repeater":
				if (field.fields.length === 0) {
					this.report(
						"empty_repeater",
						this.at(entry, ".fields"),
						`Repeater \`${field.key}\` has no field`,
					);
				}
				if (
					field.min !== undefined &&
					field.max !== undefined &&
					field.min > field.max
				) {
					this.report(
						"invalid_range",
						this.at(entry, ".min"),
						"`min` is greater than `max`",
					);
				}
				return;
			default:
				return this.checkInput(entry, field);
		}
	}

	private checkInput(entry: FieldEntry, field: InputField) {
		if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
			this.report(
				"invalid_range",
				this.at(entry, ".min"),
				"`min` is greater than `max`",
			);
		}
		if (field.pattern !== undefined) {
			try {
				new RegExp(field.pattern, "u");
			} catch {
				this.report(
					"invalid_pattern",
					this.at(entry, ".pattern"),
					"`pattern` is not a valid regular expression",
				);
			}
		}
		if (field.options) {
			const seen = new Set<string>();
			field.options.forEach((option, i) => {
				if (seen.has(option.value)) {
					this.report(
						"duplicate_option_value",
						this.at(entry, `.options[${i}].value`),
						`Option value \`${option.value}\` is used more than once`,
					);
				}
				seen.add(option.value);
			});
		}

		if (field.bind === PARTY_NATURE_BIND) return this.checkNatureBind(entry, field);
		if (field.bind) this.checkPropertyBind(entry, field, field.bind);
		else if (field.type === "select" && !field.options) {
			this.report(
				"options_required",
				this.at(entry, ".options"),
				"An unbound `select` field requires `options`",
			);
		}
	}

	/** party.nature : select simple dont les valeurs sont des natures. */
	private checkNatureBind(entry: FieldEntry, field: InputField) {
		if (entry.repeater) {
			return this.report(
				"bind_scope_mismatch",
				this.at(entry, ".bind"),
				"`party.nature` cannot be bound inside a repeater: the repeater sets the nature of its items",
			);
		}
		if (field.type !== "select" || field.multiple) {
			return this.report(
				"bind_type_mismatch",
				this.at(entry, ".bind"),
				"`party.nature` can only be bound to a single-value `select` field",
			);
		}
		if (!field.options) {
			return this.report(
				"options_required",
				this.at(entry, ".options"),
				`A field bound to \`party.nature\` requires \`options\` among: ${PARTY_NATURES.join(", ")}`,
			);
		}
		field.options.forEach((option, i) => {
			if (!(PARTY_NATURES as readonly string[]).includes(option.value)) {
				this.report(
					"invalid_nature_option",
					this.at(entry, `.options[${i}].value`),
					`\`${option.value}\` is not a party nature (allowed: ${PARTY_NATURES.join(", ")})`,
				);
			}
		});
	}

	private checkPropertyBind(entry: FieldEntry, field: InputField, bind: string) {
		const at = this.at(entry, ".bind");
		const scope = bind.startsWith("relation.") ? "relation" : "party";
		const { repeater } = entry;

		if (scope === "relation" && !repeater) {
			return this.report(
				"bind_scope_mismatch",
				at,
				"`relation.*` can only be bound inside a repeater: the main party has no relation",
			);
		}

		const property = this.properties.get(bind);
		if (!property)
			return this.report(
				"unknown_property",
				at,
				`Property \`${bind}\` does not exist`,
			);
		if (property.archived)
			return this.report(
				"archived_property",
				at,
				`Property \`${bind}\` is archived`,
			);

		const multiple = field.multiple ?? false;
		if (property.type !== field.type || property.multiple !== multiple) {
			this.report(
				"bind_type_mismatch",
				at,
				`Property \`${bind}\` is ${describeType(property.type, property.multiple)}, ` +
					`the field is ${describeType(field.type, multiple)}`,
			);
		}

		if (
			repeater &&
			scope === "party" &&
			!accepts(property.natures, repeater.bind.nature)
		) {
			this.report(
				"bind_nature_mismatch",
				at,
				`Property \`${bind}\` does not apply to ${repeater.bind.nature} (applies to: ${property.natures.join(", ")})`,
			);
		}
		if (
			repeater &&
			scope === "relation" &&
			!accepts(property.relationTypes, repeater.bind.relation)
		) {
			this.report(
				"bind_relation_mismatch",
				at,
				`Property \`${bind}\` does not apply to relation \`${repeater.bind.relation}\` ` +
					`(applies to: ${property.relationTypes.join(", ")})`,
			);
		}

		if (field.type === "select" && field.options) {
			this.report(
				"options_not_allowed",
				this.at(entry, ".options"),
				`A field bound to \`${bind}\` uses the property's options and cannot define its own`,
			);
		}
	}

	private checkDocument(entry: FieldEntry, field: DocumentField) {
		field.documentTypes.forEach((code, i) => {
			const at = this.at(entry, `.documentTypes[${i}]`);
			const documentType = this.documentTypes.get(code);
			if (!documentType) {
				return this.report(
					"unknown_document_type",
					at,
					`Document type \`${code}\` does not exist`,
				);
			}
			if (documentType.archived) {
				return this.report(
					"archived_document_type",
					at,
					`Document type \`${code}\` is archived`,
				);
			}
			const nature = entry.repeater?.bind.nature;
			if (nature && !accepts(documentType.applicableNatures, nature)) {
				this.report(
					"document_nature_mismatch",
					at,
					`Document type \`${code}\` is not meant for ${nature} ` +
						`(meant for: ${documentType.applicableNatures.join(", ")})`,
					"warning",
				);
			}
		});
	}

	// ------------------------------------------------------------------ Conditions

	private checkConditions() {
		for (const [stepKey, step] of Object.entries(this.schema.steps)) {
			step.next.forEach((transition, i) => {
				if (transition.if) {
					this.checkCondition(
						transition.if,
						{ path: `steps.${stepKey}.next[${i}].if`, stepKey },
						stepKey,
					);
				}
			});
		}

		for (const entry of this.entries) {
			const { field } = entry;
			if (field.visibleIf) {
				this.checkCondition(
					field.visibleIf,
					this.at(entry, ".visibleIf"),
					entry.stepKey,
					entry.repeater,
					entry,
				);
			}
			if (field.type === "repeater") {
				// Règles sur l'ensemble des items : champs du formulaire + sum sur les items.
				field.validate?.forEach((rule, i) =>
					this.checkCondition(
						rule.rule,
						this.at(entry, `.validate[${i}].rule`),
						entry.stepKey,
						undefined,
						undefined,
						field,
					),
				);
			} else if (field.type !== "info" && field.type !== "document") {
				field.validate?.forEach((rule, i) =>
					this.checkCondition(
						rule.rule,
						this.at(entry, `.validate[${i}].rule`),
						entry.stepKey,
						entry.repeater,
					),
				);
			}
		}
	}

	/**
	 * @param stepKey étape où la condition est évaluée ;
	 * @param repeater repeater de l'item évalué : ses champs sont alors visibles ;
	 * @param owner champ porteur d'un visibleIf, qui ne peut pas dépendre de lui-même ;
	 * @param aggregated repeater dont la condition est une règle validate : sum y agrège
	 *   les champs number de ses items.
	 */
	private checkCondition(
		rule: JsonLogic,
		at: Location,
		stepKey: string,
		repeater?: RepeaterField,
		owner?: FieldEntry,
		aggregated?: RepeaterField,
	) {
		const analysis = analyzeLogic(rule);
		for (const problem of analysis.problems) {
			this.report(
				problem.kind === "unknown_operator"
					? "unknown_operator"
					: "invalid_condition",
				{ ...at, path: joinPath(at.path, problem.path) },
				problem.message,
			);
		}

		for (const aggregate of analysis.aggregates) {
			const sumAt = { ...at, path: joinPath(at.path, aggregate.path) };
			if (!aggregated) {
				this.report(
					"invalid_condition",
					sumAt,
					"`sum` is only allowed in the `validate` rules of a repeater",
				);
				continue;
			}
			const target = this.items.get(aggregated.key)?.get(aggregate.name);
			if (!target) {
				this.report(
					"unknown_field_reference",
					sumAt,
					`\`${aggregate.name}\` is not a field of repeater \`${aggregated.key}\``,
				);
			} else if (target.field.type !== "number" || target.field.multiple) {
				this.report(
					"invalid_condition",
					sumAt,
					`\`sum\` only applies to single-value \`number\` fields; \`${aggregate.name}\` is not one`,
				);
			}
		}

		for (const reference of analysis.references) {
			const refAt = { ...at, path: joinPath(at.path, reference.path) };
			const [head = "", ...rest] = reference.name.split(".");
			const target =
				(repeater && this.items.get(repeater.key)?.get(head)) ||
				this.topLevel.get(head);

			if (!target) {
				const itemOf = [...this.items.entries()].find(([, fields]) =>
					fields.has(head),
				)?.[0];
				this.report(
					"unknown_field_reference",
					refAt,
					itemOf
						? `Field \`${head}\` belongs to repeater \`${itemOf}\` and can only be referenced by its own items`
						: `Unknown field \`${head}\``,
				);
				continue;
			}
			if (target.field.type === "info") {
				this.report(
					"unknown_field_reference",
					refAt,
					`Field \`${head}\` is an info text and has no value`,
				);
				continue;
			}
			if (rest.length > 0) {
				const part = rest.join(".");
				if (
					target.field.type !== "address" ||
					!(ADDRESS_PARTS as readonly string[]).includes(part)
				) {
					this.report(
						"unknown_field_reference",
						refAt,
						target.field.type === "address"
							? `Unknown address part \`${part}\` (allowed: ${ADDRESS_PARTS.join(", ")})`
							: `Field \`${head}\` has no part \`${part}\``,
					);
					continue;
				}
			}
			if (owner && target === owner) {
				this.report(
					"self_reference",
					refAt,
					`The visibility of field \`${head}\` cannot depend on itself`,
				);
				continue;
			}
			if (
				!target.repeater &&
				!this.hasCycle &&
				target.stepKey !== stepKey &&
				!this.graph.leadsTo(target.stepKey, stepKey)
			) {
				this.report(
					"unavailable_field_reference",
					refAt,
					`Field \`${head}\` is in step \`${target.stepKey}\`, which never comes before step ` +
						`\`${stepKey}\`: its value is always empty here`,
					"warning",
				);
			}
		}
	}

	// ------------------------------------------------------------------ Bind en double

	/**
	 * Deux champs ne peuvent pas alimenter la même propriété de la même partie s'ils peuvent
	 * être remplis dans un même parcours (même étape, ou une étape qui mène à l'autre).
	 * Deux branches exclusives peuvent en revanche viser la même propriété (pp_email et
	 * pm_email bindés à party.email).
	 */
	private checkDuplicateBinds() {
		const byTarget = new Map<string, FieldEntry[]>();
		for (const entry of this.entries) {
			const bind = "bind" in entry.field ? entry.field.bind : undefined;
			if (typeof bind !== "string") continue;
			const target = `${entry.repeater?.key ?? "$"}|${bind}`;
			byTarget.set(target, [...(byTarget.get(target) ?? []), entry]);
		}

		for (const group of byTarget.values()) {
			for (let j = 1; j < group.length; j++) {
				const later = group[j]!;
				const earlier = group
					.slice(0, j)
					.find(
						(other) =>
							later.repeater ||
							this.sameJourney(other.stepKey, later.stepKey),
					);
				if (!earlier) continue;
				this.report(
					"duplicate_bind",
					this.at(later, ".bind"),
					`Fields \`${earlier.fieldPath}\` and \`${later.fieldPath}\` both write ` +
						`\`${(later.field as InputField).bind}\` and can be filled in the same journey`,
				);
			}
		}
	}

	private sameJourney(a: string, b: string): boolean {
		if (a === b) return true;
		if (this.hasCycle) return false;
		return this.graph.leadsTo(a, b) || this.graph.leadsTo(b, a);
	}

	// ------------------------------------------------------------------ Traductions

	/** Un texte qui n'est pas traduit dans une langue utilisée ailleurs dans le schéma. */
	private checkTranslations() {
		const languages = new Set(this.texts.flatMap(({ text }) => Object.keys(text)));
		if (languages.size <= 1) return;
		for (const { text, at } of this.texts) {
			const missing = [...languages]
				.filter((language) => !(language in text))
				.sort();
			if (missing.length > 0) {
				this.report(
					"missing_translation",
					at,
					`Missing translation: ${missing.join(", ")}`,
					"warning",
				);
			}
		}
	}
}

/** Liste de restriction vide = tout accepté. */
function accepts<T>(allowed: readonly T[], value: T): boolean {
	return allowed.length === 0 || allowed.includes(value);
}

function describeType(type: string, multiple: boolean): string {
	return multiple ? `a multiple \`${type}\`` : `a single \`${type}\``;
}

function joinPath(base: string, relative: string): string {
	if (!relative) return base;
	return relative.startsWith("[") ? base + relative : `${base}.${relative}`;
}
