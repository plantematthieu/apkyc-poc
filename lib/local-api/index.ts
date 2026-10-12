/**
 * API locale du POC : mêmes ressources, mêmes règles et mêmes erreurs que le brouillon
 * OpenAPI, sans appel réseau. Chaque fonction porte le nom de l'operationId correspondant ;
 * la remplacer par un appel HTTP ne change pas les écrans.
 */
export * from "./types"
export * from "./problem"
export { localize } from "./localize"
export { toCatalog } from "./catalog"
export { onTablesChange, resetTables, CURRENT_USER_ID } from "./db"
export { listForms, getForm, createForm, updateForm, archiveForm } from "./forms"
export {
  listFormVersions,
  getFormVersion,
  createFormVersion,
  saveFormVersionSchema,
  validateFormVersion,
  publishFormVersion,
  archiveFormVersion,
  diffFormVersions,
  checkSchema,
} from "./form-versions"
export { listProperties, getProperty, createProperty, updateProperty, archiveProperty } from "./properties"
export { listDocumentTypes } from "./document-types"
export { listFormTemplates } from "./form-templates"
