import {
  AtSign,
  Calendar,
  FileUp,
  Globe,
  Hash,
  Info,
  ListChecks,
  ListCollapse,
  MapPin,
  Phone,
  Repeat,
  ToggleLeft,
  Type,
  type LucideIcon,
} from "lucide-react"
import type { Field, FieldType } from "@/lib/dsl"
import type { PaletteKind } from "@/lib/builder"

export const TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  select: ListCollapse,
  country: Globe,
  email: AtSign,
  phone: Phone,
  address: MapPin,
  document: FileUp,
  repeater: Repeat,
  info: Info,
}

export const PALETTE_ICONS: Record<PaletteKind, LucideIcon> = { ...TYPE_ICONS, select_multiple: ListChecks }


/** Icône d'un champ (liste à cocher pour un select multiple). */
export function FieldIcon({ field, className }: { field: Pick<Field, "type"> & { multiple?: boolean }; className?: string }) {
  if (field.type === "select" && field.multiple) return <ListChecks className={className} />
  const Icon = TYPE_ICONS[field.type]
  return <Icon className={className} />
}
