import type { FormSchema, LocalizedText } from "@/lib/dsl"

/** Langues proposées pour la traduction des textes saisis par l'admin (ISO 639-1). */
export const LANGUAGES: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
  es: "Espagnol",
  it: "Italien",
  nl: "Néerlandais",
  pt: "Portugais",
}

export const languageName = (code: string) => LANGUAGES[code] ?? code.toUpperCase()

/** Texte dans une langue, sans repli (vide si non traduit). */
export const textIn = (text: LocalizedText | undefined, lang: string) => (text?.[lang] as string | undefined) ?? ""

/** Texte affiché : langue demandée, repli sur le français. */
export const show = (text: LocalizedText | undefined, lang = "fr") => (text ? ((text[lang] as string | undefined) ?? text.fr) : "")

/**
 * Nouvelle valeur d'un texte traduit. Le français reste présent même vide (le contrôle de
 * structure le signale) ; une traduction vidée est retirée, une traduction vide étant refusée.
 */
export function withText(text: LocalizedText | undefined, lang: string, value: string): LocalizedText {
  const next: LocalizedText = { ...(text ?? { fr: "" }) }
  if (lang === "fr") next.fr = value
  else if (value === "") delete next[lang]
  else next[lang] = value
  return next
}

/** Texte facultatif : undefined s'il ne reste rien. */
export function withOptionalText(text: LocalizedText | undefined, lang: string, value: string): LocalizedText | undefined {
  const next = withText(text, lang, value)
  return Object.values(next).every((v) => !v) ? undefined : next
}

export const fr = (value: string, en?: string): LocalizedText => (en ? { fr: value, en } : { fr: value })

/** Langues présentes dans les textes du schéma, le français d'abord. */
export function schemaLanguages(schema: FormSchema): string[] {
  const found = new Set<string>(["fr"])
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (typeof obj.fr === "string") Object.keys(obj).forEach((k) => /^[a-z]{2}$/.test(k) && found.add(k))
    else Object.values(obj).forEach(visit)
  }
  visit(schema.steps)
  return [...found].sort((a, b) => (a === "fr" ? -1 : b === "fr" ? 1 : a.localeCompare(b)))
}
