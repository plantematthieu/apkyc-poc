"use client"

import { useMemo } from "react"
import { Check, Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LANGUAGES, schemaLanguages } from "@/lib/builder"
import { useEditor } from "@/store/editor"

/** Langue des textes modifiés (LocalizedText) ; le français est obligatoire. */
export function LanguageMenu() {
  const lang = useEditor((s) => s.lang)
  const schema = useEditor((s) => s.schema)
  const setLang = useEditor((s) => s.setLang)
  const present = useMemo(() => new Set(schemaLanguages(schema)), [schema])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Langue d'édition">
          <Languages /> <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Langue des libellés modifiés. Le français est obligatoire ; une langue commencée doit être complète (avertissement missing_translation).
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <DropdownMenuItem key={code} onSelect={() => setLang(code)}>
            <Check className={code === lang ? "opacity-100" : "opacity-0"} />
            {name}
            <span className="text-muted-foreground ml-auto text-xs">{code === "fr" ? "obligatoire" : present.has(code) ? "utilisée" : ""}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
