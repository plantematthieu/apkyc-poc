import type { LocalizedText } from "@/lib/dsl"

/** Texte dans la langue demandée (ISO 639-1), avec repli sur le français. */
export function localize(text: LocalizedText | null | undefined, language: string): string {
  if (!text) return ""
  return text[language] ?? text.fr
}
