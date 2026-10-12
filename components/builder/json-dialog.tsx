"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { checkStructure } from "@/lib/dsl"
import { issueMessage } from "@/lib/builder"
import { useEditor } from "@/store/editor"

/** Le schéma du DSL tel qu'enregistré (form_versions.schema) : copie, ou remplacement après checkStructure. */
export function JsonDialog({ children }: { children: ReactNode }) {
  const readOnly = useEditor((s) => s.readOnly)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setText(JSON.stringify(useEditor.getState().schema, null, 2))
      setError(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Schéma copié")
    } catch {
      toast.error("Copie impossible : sélectionnez le texte puis Ctrl+C")
    }
  }

  const apply = () => {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (e) {
      return setError(`JSON invalide : ${(e as Error).message}`)
    }
    const r = checkStructure(raw)
    if (!r.ok) {
      const first = r.issues[0]!
      return setError(`${first.path} : ${issueMessage(first)} (${r.issues.length} anomalie${r.issues.length > 1 ? "s" : ""} de forme)`)
    }
    useEditor.getState().replaceSchema(r.schema)
    toast.success("Schéma appliqué")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Schéma du formulaire (DSL v1)</DialogTitle>
          <DialogDescription>
            Le JSON enregistré dans form_versions.schema. {readOnly ? "Version figée : lecture seule." : "Modifiable : il est appliqué s'il passe le contrôle de structure (checkStructure)."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          readOnly={readOnly}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          className="h-[55vh] resize-none font-mono text-xs"
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={copy}>
            Copier
          </Button>
          {!readOnly && <Button onClick={apply}>Appliquer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
