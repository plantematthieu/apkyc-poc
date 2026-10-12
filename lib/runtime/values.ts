import { COUNTRY_SET } from "@/lib/countries"
import type { AddressValue } from "@/lib/dsl"

/** Valeur vide : absente, chaîne vide, liste vide, adresse sans aucune partie. */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.values(value as object).every((v) => v === undefined || v === null || v === "")
  return false
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export const isCountry = (value: unknown): value is string => typeof value === "string" && COUNTRY_SET.has(value)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isEmail = (value: unknown) => typeof value === "string" && EMAIL.test(value)

const E164 = /^\+[1-9]\d{6,14}$/
export const isE164 = (value: unknown) => typeof value === "string" && E164.test(value)

/**
 * Numéro saisi → E.164. Simplification du POC (form-ui passe par libphonenumber-js) :
 * séparateurs retirés, « 06… » lu comme un numéro français.
 */
export function toE164(draft: string): string | undefined {
  const compact = draft.replace(/[\s().-]/g, "")
  if (compact === "") return undefined
  if (/^0\d{9}$/.test(compact)) return `+33${compact.slice(1)}`
  if (compact.startsWith("00")) return `+${compact.slice(2)}`
  return compact
}

export function isAddress(value: unknown): value is AddressValue {
  if (!value || typeof value !== "object") return false
  const a = value as Record<string, unknown>
  return ["line1", "postalCode", "city"].every((k) => typeof a[k] === "string" && (a[k] as string).trim() !== "") && isCountry(a.country)
}

/** Jour courant au format ISO, pour la fraîcheur des pièces. */
export const today = () => new Date().toISOString().slice(0, 10)

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
