import { DOCUMENT_TYPE_ROWS } from "@/lib/catalog/document-types"
import type { Catalog } from "@/lib/dsl"
import type { Property } from "./types"

/**
 * Catalogue passé à validateSchema : propriétés système et du tenant, archivées comprises
 * (un bind vers une propriété archivée est signalé comme tel), et types de pièces.
 * Équivalent de load-catalog.ts côté API.
 */
export function toCatalog(properties: Property[]): Catalog {
  return {
    properties: properties.map((p) => ({
      scope: p.scope,
      key: p.key,
      type: p.type,
      multiple: p.multiple,
      natures: p.natures,
      relationTypes: p.relationTypes,
      archived: p.archivedAt !== null,
    })),
    documentTypes: DOCUMENT_TYPE_ROWS.map((d) => ({
      code: d.code,
      applicableNatures: d.applicableNatures,
      archived: d.archivedAt !== null,
    })),
  }
}
