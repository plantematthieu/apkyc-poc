"use client"

import { useMemo } from "react"
import { getCountryOptions } from "@/lib/countries"
import { allFields, choicesOf, describeLogic, show, type DescribeOptions, type Scalar } from "@/lib/builder"
import type { JsonLogic } from "@/lib/dsl"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"

/** Lecture en phrases des conditions du schéma courant (libellés, valeurs d'options, pays). */
export function useDescribe() {
  const schema = useEditor((s) => s.schema)
  const lang = useEditor((s) => s.lang)
  const properties = useCatalogStore((s) => s.properties)

  return useMemo(() => {
    const fields = new Map(allFields(schema).map((f) => [f.field.key, f.field]))
    const countries = new Map(getCountryOptions(lang).map((c) => [c.code, c.name]))
    const parts: Record<string, string> = { country: "pays", postalCode: "code postal", city: "ville", line1: "adresse", line2: "complément" }
    const options: DescribeOptions = {
      label: (path) => {
        const [key, part] = path.split(".")
        const f = fields.get(key!)
        const label = f && f.type !== "info" ? show(f.label, lang) : key!
        return part ? `${label} (${parts[part] ?? part})` : label
      },
      value: (path, value: Scalar) => {
        const [key, part] = path.split(".")
        const f = fields.get(key!)
        if (part === "country" || f?.type === "country") return countries.get(String(value)) ?? String(value)
        if (f && f.type !== "info" && f.type !== "document" && f.type !== "repeater") {
          const choice = choicesOf(f, properties, lang)?.find((c) => c.value === value)
          if (choice) return choice.label
        }
        return String(value)
      },
    }
    return {
      options,
      describe: (logic: JsonLogic | undefined) => (logic === undefined ? "Sinon" : describeLogic(logic, options)),
    }
  }, [schema, lang, properties])
}
