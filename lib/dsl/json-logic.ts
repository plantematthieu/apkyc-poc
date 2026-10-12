/**
 * Analyse statique des conditions JSON Logic (sans les évaluer) : opérateurs permis et
 * champs référencés. L'évaluation, côté portail, se fera avec json-logic-js, complété des
 * opérateurs custom ci-dessous.
 */

/**
 * Opérateurs permis dans les conditions. Liste blanche volontairement courte : tout
 * opérateur ajouté doit exister à l'identique dans le navigateur et sur le serveur.
 */
export const ALLOWED_OPERATORS = [
	"var",
	"missing",
	"==",
	"!=",
	"<",
	"<=",
	">",
	">=",
	"!",
	"!!",
	"and",
	"or",
	"in",
	// Custom : somme d'un champ number sur les items d'un repeater ({ "sum": "share" }),
	// permise seulement dans les règles validate du repeater.
	"sum",
] as const;

const ALLOWED = new Set<string>(ALLOWED_OPERATORS);

export interface LogicProblem {
	kind: "invalid" | "unknown_operator";
	/** Chemin relatif à la racine de la condition : "and[1].==[0]". */
	path: string;
	message: string;
}

export interface LogicAnalysis {
	problems: LogicProblem[];
	/** Chemins lus par var et missing ("last_name", "address.country"). */
	references: { name: string; path: string }[];
	/** Champs d'item agrégés par sum. */
	aggregates: { name: string; path: string }[];
}

/** Opérateurs utilisés, champs référencés et anomalies de forme d'une condition. */
export function analyzeLogic(rule: unknown): LogicAnalysis {
	const analysis: LogicAnalysis = { problems: [], references: [], aggregates: [] };
	walk(rule, "", analysis, true);
	return analysis;
}

function walk(node: unknown, path: string, out: LogicAnalysis, isRoot = false): void {
	if (Array.isArray(node)) {
		node.forEach((item, i) => walk(item, `${path}[${i}]`, out));
		return;
	}
	if (node === null || typeof node !== "object") {
		if (isRoot) {
			out.problems.push({
				kind: "invalid",
				path,
				message: "A condition must be a JSON Logic operation",
			});
		}
		return;
	}

	const entries = Object.entries(node);
	if (entries.length !== 1) {
		out.problems.push({
			kind: "invalid",
			path,
			message: "A JSON Logic operation must be an object with exactly one operator",
		});
		return;
	}

	const [operator, args] = entries[0]!;
	const here = path ? `${path}.${operator}` : operator;
	if (!ALLOWED.has(operator)) {
		out.problems.push({
			kind: "unknown_operator",
			path: here,
			message: `Operator \`${operator}\` is not allowed (allowed: ${ALLOWED_OPERATORS.join(", ")})`,
		});
		return;
	}

	if (operator === "var") return readVar(args, here, out);
	if (operator === "missing") return readMissing(args, here, out);
	if (operator === "sum") return readSum(args, here, out);
	walk(args, here, out);
}

/** var : "x", ["x"] ou ["x", défaut]. Le nom doit être une chaîne littérale non vide. */
function readVar(args: unknown, path: string, out: LogicAnalysis): void {
	const name = Array.isArray(args) ? args[0] : args;
	if (typeof name !== "string" || name === "") {
		out.problems.push({
			kind: "invalid",
			path,
			message: "`var` must name a field with a literal, non-empty string",
		});
		return;
	}
	out.references.push({ name, path });
	if (Array.isArray(args)) {
		if (args.length > 2) {
			out.problems.push({
				kind: "invalid",
				path,
				message: "`var` takes at most two arguments",
			});
		}
		if (args.length === 2) walk(args[1], `${path}[1]`, out);
	}
}

/** missing : liste de noms de champs littéraux. */
function readMissing(args: unknown, path: string, out: LogicAnalysis): void {
	const names = Array.isArray(args) ? args : [args];
	names.forEach((name, i) => {
		if (typeof name !== "string" || name === "") {
			out.problems.push({
				kind: "invalid",
				path: `${path}[${i}]`,
				message: "`missing` takes literal, non-empty field names",
			});
		} else {
			out.references.push({ name, path: `${path}[${i}]` });
		}
	});
}

/** sum : nom littéral d'un champ d'item ("share" ou ["share"]). */
function readSum(args: unknown, path: string, out: LogicAnalysis): void {
	const name = Array.isArray(args) && args.length === 1 ? args[0] : args;
	if (typeof name !== "string" || name === "") {
		out.problems.push({
			kind: "invalid",
			path,
			message: "`sum` takes the literal key of a repeater item field",
		});
		return;
	}
	out.aggregates.push({ name, path });
}
