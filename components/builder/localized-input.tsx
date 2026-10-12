"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { LocalizedText } from "@/lib/dsl"
import { languageName, textIn, withOptionalText, withText } from "@/lib/builder"
import { useEditor } from "@/store/editor"

/** Champ de réglage pour un texte traduit, dans la langue d'édition du builder. */
export function LocalizedInput({
  id,
  text,
  onChange,
  optional,
  multiline,
  rows = 2,
  placeholder,
}: {
  id?: string
  text: LocalizedText | undefined
  onChange: (text: LocalizedText | undefined) => void
  optional?: boolean
  multiline?: boolean
  rows?: number
  placeholder?: string
}) {
  const lang = useEditor((s) => s.lang)
  const value = textIn(text, lang)
  const hint = lang !== "fr" && text?.fr ? text.fr : placeholder
  const set = (v: string) => onChange(optional ? withOptionalText(text, lang, v) : withText(text, lang, v))
  const field = multiline ? (
    <Textarea id={id} rows={rows} value={value} placeholder={hint} onChange={(e) => set(e.target.value)} />
  ) : (
    <Input id={id} value={value} placeholder={hint} onChange={(e) => set(e.target.value)} />
  )
  return (
    <div className="relative">
      {field}
      {lang !== "fr" && (
        <span className="bg-muted text-muted-foreground pointer-events-none absolute top-1.5 right-1.5 rounded px-1 text-[10px] font-semibold uppercase" title={languageName(lang)}>
          {lang}
        </span>
      )}
    </div>
  )
}
