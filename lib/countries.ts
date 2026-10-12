/**
 * Codes ISO 3166-1 alpha-2 (copie de packages/form-ui/src/lib/countries.ts). Les noms ne sont
 * pas stockés : ils viennent d'Intl.DisplayNames dans la langue d'affichage.
 */
// prettier-ignore
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX",
  "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ",
  "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK",
  "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS",
  "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN",
  "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ",
  "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI",
  "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
  "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
  "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR",
  "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const

export const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES)

export interface CountryOption {
  code: string
  name: string
  /** Nom et code sans accents ni majuscules, pour la recherche. */
  search: string
}

/** Minuscules sans accents : « États-Unis » et « etats » se rejoignent. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

const cache = new Map<string, CountryOption[]>()

/** Pays triés par nom dans la langue d'affichage. */
export function getCountryOptions(locale: string): CountryOption[] {
  const cached = cache.get(locale)
  if (cached) return cached
  const names = new Intl.DisplayNames([locale, "fr"], { type: "region", fallback: "code" })
  const options = COUNTRY_CODES.map((code) => {
    const name = names.of(code) ?? code
    return { code, name, search: normalizeSearch(`${name} ${code}`) }
  }).sort((a, b) => a.name.localeCompare(b.name, locale))
  cache.set(locale, options)
  return options
}

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, "fr"], { type: "region", fallback: "code" }).of(code) ?? code
  } catch {
    return code
  }
}
