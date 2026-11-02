---
title: 'Story 8.2 — Stockage des preuves hors disque local'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '872ee7374f0ec277b5ec73894ecc0562273a9d1d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** `LocalDiskProofStore` écrit les preuves de paiement CCP sur le disque local. Le système de fichiers d'une fonction serverless est éphémère et en lecture seule hors `/tmp` : sur l'environnement de recette, une preuve téléversée disparaîtrait entre deux invocations. La validation de dossier — l'un des gestes que le comité doit précisément éprouver — serait cassée, et le seed de la story 8.3 déposerait des pièces introuvables.

**Approche :** une seconde implémentation de l'interface `ProofStore` existante, parlant au stockage objet de Supabase, retenue par configuration. Les appelants ne changent pas : l'interface a été conçue pour ça depuis la story 1.5.

## Boundaries & Constraints

**Always :**
- Les cinq invariants de `LocalDiskProofStore` sont conservés, parce que ce sont eux qui protègent les données : refus d'écriture quand `detectProofFormat(bytes)` ne concorde pas avec le format déclaré ; clés opaques satisfaisant `isSafeStorageKey` (`uuid.(jpg|png|webp|pdf)`) ; `read` d'une clé inconnue retourne l'absence sans lever ; `remove` idempotent ; `put` retourne les mêmes métadonnées (clé, mime, taille, empreinte SHA-256).
- **`LocalDiskProofStore` reste le défaut.** Le stockage objet n'est retenu que lorsque la configuration le désigne explicitement. Un développeur qui clone le dépôt ne doit avoir besoin d'aucune clé.
- **Aucun appelant n'est modifié.** Le point de bascule est `getProofStore()`, qui instancie aujourd'hui `LocalDiskProofStore` en dur.
- **Le bucket est privé.** Les preuves sont des données personnelles de coureurs : elles transitent par le backend, jamais par une URL publique. `read` rend des octets, comme aujourd'hui.

**Never :**
- Ne pas ajouter `@supabase/supabase-js`. Voir la décision ci-dessous.
- Ne pas changer la forme des clés de stockage : les lignes `preuve` déjà écrites doivent rester lisibles si l'on bascule d'une implémentation à l'autre sur une même base.
- Ne pas introduire d'URL signée ni d'accès direct du navigateur au stockage : ce serait un changement de posture de confidentialité, hors de cette story.

## Décisions prises

- **`fetch` plutôt que le SDK.** L'interface tient en trois méthodes et le transport en trois appels HTTP. Ajouter une dépendance volumineuse pour cela contredit le principe de technologie ennuyeuse de la spine, alourdit le serveur et ajoute une surface de mise à jour. `fetch` est natif sur la plateforme visée.
- **La clé d'accès n'est pas disponible dans cette session.** Le projet Supabase existe (`dhxuqnikxivagvlhhrmp`, eu-west-1, 35 migrations appliquées) mais aucun bucket n'est créé et aucune clé de stockage n'est configurée. L'implémentation et ses tests se font donc contre une doublure du transport HTTP ; la vérification contre le stockage réel est un reste-à-faire explicite, pas un oubli.
- **Clé manquante : échec nommé, à la construction.** Si la configuration désigne le stockage objet sans fournir la clé ou l'URL, l'erreur nomme la variable manquante au lieu de laisser survenir un 401 opaque au premier téléversement d'un coureur.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|----------|--------------|----------------------|------------------|
| Dépôt nominal | Octets cohérents avec le format déclaré | Objet écrit sous une clé opaque ; métadonnées retournées, empreinte calculée sur les octets reçus | N/A |
| Format incohérent | Octets PDF déclarés `jpeg` | Écriture refusée, aucun appel réseau émis | Erreur, comme sur disque |
| Relecture | Clé existante | Octets identiques à ceux déposés | N/A |
| Clé inconnue | Clé absente du stockage | `null` | Aucune exception |
| Clé malformée | Chaîne ne satisfaisant pas `isSafeStorageKey` | `null`, aucun appel réseau émis | Aucune exception |
| Suppression d'un objet absent | Clé déjà supprimée | Succès silencieux | Le 404 / `NoSuchKey` du stockage est absorbé |
| Panne du stockage | Réponse 5xx ou réseau coupé | Erreur nommée mentionnant l'opération | Jamais de succès silencieux |
| Configuration incomplète | Stockage objet désigné, clé ou URL absente | Échec à la construction, nommant la variable manquante | Aucun appel réseau |
| Défaut local | Aucune configuration de stockage objet | `LocalDiskProofStore`, comportement actuel inchangé | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/proof-store.ts` -- l'interface `ProofStore`, `LocalDiskProofStore`, les helpers `sha256Hex` / `formatForMime` / `isSafeStorageKey` / `readStorageDir`, et **`getProofStore()` qui instancie `LocalDiskProofStore` en dur : c'est le point de bascule**. Mémoïsation par `globalThis`, à conserver.
- `apps/web/src/modules/inscriptions/proof-format.ts` -- `detectProofFormat`, `PROOF_MIME_BY_FORMAT`, `PROOF_EXTENSION_BY_FORMAT`. À réutiliser tel quel.
- `apps/web/src/modules/inscriptions/store.ts` -- `StoredProofFile { storageKey, mime, sizeBytes, sha256 }`, contrat de retour de `put`.
- `apps/web/src/modules/inscriptions/preuve.test.ts` et `preuve.integration.test.ts` -- suites existantes sur le dépôt de preuve. **Ne pas modifier.**
- `apps/web/src/modules/iam/env.ts` -- `readEnv`, motif de lecture de configuration.
- `apps/web/src/db/client.ts` (story 8.1) -- motif de fabrique mémoïsée pilotée par l'environnement, à suivre pour la cohérence.
- Contraintes de la table `preuve` : `mime` parmi `image/jpeg`, `image/png`, `image/webp`, `application/pdf` ; `size_bytes` entre 1 et 307200 ; une seule preuve active par coureur.
- **Routes de l'API Storage à confirmer sur la documentation officielle avant écriture** — ne pas les présumer. Deux arêtes connues : la suppression d'un objet absent peut répondre 404 / `NoSuchKey`, et des erreurs arrivent en HTTP 400 avec le vrai code dans le corps de la réponse. Les deux doivent être traitées.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/inscriptions/proof-store-objet.ts` -- implémentation `ProofStore` sur l'API Storage par `fetch`, transport injectable pour les tests, erreurs nommées par opération -- cœur de la story
- [x] `apps/web/src/modules/inscriptions/proof-store.ts` -- sélection dans `getProofStore()`, défaut disque inchangé, échec nommé si la configuration est incomplète -- point de bascule unique
- [x] `apps/web/src/modules/inscriptions/proof-store-objet.test.ts` -- couvrir chaque ligne de la matrice I/O avec une doublure de transport ; chaque assertion doit échouer si ce qu'elle garde disparaît
- [x] `.env.example` -- documenter la sélection, l'URL, la clé, le nom du bucket, et dire que la clé est secrète
- [x] `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md` -- consigner que le bucket reste à créer et la clé à poser : reste-à-faire, pas oubli

**Acceptance Criteria:**
- Étant donné un dépôt sans configuration de stockage objet, quand `getProofStore()` est appelé, alors il rend `LocalDiskProofStore` et la suite existante passe sans modification.
- Étant donné le stockage objet configuré, quand une preuve est déposée puis relue, alors les octets rendus sont identiques et l'empreinte retournée par `put` correspond à ces octets.
- Étant donné le stockage objet désigné sans clé, quand `getProofStore()` est appelé, alors l'échec nomme la variable manquante et aucun appel réseau n'est émis.
- Étant donné une preuve supprimée, quand `remove` est rappelé sur la même clé, alors l'appel réussit sans lever.

## Implementation Notes

**Routes confirmées** sur la spécification OpenAPI officielle du service
(`https://supabase.github.io/storage/api.json`, récupérée le 2026-11-01), pas présumées :
`POST` / `GET` / `DELETE` sur `/object/{bucketName}/{*}`, sécurité `bearerAuth`. Le corps
d'erreur y est typé `{ statusCode, error, message, code }` — c'est ce qui rend traitable
l'arête « HTTP 400 portant le vrai code dans le corps ». `estAbsence()` reconnaît donc à la
fois le 404 franc, `statusCode: "404"`, et les codes `NoSuchKey` / `not_found`, et rien
d'autre : un 403 de clé invalide lève, il ne passe pas pour une absence (cas testé).

**Sélection.** `createProofStore()` lit `PROOF_STORAGE_DRIVER` : absent ou `disque` → disque
local (le défaut, aucune clé requise) ; `objet` → `ObjetProofStore` ; toute autre valeur →
erreur nommée. Un repli silencieux sur le disque a été écarté : en hébergé il ferait
disparaître les preuves sans que personne s'en aperçoive. `getProofStore()` garde sa
mémoïsation `globalThis` ; une construction qui échoue n'est pas mémoïsée, poser la variable
manquante suffit à relever (cas testé). `resetProofStoreForTests()` est ajouté sur le modèle
de `resetDbClientForTests()` de la story 8.1 — ajout pur, aucune suite existante modifiée.

**Import circulaire assumé.** `proof-store.ts` importe `ObjetProofStore`, qui réimporte
`isSafeStorageKey` / `sha256Hex` / `type ProofStore`. Le cycle est inoffensif : les deux
helpers sont des déclarations de fonction (hoistées) et la classe n'est référencée qu'à
l'intérieur de `createProofStore()`, jamais à l'évaluation du module. Déplacer les helpers
aurait obligé à toucher `preuve.test.ts`, que la spec interdit de modifier.

**`corpsBinaire()`.** Une vue `Uint8Array` n'est pas assignable à `BodyInit` sous la
configuration TypeScript du dépôt ; le corps est copié dans un `ArrayBuffer` propre. Coût
négligeable — une preuve pèse au plus 300 Ko (contrainte `size_bytes` de la table `preuve`).

**`x-upsert: false`** au dépôt : les clés étant des UUID fraîchement tirés, un objet déjà
présent signale une anomalie, pas un remplacement à accepter.

**`normaliserUrlStockage()`** tolère qu'on donne l'URL du projet (`https://<ref>.supabase.co`)
plutôt que celle de l'API : le suffixe `/storage/v1` est ajouté quand le chemin est vide. Une
URL illisible est traitée comme une configuration incomplète, nommant `PROOF_STORAGE_URL`.

**Non fait, volontairement** : aucun bucket créé, aucune clé posée — indisponibles dans cette
session. Consigné comme reste-à-faire dans la note d'architecture (§V2), avec la liste des
vérifications à mener contre le stockage réel.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm typecheck && pnpm build` -- attendu : aucune erreur
- `AZZEL_REQUIRE_DB=1 pnpm test` -- attendu : suite complète au vert, `preuve.test.ts` et `preuve.integration.test.ts` non modifiés
- `git diff --stat -- '*preuve*'` -- attendu : aucune ligne

**Manual checks:**
- Vérification contre le stockage réel : impossible dans cette session faute de clé. À faire dès que le bucket et la clé existent — dépôt, relecture, suppression, et persistance après redémarrage.
