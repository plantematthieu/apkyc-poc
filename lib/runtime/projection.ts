import type { DocumentField, FormSchema, InputField, PartyNature } from "@/lib/dsl"
import type { Property } from "@/lib/local-api/types"
import { localize } from "@/lib/local-api/localize"
import { evaluate, itemScope } from "./logic"
import { currentDocuments } from "./documents"
import type { ItemData, PreviewDocument, SubmissionData } from "./types"
import { addDays, isEmpty } from "./values"

/**
 * Plan des écritures en base qu'entraîne un dossier rempli dans l'aperçu, phase par phase :
 * saisie sur le portail, transmission, revue, validation (projection vers le référentiel).
 * Tables et colonnes du modèle : submissions, submission_events, documents, reviews,
 * collection_requests, parties, party_relations, party_external_refs. Les tables du dossier
 * (submissions et suivantes) ne sont pas encore migrées : leurs colonnes suivent le brouillon
 * OpenAPI.
 */

/** Référence symbolique vers une ligne créée par le plan (:party_1) ou un paramètre serveur. */
export type PlanRef = { $ref: string }
/** Expression calculée par le serveur (now()). */
export type PlanSql = { $sql: string }

export const ref = (name: string): PlanRef => ({ $ref: name })
export const sql = (expr: string): PlanSql => ({ $sql: expr })
export const isRef = (v: unknown): v is PlanRef => !!v && typeof v === "object" && "$ref" in v
export const isSql = (v: unknown): v is PlanSql => !!v && typeof v === "object" && "$sql" in v

export interface PlanRow {
  id: string
  table: string
  op: "INSERT" | "UPDATE"
  values: Record<string, unknown>
  where?: Record<string, unknown>
  /** Nombre d'exécutions (une par étape, par pièce…). */
  times?: number
  /** Appel d'API qui déclenche l'écriture. */
  endpoint?: string
  title: string
  note: string
}

export interface PlanPhase {
  id: "portal" | "submit" | "review" | "approve"
  title: string
  actor: string
  intro: string
  rows: PlanRow[]
}

export interface PlanNotice {
  level: "info" | "warning"
  message: string
}

/** Réponse conservée seulement dans submissions.data. */
export interface Stay {
  path: string
  label: string
  reason: string
}

export interface BackendPlan {
  phases: PlanPhase[]
  stays: Stay[]
  notices: PlanNotice[]
  summary: string[]
}

export interface ProjectionInput {
  schema: FormSchema
  formName: string
  versionNumber: number
  /** Chemin recalculé. */
  path: string[]
  /** Réponses retenues (collectData). */
  data: SubmissionData
  /** Pièces courantes des champs visibles. */
  documents: PreviewDocument[]
  properties: Property[]
  documentTypes: Map<string, { label: string; validityDays: number | null }>
  /** Référence externe passée à la création de la demande de collecte. */
  externalRef?: { system: string; externalId: string } | null
}

interface Target {
  ref: string
  nature: PartyNature | null
  props: Record<string, unknown>
  label: string
  relRef?: string
  relation?: string
  relProps?: Record<string, unknown>
}

const NATURE_LABEL: Record<PartyNature, string> = {
  natural_person: "personne physique",
  legal_person: "personne morale",
  legal_arrangement: "construction juridique",
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`
const isNature = (v: unknown): v is PartyNature => v === "natural_person" || v === "legal_person" || v === "legal_arrangement"

/** Libellé calculé par la projection (parties.display_name). */
export function displayName(nature: PartyNature | null, props: Record<string, unknown>, fallback: string): string {
  if (nature === "natural_person") {
    const first = Array.isArray(props.first_names) ? (props.first_names as string[]).join(" ") : ""
    const name = [typeof props.last_name === "string" ? props.last_name.toUpperCase() : "", first].filter(Boolean).join(" ")
    return name || fallback
  }
  return typeof props.company_name === "string" && props.company_name ? props.company_name : fallback
}

function matchHint(t: Target): string {
  if (t.nature === "legal_person")
    return t.props.siren ? `même SIREN (${t.props.siren})` : "aucun SIREN collecté : pas de rapprochement automatique proposé"
  if (t.nature === "natural_person") {
    const all = ["last_name", "birth_date", "birth_place"].every((k) => !isEmpty(t.props[k]))
    return all ? "même nom, date et lieu de naissance" : "nom, date ou lieu de naissance absent : rapprochement non proposé"
  }
  return "aucun critère de rapprochement pour cette nature"
}

export function planWrites(input: ProjectionInput): BackendPlan {
  const { schema, data, properties, path } = input
  const notices: PlanNotice[] = []
  const stays: Stay[] = []
  const linked: Target[] = []
  const principal: Target = { ref: "party_main", nature: null, props: {}, label: "Partie principale" }
  const docOwner = new Map<string, Target>()
  let mainBinds = 0
  let natureBound = false

  const label = (f: { label?: { fr: string } }, suffix = "") => `${localize(f.label as never, "fr")}${suffix}`
  const findProp = (scope: "party" | "relation", key: string) => properties.find((p) => p.scope === scope && p.key === key)

  const steps = path.map((k) => [k, schema.steps[k]] as const).filter(([, s]) => !!s)

  // La nature d'abord : elle décide des propriétés applicables à la partie principale.
  for (const [, step] of steps)
    for (const f of step!.fields)
      if (f.type === "select" && f.bind === "party.nature" && f.key in data) {
        natureBound = true
        if (isNature(data[f.key])) principal.nature = data[f.key] as PartyNature
      }

  const assign = (f: InputField, fieldPath: string, text: string, value: unknown, target: Target) => {
    if (!f.bind) return void stays.push({ path: fieldPath, label: text, reason: "champ non bindé" })
    if (f.bind === "party.nature") return
    const [scope, key] = f.bind.split(".") as ["party" | "relation", string]
    const p = findProp(scope, key)
    if (!p) {
      notices.push({ level: "warning", message: `« ${text} » vise la propriété ${f.bind}, qui n'existe pas : valeur non projetée.` })
      return void stays.push({ path: fieldPath, label: text, reason: `propriété ${f.bind} introuvable` })
    }
    if (p.archivedAt) {
      notices.push({ level: "warning", message: `« ${text} » vise la propriété archivée ${f.bind} : valeur non projetée.` })
      return void stays.push({ path: fieldPath, label: text, reason: "propriété archivée" })
    }
    if (scope === "party" && target.nature && p.natures.length > 0 && !p.natures.includes(target.nature)) {
      notices.push({
        level: "warning",
        message: `« ${text} » : ${f.bind} ne s'applique qu'aux natures ${p.natures.join(", ")} ; elle n'est pas écrite sur une ${NATURE_LABEL[target.nature]}.`,
      })
      return void stays.push({ path: fieldPath, label: text, reason: "propriété d'une autre nature" })
    }
    if (scope === "party") {
      target.props[key] = value
      if (target === principal) mainBinds++
    } else if (target.relProps) target.relProps[key] = value
  }

  const scope = data
  for (const [, step] of steps) {
    for (const field of step!.fields) {
      if (!evaluate(field.visibleIf, scope)) continue
      if (field.type === "info") continue
      if (field.type === "document") {
        docOwner.set(field.key, principal)
        continue
      }
      if (field.type === "repeater") {
        const items = Array.isArray(data[field.key]) ? (data[field.key] as ItemData[]) : []
        items.forEach((item, i) => {
          const n = linked.length + 1
          const t: Target = {
            ref: `party_${n}`,
            relRef: `relation_${n}`,
            nature: field.bind.nature,
            props: {},
            relProps: {},
            relation: field.bind.relation,
            label: `${label(field)} n° ${i + 1}`,
          }
          linked.push(t)
          for (const itemField of field.fields) {
            const fieldPath = `${field.key}[${i}].${itemField.key}`
            if (itemField.type === "document") {
              if (evaluate(itemField.visibleIf, itemScope(scope, item))) docOwner.set(fieldPath, t)
              continue
            }
            if (itemField.type === "info" || !(itemField.key in item)) continue
            assign(itemField, fieldPath, label(itemField, ` (${t.label})`), item[itemField.key], t)
          }
        })
        continue
      }
      if (!(field.key in data)) continue
      assign(field, field.key, label(field), data[field.key], principal)
    }
  }

  const hasMain = natureBound || mainBinds > 0 || linked.length > 0 || docOwner.size > 0
  if (!principal.nature)
    notices.push({
      level: "warning",
      message:
        "La nature de la partie principale n'est pas connue (aucun champ bindé à party.nature sur ce chemin) : la validation n'aboutit que si la demande de collecte cible une partie existante (partyId ou externalRef déjà connue).",
    })

  const docs = input.documents
  const docName = (d: PreviewDocument) => `doc_${docs.indexOf(d) + 1}`
  const first = path[0]

  // ---------------------------------------------------------------- 1. Saisie
  const portal: PlanRow[] = [
    {
      id: "sub-insert",
      table: "submissions",
      op: "INSERT",
      endpoint: "GET /v1/portal/submission",
      title: "Ouverture du dossier",
      values: {
        id: ref("submission"),
        tenant_id: ref("tenant_id"),
        collection_request_id: ref("collection_request"),
        form_version_id: ref("form_version"),
        party_id: null,
        status: "draft",
        current_step: first ?? null,
        path: first ? [first] : [],
        data: {},
        created_at: sql("now()"),
      },
      note: `Créé au premier chargement du portail, après l'échange du lien d'invitation contre une session (POST /v1/portal/sessions). Le dossier est lié à la version publiée n° ${input.versionNumber} de « ${input.formName} » : il n'en changera plus. current_step et path contiennent des clés d'étape. party_id est rempli d'emblée si la demande cible une partie connue.`,
    },
    {
      id: "evt-created",
      table: "submission_events",
      op: "INSERT",
      title: "Trace de l'ouverture",
      values: { submission_id: ref("submission"), actor_type: "end_client", action: "created", occurred_at: sql("now()") },
      note: "Journal en ajout seul (jamais modifié ni supprimé) : la piste d'audit présentable lors d'un contrôle AMF ou ACPR.",
    },
    {
      id: "req-progress",
      table: "collection_requests",
      op: "UPDATE",
      title: "Demande en cours",
      values: { status: "in_progress" },
      where: { id: ref("collection_request") },
      note: "Le client a commencé à remplir.",
    },
    {
      id: "sub-step",
      table: "submissions",
      op: "UPDATE",
      times: path.length,
      endpoint: "POST /v1/portal/submission/steps/{stepKey}/complete",
      title: "Chaque étape validée",
      values: { data: sql("data || :step_answers"), current_step: ref("next_step"), path: ref("computed_path"), updated_at: sql("now()") },
      where: { id: ref("submission") },
      note: `Une fois par étape (${path.join(", ")}). Seul moyen d'enregistrer des réponses en V1 : le serveur rejoue validateStep puis nextStep et recalcule le chemin (computePath). Si le client revient en arrière et change de branche, les réponses hors chemin restent dans l'historique mais sortent du dossier.`,
    },
    {
      id: "evt-step",
      table: "submission_events",
      op: "INSERT",
      times: path.length,
      title: "Historique de chaque étape",
      values: {
        submission_id: ref("submission"),
        actor_type: "end_client",
        action: "step_completed",
        before: ref("answers_before"),
        after: ref("answers_after"),
        occurred_at: sql("now()"),
      },
      note: "Qui a déclaré quoi, et quand.",
    },
  ]
  docs.forEach((d) => {
    const type = input.documentTypes.get(d.documentTypeCode)
    const expires = type?.validityDays && d.issuedAt ? addDays(d.issuedAt, type.validityDays) : (d.expiresAt ?? null)
    portal.push({
      id: `doc-${d.id}`,
      table: "documents",
      op: "INSERT",
      endpoint: "POST /v1/portal/submission/documents/upload-url",
      title: `Pièce « ${type?.label ?? d.documentTypeCode} »${d.face !== "single" ? ` (${d.face === "front" ? "recto" : "verso"})` : ""}`,
      values: {
        id: ref(docName(d)),
        tenant_id: ref("tenant_id"),
        submission_id: ref("submission"),
        party_id: null,
        document_type_code: d.documentTypeCode,
        field_path: d.fieldPath,
        face: d.face,
        original_filename: d.originalFilename,
        size_bytes: d.sizeBytes,
        storage_key: sql(`:tenant_id || '/' || :submission || '/${docName(d)}'`),
        scan_status: "pending",
        review_status: "to_review",
        issued_at: d.issuedAt ?? null,
        expires_at: expires,
      },
      note:
        "Ligne créée avec l'URL présignée (5 minutes) : le fichier part du navigateur droit vers le stockage, sans passer par l'API. Une nouvelle pièce pour le même champ et la même face remplace la précédente (replaced_by_document_id)." +
        (type?.validityDays && d.issuedAt ? ` expires_at = date d'émission + ${type.validityDays} jours (fraîcheur exigée par le type de pièce).` : ""),
    })
  })
  if (docs.length > 0)
    portal.push({
      id: "doc-scan",
      table: "documents",
      op: "UPDATE",
      times: docs.length,
      endpoint: "POST /v1/portal/submission/documents/{documentId}/confirm",
      title: "Analyse de chaque pièce",
      values: { detected_mime_type: ref("magic_bytes_type"), sha256: ref("file_hash"), scan_status: "analyzed" },
      where: { id: ref("doc_n") },
      note: "La confirmation vérifie que l'objet est dans le bucket avec la taille annoncée, puis met l'analyse en file : type réel, antivirus, aperçu, sha256. scan_status passe à analyzed, ou rejected (virus, unsupported_format, too_large, corrupted).",
    })

  // ---------------------------------------------------------------- 2. Transmission
  const submit: PlanRow[] = [
    {
      id: "sub-submit",
      table: "submissions",
      op: "UPDATE",
      endpoint: "POST /v1/portal/submission/submit",
      title: "Dossier transmis",
      values: { status: "submitted", data, path, current_step: null, submitted_at: sql("now()") },
      where: { id: ref("submission") },
      note: "Le serveur recalcule le chemin, revalide chaque étape et vérifie que chaque pièce exigée est présente avec scan_status = analyzed. data ne garde que les réponses du chemin suivi et des champs affichés.",
    },
    {
      id: "evt-submit",
      table: "submission_events",
      op: "INSERT",
      title: "Trace de la transmission",
      values: { submission_id: ref("submission"), actor_type: "end_client", action: "submitted", occurred_at: sql("now()") },
      note: "Horodate l'engagement du client sur ses déclarations.",
    },
    {
      id: "req-submitted",
      table: "collection_requests",
      op: "UPDATE",
      title: "Demande transmise",
      values: { status: "submitted" },
      where: { id: ref("collection_request") },
      note: "Arrête les relances.",
    },
  ]

  // ---------------------------------------------------------------- 3. Revue
  const review: PlanRow[] = [
    {
      id: "sub-review",
      table: "submissions",
      op: "UPDATE",
      endpoint: "POST /v1/submissions/{submissionId}/start-review",
      title: "Revue démarrée",
      values: { status: "in_review", assigned_to: ref("analyst") },
      where: { id: ref("submission") },
      note: "submitted → in_review ; le dossier est attribué à l'analyste.",
    },
  ]
  if (docs.length > 0)
    review.push(
      {
        id: "review-docs",
        table: "reviews",
        op: "INSERT",
        times: docs.length,
        endpoint: "POST /v1/submissions/{submissionId}/reviews",
        title: "Décision sur chaque pièce",
        values: { submission_id: ref("submission"), target_type: "document", document_id: ref("doc_n"), decision: "accepted", reviewer_id: ref("analyst") },
        note: "Preuve des contrôles effectués. Un refus (illegible, expired, inconsistent, wrong_document, incomplete, other) rouvrirait la saisie de cette pièce seulement (request-changes).",
      },
      {
        id: "doc-accepted",
        table: "documents",
        op: "UPDATE",
        times: docs.length,
        title: "Pièces acceptées",
        values: { review_status: "accepted" },
        where: { id: ref("doc_n") },
        note: "La dernière décision sur une cible l'emporte ; les précédentes restent dans reviews.",
      },
    )

  // ---------------------------------------------------------------- 4. Validation (projection)
  const approve: PlanRow[] = []
  const parties = hasMain ? [principal, ...linked] : []
  if (hasMain) {
    approve.push({
      id: "party-main",
      table: "parties",
      op: "INSERT",
      endpoint: "POST /v1/submissions/{submissionId}/approve",
      title: `Partie principale : ${displayName(principal.nature, principal.props, principal.label)}`,
      values: {
        id: ref(principal.ref),
        tenant_id: ref("tenant_id"),
        nature: principal.nature,
        display_name: displayName(principal.nature, principal.props, principal.label),
        properties: principal.props,
      },
      note: `Seul endroit où parties est écrite. properties est indexé par la clé des propriétés (properties.key), valeurs typées (tableau pour une propriété multiple). Avant validation, GET …/party-matches propose les parties existantes qui pourraient correspondre — ${matchHint(principal)}. Si l'analyste en choisit une (action link), cette ligne devient un UPDATE parties SET properties = properties || '{…}'. Rien n'est fusionné automatiquement.`,
    })
    for (const t of linked) {
      approve.push({
        id: `party-${t.ref}`,
        table: "parties",
        op: "INSERT",
        title: `${t.label} : ${displayName(t.nature, t.props, t.label)}`,
        values: {
          id: ref(t.ref),
          tenant_id: ref("tenant_id"),
          nature: t.nature,
          display_name: displayName(t.nature, t.props, t.label),
          properties: t.props,
        },
        note: `Partie liée, décrite par un item du repeater. Rapprochement proposé : ${matchHint(t)}.`,
      })
      approve.push({
        id: `rel-${t.ref}`,
        table: "party_relations",
        op: "INSERT",
        title: `Relation ${t.relation}`,
        values: {
          id: ref(t.relRef!),
          tenant_id: ref("tenant_id"),
          from_party_id: ref(t.ref),
          to_party_id: ref(principal.ref),
          type: t.relation,
          properties: t.relProps,
          source_submission_id: ref("submission"),
        },
        note: `${displayName(t.nature, t.props, t.label)} « est ${t.relation} de » ${displayName(principal.nature, principal.props, principal.label)}. Les valeurs relation.* décrivent le lien, pas la personne. Relation figée : si une valeur change lors d'un prochain dossier, l'ancienne est close (ended_at, ended_by_submission_id) et une nouvelle est créée.`,
      })
    }
    const owners = new Map<string, { target: Target; docs: string[] }>()
    for (const d of docs) {
      const owner = docOwner.get(d.fieldPath)
      if (!owner) continue
      const entry = owners.get(owner.ref) ?? { target: owner, docs: [] }
      entry.docs.push(docName(d))
      owners.set(owner.ref, entry)
    }
    for (const { target, docs: ids } of owners.values())
      approve.push({
        id: `doc-owner-${target.ref}`,
        table: "documents",
        op: "UPDATE",
        title: `Pièces de ${displayName(target.nature, target.props, target.label)}`,
        values: { party_id: ref(target.ref) },
        where: { id: ids.map(ref) },
        note: "La pièce appartient désormais à la partie : encore valide, elle ne sera pas redemandée (EngineContext.validDocuments).",
      })
    if (input.externalRef)
      approve.push({
        id: "external-ref",
        table: "party_external_refs",
        op: "INSERT",
        title: `Référence externe ${input.externalRef.system} / ${input.externalRef.externalId}`,
        values: {
          id: ref("external_ref"),
          tenant_id: ref("tenant_id"),
          party_id: ref(principal.ref),
          system: input.externalRef.system,
          external_id: input.externalRef.externalId,
        },
        note: "La référence passée à la création de la demande de collecte est rattachée à la partie principale. Si elle désigne déjà une autre partie du tenant, l'approbation échoue (409) et l'analyste tranche.",
      })
  }
  approve.push(
    {
      id: "sub-approved",
      table: "submissions",
      op: "UPDATE",
      title: "Dossier validé",
      values: { status: "approved", approved_at: sql("now()"), party_id: hasMain ? ref(principal.ref) : null },
      where: { id: ref("submission") },
      note: "in_review → approved. La transaction entière (parties, relations, pièces, statut) passe ou échoue d'un bloc. Toute pièce exigée doit être accepted (ou remplacée par une pièce existante encore valide, reuseDocuments).",
    },
    {
      id: "req-completed",
      table: "collection_requests",
      op: "UPDATE",
      title: "Demande honorée",
      values: { status: "completed", party_id: hasMain ? ref(principal.ref) : null },
      where: { id: ref("collection_request") },
      note: "party_id n'est rempli que si la demande ne visait pas encore de partie.",
    },
    {
      id: "evt-approved",
      table: "submission_events",
      op: "INSERT",
      title: "Trace de la validation",
      values: {
        submission_id: ref("submission"),
        actor_type: "user",
        actor_id: ref("analyst"),
        action: "approved",
        after: { createdPartyIds: parties.map((t) => ref(t.ref)), relationIds: linked.map((t) => ref(t.relRef!)) },
        occurred_at: sql("now()"),
      },
      note: "Ce que la validation a créé ou mis à jour, et par qui.",
    },
  )

  const orphanDocs = docs.filter((d) => !docOwner.has(d.fieldPath)).length
  if (orphanDocs) notices.push({ level: "info", message: `${plural(orphanDocs, "pièce")} sans partie : rattachée${orphanDocs > 1 ? "s" : ""} au seul dossier.` })

  const phases: PlanPhase[] = [
    {
      id: "portal",
      title: "Pendant la saisie",
      actor: "Portail client",
      intro: "Rien n'est écrit dans le référentiel des parties : les réponses vivent dans le dossier, les fichiers dans le stockage objet.",
      rows: portal,
    },
    {
      id: "submit",
      title: "À la transmission",
      actor: "Client, bouton « Transmettre »",
      intro: "Le dossier est figé ; toujours aucune partie créée.",
      rows: submit,
    },
    { id: "review", title: "Revue", actor: "Analyste", intro: "Décisions sur les champs et les pièces, gardées comme preuves des contrôles.", rows: review },
    {
      id: "approve",
      title: "À la validation",
      actor: "Analyste, POST …/approve",
      intro: hasMain
        ? "Projection : chaque champ bindé est écrit sur la bonne partie (party.*) ou la bonne relation (relation.*). Les champs non bindés restent seulement dans le dossier."
        : "Aucune projection : aucun champ de ce chemin n'est bindé et aucune pièce n'est rattachée à une partie.",
      rows: approve,
    },
  ]

  const byNature = parties.reduce<Record<string, number>>((m, t) => {
    const k = t.nature ?? "nature inconnue"
    m[k] = (m[k] ?? 0) + 1
    return m
  }, {})
  const summary = [
    `Transmission : 1 dossier (submissions) et ${plural(docs.length, "pièce")} (documents).`,
    hasMain
      ? `Validation : ${plural(parties.length, "partie")} dans parties (${Object.entries(byNature)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ")}), ${plural(linked.length, "relation")} dans party_relations.`
      : "Validation : aucune partie créée.",
    stays.length
      ? `${plural(stays.length, "réponse")} ${stays.length > 1 ? "restent" : "reste"} uniquement dans submissions.data.`
      : "Toutes les réponses sont projetées sur une partie ou une relation.",
  ]

  return { phases, stays, notices, summary }
}

/** Pièces courantes de champs encore visibles (les autres ne partent pas avec le dossier). */
export function documentsToSubmit(documents: PreviewDocument[], fieldPaths: string[]): PreviewDocument[] {
  return fieldPaths.flatMap((p) => currentDocuments(documents, p))
}

/** Champ document d'un fieldPath ("rep[0].key" ou "key"). */
export function documentFieldOf(schema: FormSchema, fieldPath: string): DocumentField | undefined {
  const key = fieldPath.split(".").pop()!.replace(/\[\d+\]$/, "")
  for (const step of Object.values(schema.steps))
    for (const f of step.fields) {
      if (f.type === "document" && f.key === key) return f
      if (f.type === "repeater") for (const i of f.fields) if (i.type === "document" && i.key === key) return i
    }
  return undefined
}

// ---------------------------------------------------------------- Rendu SQL

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL"
  if (isRef(v)) return `:${v.$ref}`
  if (isSql(v)) return v.$sql
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`
  const json = JSON.stringify(v, (_, x) => (isRef(x) ? `:${x.$ref}` : isSql(x) ? x.$sql : x))
  return `'${json.replace(/'/g, "''")}'::jsonb`
}

export function whereToSql(where: Record<string, unknown>): string {
  return Object.entries(where)
    .map(([k, v]) => (v === null ? `${k} IS NULL` : Array.isArray(v) ? `${k} IN (${v.map(literal).join(", ")})` : `${k} = ${literal(v)}`))
    .join(" AND ")
}

export function rowToSql(r: PlanRow): string {
  const head = `${r.endpoint ? `-- ${r.endpoint}\n` : ""}${r.times && r.times > 1 ? `-- × ${r.times}\n` : ""}`
  if (r.op === "INSERT") {
    const cols = Object.keys(r.values)
    return `${head}INSERT INTO ${r.table} (${cols.join(", ")})\nVALUES (${cols.map((c) => literal(r.values[c])).join(", ")});`
  }
  const set = Object.entries(r.values)
    .map(([k, v]) => `${k} = ${literal(v)}`)
    .join(",\n    ")
  return `${head}UPDATE ${r.table}\nSET ${set}\nWHERE ${whereToSql(r.where ?? {})};`
}

export function planToSql(plan: BackendPlan): string {
  return plan.phases
    .map((p) => {
      const body = p.rows.map(rowToSql).join("\n\n")
      const tx = p.id === "approve"
      return `-- ${p.title} (${p.actor})\n${tx ? "BEGIN;\n\n" : ""}${body}${tx ? "\n\nCOMMIT;" : ""}`
    })
    .join("\n\n")
}
