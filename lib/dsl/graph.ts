import type { FormSchema } from "./types";

/**
 * Graphe des étapes : arcs étape → étape tirés des transitions, en ignorant celles qui
 * visent une étape inconnue ou qui ne sont jamais suivies (signalées à part).
 */
export interface StepGraph {
	/** Étapes atteignables depuis start (start compris). */
	reachable: Set<string>;
	/** Arcs qui referment un cycle, sous forme [depuis, vers]. */
	backEdges: [string, string][];
	/**
	 * Vrai si l'étape `from` peut mener à l'étape `to` (ou si c'est la même étape).
	 * Fiable seulement sans cycle.
	 */
	leadsTo(from: string, to: string): boolean;
}

export function buildStepGraph(schema: FormSchema): StepGraph {
	const successors = new Map<string, string[]>();
	for (const [key, step] of Object.entries(schema.steps)) {
		// Les transitions placées après la première sans condition ne sont jamais suivies.
		const fallback = step.next.findIndex((t) => t.if === undefined);
		const used = fallback === -1 ? step.next : step.next.slice(0, fallback + 1);
		const targets = used.map((t) => t.goto).filter((goto) => goto in schema.steps);
		successors.set(key, [...new Set(targets)]);
	}

	const reachable = new Set<string>();
	if (schema.start in schema.steps) {
		const queue = [schema.start];
		reachable.add(schema.start);
		while (queue.length > 0) {
			for (const next of successors.get(queue.shift()!) ?? []) {
				if (!reachable.has(next)) {
					reachable.add(next);
					queue.push(next);
				}
			}
		}
	}

	// Parcours en profondeur itératif : blanc (absent), gris (sur la pile), noir (terminé).
	// Un arc vers une étape grise referme un cycle.
	const backEdges: [string, string][] = [];
	const color = new Map<string, "grey" | "black">();
	for (const root of successors.keys()) {
		if (color.has(root)) continue;
		const stack: { key: string; index: number }[] = [{ key: root, index: 0 }];
		color.set(root, "grey");
		while (stack.length > 0) {
			const frame = stack[stack.length - 1]!;
			const next = successors.get(frame.key)![frame.index++];
			if (next === undefined) {
				color.set(frame.key, "black");
				stack.pop();
			} else if (color.get(next) === "grey") {
				backEdges.push([frame.key, next]);
			} else if (!color.has(next)) {
				color.set(next, "grey");
				stack.push({ key: next, index: 0 });
			}
		}
	}

	// Descendants de chaque étape, calculés à la demande (graphe sans cycle attendu).
	const descendants = new Map<string, Set<string>>();
	const descendantsOf = (key: string): Set<string> => {
		const known = descendants.get(key);
		if (known) return known;
		const result = new Set<string>();
		descendants.set(key, result); // garde contre un cycle résiduel
		for (const next of successors.get(key) ?? []) {
			result.add(next);
			for (const d of descendantsOf(next)) result.add(d);
		}
		return result;
	};

	return {
		reachable,
		backEdges,
		leadsTo: (from, to) => from === to || descendantsOf(from).has(to),
	};
}
