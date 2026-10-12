import { FORM_TEMPLATE_ROWS } from "@/lib/catalog/form-templates"
import { tick } from "./db"
import { localize } from "./localize"
import type { FormTemplate } from "./types"

/** GET /v1/form-templates — modèles actifs, triés par nom, textes dans la langue de l'appelant. */
export async function listFormTemplates(params: { language?: string } = {}): Promise<{ data: FormTemplate[] }> {
  await tick()
  const language = params.language ?? "fr"
  const data = FORM_TEMPLATE_ROWS.filter((row) => !row.archivedAt)
    .map((row) => ({
      id: row.id,
      name: localize(row.name, language),
      description: row.description ? localize(row.description, language) : null,
      natures: row.natures,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, language))
  return { data }
}
