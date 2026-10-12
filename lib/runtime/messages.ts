/** Messages de saisie affichés au client final (repli sur le français). */
interface RuntimeMessages {
  required: string
  invalidText: string
  pattern: string
  invalidNumber: string
  min: (n: number) => string
  max: (n: number) => string
  invalidDate: string
  invalidEmail: string
  invalidPhone: string
  invalidCountry: string
  invalidOption: string
  invalidAddress: string
  minItems: (n: number) => string
  maxItems: (n: number) => string
  documentRequired: string
  documentFace: (face: string) => string
}

const FR: RuntimeMessages = {
  required: "Ce champ est obligatoire.",
  invalidText: "Saisissez un texte.",
  pattern: "Le format n'est pas valide.",
  invalidNumber: "Saisissez un nombre valide.",
  min: (n) => `La valeur minimale est ${n.toLocaleString("fr-FR")}.`,
  max: (n) => `La valeur maximale est ${n.toLocaleString("fr-FR")}.`,
  invalidDate: "Saisissez une date valide.",
  invalidEmail: "Saisissez une adresse e-mail valide.",
  invalidPhone: "Saisissez un numéro de téléphone valide (format international).",
  invalidCountry: "Choisissez un pays.",
  invalidOption: "Choisissez une valeur de la liste.",
  invalidAddress: "Complétez l'adresse : rue, code postal, ville et pays.",
  minItems: (n) => `Ajoutez au moins ${n} élément${n > 1 ? "s" : ""}.`,
  maxItems: (n) => `${n} élément${n > 1 ? "s" : ""} au maximum.`,
  documentRequired: "Déposez la pièce demandée.",
  documentFace: (face) => `Déposez aussi le ${face === "back" ? "verso" : "recto"}.`,
}

const EN: RuntimeMessages = {
  required: "This field is required.",
  invalidText: "Enter some text.",
  pattern: "The format is not valid.",
  invalidNumber: "Enter a valid number.",
  min: (n) => `The minimum value is ${n.toLocaleString("en")}.`,
  max: (n) => `The maximum value is ${n.toLocaleString("en")}.`,
  invalidDate: "Enter a valid date.",
  invalidEmail: "Enter a valid email address.",
  invalidPhone: "Enter a valid phone number (international format).",
  invalidCountry: "Choose a country.",
  invalidOption: "Choose a value from the list.",
  invalidAddress: "Complete the address: street, postal code, city and country.",
  minItems: (n) => `Add at least ${n} item${n > 1 ? "s" : ""}.`,
  maxItems: (n) => `${n} item${n > 1 ? "s" : ""} at most.`,
  documentRequired: "Upload the requested document.",
  documentFace: (face) => `Also upload the ${face === "back" ? "back" : "front"} side.`,
}

export function runtimeMessages(locale: string): RuntimeMessages {
  return locale === "en" ? EN : FR
}
