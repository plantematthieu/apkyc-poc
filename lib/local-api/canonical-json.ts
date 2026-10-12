/**
 * Sérialisation JSON stable (clés triées récursivement, ordre des tableaux conservé), comme
 * apps/api/src/lib/canonical-json.ts. Le hash passe par Web Crypto, disponible dans le navigateur.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/** sha256 hexadécimal de la forme canonique. */
export async function canonicalHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}
