"use client"

import { Eye, GitBranch, LayoutList, Network, Plus, Redo2, Undo2 } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { show } from "@/lib/builder"
import { useEditor } from "@/store/editor"

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const steps = useEditor((s) => s.schema.steps)
  const readOnly = useEditor((s) => s.readOnly)

  const run = (fn: () => void) => () => {
    fn()
    onOpenChange(false)
  }
  const ed = () => useEditor.getState()

  const addStep = () => {
    const { positions } = ed()
    const maxY = Math.max(0, ...Object.values(positions).map((p) => p.y))
    ed().setView("flow")
    ed().addStep({ x: 0, y: maxY + 180 })
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Actions" description="Rechercher une action ou une étape">
      <CommandInput placeholder="Rechercher une action ou une étape…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        <CommandGroup heading="Vues">
          <CommandItem onSelect={run(() => ed().setView("flow"))}>
            <GitBranch /> Parcours
          </CommandItem>
          <CommandItem onSelect={run(() => ed().setView("preview"))}>
            <Eye /> Aperçu client
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          {!readOnly && (
            <CommandItem onSelect={run(addStep)}>
              <Plus /> Ajouter une étape
            </CommandItem>
          )}
          <CommandItem
            onSelect={run(() => {
              ed().setView("flow")
              ed().relayout()
            })}
          >
            <Network /> Réorganiser le parcours
          </CommandItem>
          <CommandItem onSelect={run(() => useEditor.temporal.getState().undo())}>
            <Undo2 /> Annuler <CommandShortcut>Ctrl Z</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => useEditor.temporal.getState().redo())}>
            <Redo2 /> Rétablir <CommandShortcut>Ctrl Y</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ouvrir une étape">
          {Object.entries(steps).map(([key, s]) => (
            <CommandItem key={key} value={`etape ${show(s.title)} ${key}`} onSelect={run(() => ed().openStep(key))}>
              <LayoutList /> {show(s.title) || key}
              <CommandShortcut className="font-mono">{key}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
