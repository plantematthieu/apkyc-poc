# lib/dsl

Copie de `packages/form-engine/src` du monorepo apkyc (DSL des formulaires, version 1) :
types, `checkStructure`, `validateSchema`, analyse JSON Logic, rapport de validation.

Seule différence avec l'original : les imports relatifs n'ont pas l'extension `.js`
(Turbopack ne résout pas `./types.js` vers `./types.ts`).

Ne pas corriger ici : corriger dans `packages/form-engine`, puis recopier les fichiers
(et retirer de nouveau les `.js`).
