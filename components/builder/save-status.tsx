"use client"

import { CircleAlert, CloudCheck, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { issueMessage } from "@/lib/builder"
import { useEditor } from "@/store/editor"

/** État de la sauvegarde du brouillon (révision, conflit, forme invalide). */
export function SaveStatus({ onReload }: { onReload: () => void }) {
  const save = useEditor((s) => s.save)
  const version = useEditor((s) => s.version)
  const readOnly = useEditor((s) => s.readOnly)
  if (readOnly || !version) return null

  if (save.status === "conflict")
    return (
      <Button variant="outline" size="sm" className="text-destructive gap-1.5" onClick={onReload} title={save.message}>
        <RefreshCw /> Modifié ailleurs · recharger
      </Button>
    )
  if (save.status === "invalid" || save.status === "error")
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive gap-1.5">
            <CircleAlert /> <span className="hidden lg:inline">Non enregistré</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 text-sm">
          <p className="font-semibold">Brouillon non enregistré</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {save.status === "invalid"
              ? "L'API refuse (422) un schéma qui n'a pas la forme du DSL. Corrigez puis la sauvegarde reprend :"
              : save.message}
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs">
            {save.issues?.slice(0, 6).map((i, n) => (
              <li key={n}>
                {issueMessage(i)} <code className="text-muted-foreground font-mono">{i.path}</code>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    )
  return (
    <span className="text-muted-foreground hidden items-center gap-1.5 px-1 text-xs lg:inline-flex" title={`ETag "${version.revision}"`}>
      {save.status === "saved" ? <CloudCheck className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
      {save.status === "saved" ? `Rév. ${version.revision}` : "Enregistrement…"}
    </span>
  )
}
