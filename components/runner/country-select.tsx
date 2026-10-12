"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getCountryOptions } from "@/lib/countries"
import { cn } from "@/lib/utils"

/** Liste des pays avec recherche ; la valeur est le code ISO 3166-1 alpha-2. */
export function CountrySelect({
  id,
  value,
  onChange,
  locale,
  invalid,
  placeholder,
}: {
  id?: string
  value: string | undefined
  onChange: (code: string | undefined) => void
  locale: string
  invalid?: boolean
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => getCountryOptions(locale), [locale])
  const current = options.find((o) => o.code === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" aria-invalid={invalid} className="w-full max-w-80 justify-between font-normal">
          <span className={cn(!current && "text-muted-foreground")}>{current ? current.name : placeholder}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.includes(search.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={locale === "en" ? "Search for a country…" : "Rechercher un pays…"} />
          <CommandList>
            <CommandEmpty>{locale === "en" ? "No results" : "Aucun résultat"}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.code}
                value={o.search}
                onSelect={() => {
                  onChange(o.code === value ? undefined : o.code)
                  setOpen(false)
                }}
              >
                <Check className={cn("size-4", o.code === value ? "opacity-100" : "opacity-0")} />
                {o.name}
                <span className="text-muted-foreground ml-auto font-mono text-xs">{o.code}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
