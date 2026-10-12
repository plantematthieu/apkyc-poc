"use client"

import { useLayoutEffect, useRef } from "react"
import type { LocalizedText } from "@/lib/dsl"
import { show, textIn, withOptionalText, withText } from "@/lib/builder"
import { cn } from "@/lib/utils"
import { useEditor } from "@/store/editor"

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

/**
 * Texte modifiable sur place. Les événements ne remontent pas à la carte, pour ne pas
 * déclencher le glisser-déposer pendant la saisie.
 */
export function InlineText({
  value,
  onChange,
  placeholder,
  className,
  multiline,
  ariaLabel,
  readOnly,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
  ariaLabel?: string
  readOnly?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value, placeholder])

  const common = cn(
    "-mx-1 w-[calc(100%+0.5rem)] rounded-md bg-transparent px-1 outline-none placeholder:text-muted-foreground/60",
    !readOnly && "hover:bg-muted/70 focus:bg-background focus:ring-ring/40 focus:ring-2",
    className,
  )
  if (multiline)
    return (
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={stop}
        onKeyDown={stop}
        className={cn(common, "resize-none overflow-hidden")}
      />
    )
  return (
    <input
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stop}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
      className={common}
    />
  )
}

/**
 * Texte traduit (LocalizedText) modifiable dans la langue d'édition du builder. Hors
 * français, le texte français sert d'indication tant que la traduction manque.
 */
export function LocalizedInline({
  text,
  onChange,
  optional,
  placeholder,
  ...rest
}: {
  text: LocalizedText | undefined
  onChange: (text: LocalizedText | undefined) => void
  optional?: boolean
  placeholder?: string
  className?: string
  multiline?: boolean
  ariaLabel?: string
}) {
  const lang = useEditor((s) => s.lang)
  const readOnly = useEditor((s) => s.readOnly)
  const fallback = lang !== "fr" && text?.fr ? `${text.fr} (à traduire)` : undefined
  return (
    <InlineText
      {...rest}
      readOnly={readOnly}
      value={textIn(text, lang)}
      placeholder={fallback ?? placeholder}
      onChange={(v) => onChange(optional ? withOptionalText(text, lang, v) : withText(text, lang, v))}
    />
  )
}

/** Texte affiché dans la langue d'édition, repli sur le français. */
export function useShow() {
  const lang = useEditor((s) => s.lang)
  return (text: LocalizedText | undefined) => show(text, lang)
}
