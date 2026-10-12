import type { InputField, SelectOption } from "@/lib/dsl"
import type { DocumentType, Property } from "@/lib/local-api/types"
import type { EngineContext, PreviewDocument } from "./types"

/** Contexte du moteur à partir des référentiels : options des propriétés, faces des pièces. */
export function createContext(
  properties: Property[],
  documentTypes: DocumentType[],
  documents: PreviewDocument[],
  locale: string,
): EngineContext {
  const twoSided = new Map(documentTypes.map((d) => [d.code, d.twoSided]))
  return {
    locale,
    documents,
    twoSided: (code) => twoSided.get(code) ?? false,
    resolveOptions: (field: InputField): SelectOption[] | undefined => {
      if (!field.bind || field.bind === "party.nature") return field.options
      const [scope, key] = field.bind.split(".")
      return properties.find((p) => p.scope === scope && p.key === key)?.options ?? field.options
    },
  }
}
