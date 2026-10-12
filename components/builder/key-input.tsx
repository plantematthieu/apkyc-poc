"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isValidKey, sanitizeKey } from "@/lib/builder"

/**
 * Clé technique (étape, champ) : saisie libre, appliquée en quittant le champ si elle est
 * valide et libre. Les références (conditions, transitions) suivent le changement.
 */
export function KeyInput({
  id,
  label,
  value,
  hint,
  onCommit,
  readOnly,
}: {
  id: string
  label: string
  value: string
  hint: string
  /** false si la clé est déjà prise. */
  onCommit: (next: string) => boolean
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  const [error, setError] = useState<string | null>(null)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
    setError(null)
  }

  const commit = () => {
    if (draft === value) return setError(null)
    if (!isValidKey(draft)) return setError("Minuscules, chiffres et _, en commençant par une lettre (64 caractères au plus).")
    if (!onCommit(draft)) return setError("Cette clé est déjà utilisée.")
    setError(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={draft}
        readOnly={readOnly}
        aria-invalid={!!error}
        className="font-mono text-xs leading-normal"
        onChange={(e) => setDraft(sanitizeKey(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setDraft(value)
        }}
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
