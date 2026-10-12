# apkyc POC

Constructeur no-code de formulaires KYC (Next.js 16, React 19, TypeScript), aligné sur le modèle
du monorepo apkyc : DSL v1 de `@apkyc/form-engine`, tables `forms` / `form_versions` /
`properties` / `document_types`, brouillon OpenAPI. Aucun appel réseau : une « API locale »
reproduit les endpoints dans le navigateur.

## Démarrer

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:3002.

## Scripts

- `npm run dev` : serveur de développement (port 3002)
- `npm run build` : build de production
- `npm test` : tests (vitest) du moteur, de l'API locale, du builder et de l'éditeur
- `npm run lint` : ESLint

## Le modèle suivi

- **Schéma** : le builder édite directement un `FormSchema` du DSL v1, c'est-à-dire ce qui est
  stocké dans `form_versions.schema` :
  - étapes indexées par clé, transitions `next[]` (la dernière sans condition) ;
  - conditions JSON Logic, textes `LocalizedText` (français obligatoire) ;
  - types `text`, `number`, `date`, `boolean`, `select`, `country`, `email`, `phone`, `address`,
    `document`, `repeater`, `info`, avec `multiple`.

  Le bouton `{ }` montre ce JSON. Les positions des étapes ne sont pas stockées : la disposition
  est recalculée à l'ouverture.
- **Contrôles** : le panneau « Problèmes » affiche le rapport de `validateSchema`, le même que
  `POST …/validate` et la publication. `lib/dsl` est une copie de `packages/form-engine/src`.
- **Versions** :
  - un seul brouillon par formulaire ;
  - sauvegarde automatique avec `If-Match` sur la `revision` : un autre onglet qui a enregistré
    entre-temps donne un 412 ;
  - un schéma qui n'a pas la forme du DSL n'est pas enregistré (422) ;
  - publication refusée s'il reste une erreur ; une version publiée est figée et hachée (sha256) ;
  - nouveau brouillon copié d'une version, archivage, comparaison (diff JSON).
- **Propriétés** : les 19 propriétés système de la migration 0007 (lecture seule) et les
  propriétés du tenant. Mêmes règles que l'API :
  - clé immuable, jamais réutilisée ;
  - options obligatoires pour un `select` ;
  - pas de `boolean` multiple ;
  - archivage définitif.

  Le `bind` exige le même type et la même multiplicité ; `party.nature` cible la nature figée ;
  `relation.*` n'est possible que dans un repeater.
- **Types de pièces** : les 11 types de la migration 0002 (recto verso, fraîcheur, formats).
- **Modèles** : « Souscription assurance » et « Acquisition immobilière », écrits en DSL et
  bindés aux propriétés système. Le formulaire vierge part de `createEmptySchema()`.
- **Traductions** : menu de langue dans le builder (textes modifiés dans la langue choisie),
  aperçu dans chaque langue du schéma, avertissement `missing_translation`.

## Aperçu (portail)

Le moteur d'exécution (`lib/runtime`) prototype les fonctions que le brouillon OpenAPI attribue à
form-engine et qui n'existent pas encore dans le package :

- `nextStep`, `computePath`, `validateStep`, `requiredDocuments` ;
- l'évaluation JSON Logic passe par json-logic-js, plus l'opérateur `sum`.

Une fois le dossier transmis, l'aperçu détaille les écritures en base phase par phase :

1. saisie ;
2. transmission ;
3. revue ;
4. validation, c'est-à-dire la projection vers `parties`, `party_relations`, `documents` et
   `party_external_refs`.

## Organisation

```
lib/dsl/         copie de packages/form-engine/src (DSL v1, checkStructure, validateSchema)
lib/catalog/     données des migrations : propriétés système, types de pièces, modèles
lib/local-api/   API locale (localStorage) : forms, form versions, properties, document types, form templates
lib/runtime/     exécution d'un formulaire : conditions, navigation, validation, pièces, projection
lib/builder/     aides du builder : conditions en phrases ⇄ JSON Logic, blocs métier, rapport en français
store/           zustand : éditeur (historique zundo), référentiels
components/      builder (Parcours, Étape, versions), aperçu, propriétés, shadcn/ui
```

Stockage : clé `apkyc-poc-db` du localStorage. Les formulaires de l'ancien format (`apkyc-forms`)
ne sont pas repris.
