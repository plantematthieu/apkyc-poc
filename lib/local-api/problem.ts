import type { ValidationReport } from "@/lib/dsl"

/**
 * Erreur au format RFC 9457 (application/problem+json), comme celles de l'API : `status`
 * HTTP et `code` stable, lisible par la machine.
 */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    /** Rapport de validation (422 sur une sauvegarde ou une publication). */
    readonly report?: ValidationReport,
  ) {
    super(detail)
    this.name = "ApiProblem"
  }
}

export const isProblem = (e: unknown, code?: string): e is ApiProblem =>
  e instanceof ApiProblem && (code === undefined || e.code === code)

export const notFound = (code: string, detail: string) => new ApiProblem(404, code, detail)
export const conflict = (code: string, detail: string) => new ApiProblem(409, code, detail)
export const unprocessable = (code: string, detail: string, report?: ValidationReport) => new ApiProblem(422, code, detail, report)
export const preconditionFailed = (code: string, detail: string) => new ApiProblem(412, code, detail)
export const preconditionRequired = (detail: string) => new ApiProblem(428, "precondition_required", detail)
