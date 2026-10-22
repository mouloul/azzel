---
title: 'Story 4.1 — E-dossard QR hors-ligne'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '67d3130'
baseline_commit: '67d3130fa3379f0dd7c1d8f02a37a621ad3f5641'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le coureur au dossier validé n'a rien à présenter au guichet : l'e-dossard QR haute définition, lisible 30 jours sans réseau (NFR-6) et encodant le jeton unique édition — jamais le dossard nu (FR-7, AD-8) — n'existe pas.

**Approach:** 1) Jeton e-dossard par coureur validé (`coureur.jeton_edossard`, créé paresseusement et une seule fois, jamais régénéré). 2) Contrat QR + annuaire v2 dans `packages/shared` : payload `azzel-e1:<jeton>` (encode/decode défensifs), l'annuaire gagne le `jeton` par coureur et `chercherParJeton()` — le scanneur résout le QR via la réplique. 3) Page `/espace-coureur/e-dossard` (session coureur, dossier validé) : carte sombre (numéro 74 px, « HORS-LIGNE PRÊT » mono), QR SVG sur carte blanche coins 16 px (lib `qrcode` côté serveur, zéro bundle client), conseil raccourci système. 4) Service worker `sw-coureur.js` scopé `/espace-coureur` (même architecture que `sw-volontaires.js`) : le e-dossard survit réseau absent et sessions.

## Boundaries & Constraints

**Always:**
- Le QR encode `azzel-e1:<jeton>` (contrat versionné `shared`) — JAMAIS le dossard nu ; le jeton est unique par coureur/édition, généré une fois (`randomBytes` base64url 22 c.), jamais régénéré.
- Annuaire **v2** : `CoureurAnnuaire` gagne `jeton`, `estAnnuaireValide` exige version 2 + unicité des jetons, `chercherParJeton()` total (null, jamais d'exception) — l'épopée 4 scan consomme, jamais ne réinvente.
- Page e-dossard : session coureur + dossier **validé** requis (sinon message d'attente renvoyant vers la checklist) ; QR SVG généré côté serveur (haute définition, modules encre sur carte blanche coins 16 px, lisible les deux modes) ; carte sombre avec numéro de dossard 74 px quand attribué (« Numéro à venir » sinon) ; badge « HORS-LIGNE PRÊT » + texte raccourci système (écran d'accueil) ; tutoiement.
- `sw-coureur.js` : précachage shell + sous-ressources, réseau-d'abord + repli cache, anti-empoisonnement (redirigé jamais caché), aucune route hors `/espace-coureur` interceptée ; purge au logout coureur (appareil partagé).
- Jeton créé paresseusement et atomiquement (première demande, `ON CONFLICT`-safe) ; `UNIQUE` SQL ; horodatages ISO UTC.
- Accès : `requireRolePage('coureur')` ; enveloppes `shared` ; aucune donnée d'autre coureur sur cette page.

**Never:**
- Pas de scan/caméra (4.2), pas de retrait (4.3), pas de passages (4.4), pas de sync/outbox (4.5).
- Pas de modification du flux de validation 1.6 (le jeton naît à la consultation, pas à la validation) ; pas de régénération ni d'invalidation de jeton.
- Pas de lib QR côté client ni de canvas runtime (SVG serveur uniquement) ; pas de nouveau SW global (un seul scope `/espace-coureur`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Consulter (validé + numéroté) | session coureur, dossier validé, dossard attribué | Carte sombre : numéro 74 px, QR SVG sur carte blanche, badge HORS-LIGNE PRÊT, conseil raccourci | No error expected |
| Consulter (validé non numéroté) | dossard NULL | QR + « Numéro à venir » (attribution en attente du lot admin) | No error expected |
| Dossier non validé | statut ≠ validé | Message d'attente + lien vers la checklist, AUCUN QR affiché | No error expected |
| Jeton créé une fois | 2 consultations successives | Même jeton (SELECT puis INSERT atomique, jamais régénéré) | concurrence : une seule insertion |
| Hors-ligne après visite | réseau coupé, SW actif | Page servie du cache, QR et numéro intacts | jamais d'écran vide |
| Session expirée en ligne | page serveur → redirect | Redirection /connexion (le cache SW ignore les réponses redirigées) | pas d'empoisonnement |
| Payload QR | encode/decode shared | `azzel-e1:<jeton>` roundtrip ; payloads invalides → null | jamais d'exception |
| Annuaire v2 | réplique servie | `jeton` présent par coureur, version 2, jetons uniques ; v1 rejetée | re-synchro auto |
| Lookup scanner | jeton absent de l'annuaire | `chercherParJeton` → null (→ DOSSARD INCONNU en 4.2) | No error expected |
| Logout coureur | déconnexion | Purge caches `az-coureur-*` (le QR ne survit pas au compte sur un appareil partagé) | No error expected |
| Multi-org | org B | Chaque coureur ne voit QUE son e-dossard ; annuaire B séparé | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/espace-coureur/page.tsx` — page existante (checklist 1.7) : ajouter carte/lien « Ton e-dossard » vers la nouvelle page.
- `packages/shared/src/annuaire.ts` — contrat v1 (3.4) à faire évoluer en v2 (+ `jeton`, `chercherParJeton`, unicité) ; y ajouter ou cofactoriser le payload e-dossard (`edossard.ts`).
- `apps/web/src/modules/inscriptions/` — possède `coureur` (dossard 3.4, `decideDossier` 1.6, `CoureurSummary`) : colonne jeton + service d'obtention paresseuse.
- `apps/web/src/app/volontaires/` + `public/sw-volontaires.js` + `components/pwa-register.tsx` — architecture PWA/SW à répliquer pour le scope coureur (SW comportemental testé, anti-empoisonnement, purge logout).
- `apps/web/src/lib/idb-volontaires.ts` — la validation d'annuaire v2 côté poche (lireAnnuaire rejette v1 → re-synchro).
- `apps/web/src/modules/missions/store.ts` — `listCoureursAnnuaire` : sélectionner `jeton_edossard`.
- `apps/web/src/app/api/volontaires/annuaire/route.ts` — sert le contrat v2 tel quel (assemblage côté service).
- `apps/web/package.json` — ajouter `qrcode` + `@types/qrcode` (dev) — génération SVG serveur uniquement.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/edossard.ts` + évolution `annuaire.ts` (+ tests) — payload `azzel-e1:<jeton>` (EDOSSARD_PAYLOAD_VERSION, `encoderPayloadEdossard`/`decoderPayloadEdossard` défensifs) ; `ANNUAIRE_SCHEMA_VERSION = 2`, `CoureurAnnuaire.jeton` requis + unicité, `chercherParJeton()` total ; tests v1-rejeté, jetons dupliqués rejetés, roundtrip payload.
- [x] `modules/inscriptions/migrations/0023_edossard.sql` — `coureur.jeton_edossard text` nullable, CHECK longueur 22, UNIQUE partielle (WHERE NOT NULL).
- [x] `modules/inscriptions/` (store + service) — `obtenirEdossard(session)` : coureur validé de l'édition courante ; jeton créé paresseusement et atomiquement (`INSERT … ON CONFLICT` sur le coureur puis re-lecture ; jamais régénéré) ; renvoie `{ jeton, dossard, prenom, nom, epreuveNom, editionNom }` ou `null` si non validé ; tests unitaires + intégration (idempotence jeton, concurrent safe via verrou coureur, RLS).
- [x] `apps/web/src/app/espace-coureur/e-dossard/page.tsx` (+ css) — `requireRolePage('coureur')` ; dossier non validé → message d'attente + lien checklist ; sinon carte sombre (numéro 74 px via `--az-font-dossard` / « Numéro à venir »), QR SVG (qrcode serveur, carte blanche coins 16 px, modules encre, `role="img"` + `aria-label` « QR e-dossard de {prénom} »), badge « HORS-LIGNE PRÊT », texte raccourci système, tutoiement ; lien depuis `/espace-coureur`.
- [x] `apps/web/src/app/espace-coureur/layout.tsx` + `components/pwa-register-coureur.tsx` + `public/sw-coureur.js` — SW scopé `/espace-coureur` (précache `/espace-coureur/e-dossard` + sous-ressources extraites, réseau-d'abord + repli, redirigé jamais caché, statiques cache-first, page d'explication hors-ligne avec assistance, aucun autre scope) ; header `Service-Worker-Allowed: /espace-coureur` sur `/sw-coureur.js` ; enregistrement au chargement ; purge des caches `az-coureur-*` au logout coureur.
- [x] `modules/missions/` — `listCoureursAnnuaire` sélectionne `jeton_edossard` (null exclu : coureurs validés numérotés ayant consulté — un coureur sans jeton reste dans l'annuaire avec jeton null ? NON : `jeton` requis par le contrat → les validés SANS jeton sont exclus de la réplique jusqu'à consultation) ; ajuster assemblage v2 + tests.
- [ ] Tests — page (QR présent + numéro + badge ; non validé → aucun QR), SW coureur comportemental (globales stubées, pattern sw-volontaires.test.ts), intégration jeton (une seule création, relecture stable), annuaire v2 end-to-end (jeton présent, RLS).

**Acceptance Criteria:**
- Given un dossier validé, when le coureur ouvre `/espace-coureur/e-dossard` puis coupe le réseau, then la page rouvre depuis le cache avec le QR haute définition et le numéro — 30 jours plus tard ça marche toujours (cache sans expiration).
- Given le QR scanné, when il est résolu, then il encode `azzel-e1:<jeton>` — jamais le dossard nu — et `chercherParJeton` sur l'annuaire v2 retrouve le coureur.
- Given deux consultations du même e-dossard, then le jeton est strictement identique (créé une fois, jamais régénéré).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 16, edge-case-hunter 6, verification-gap 3 ; ~26 findings)
- **patch (medium)** EC2 — empoisonnement inverse : le SW cache la page d'ATTENTE (« Ton e-dossard arrive », dossier non validé) et la ressert hors-ligne au guichet après validation sans réouverture en ligne — la page QR porte un marker `data-edossard="pret"` et le SW ne cache QUE les pages le portant (install comprises).
- **patch (low)** BF1+EC4 — CHECK SQL 0023 ne vérifie que la longueur, pas l'alphabet base64url (symétrie revendiquée par shared) : migration 0024 `CHECK (jeton_edossard ~ '^[A-Za-z0-9_-]{22}$')`.
- **patch (low)** BF2+EC3 — encode/QRCode hors try/catch : un jeton corrompu ou un échec de génération produit une 500 brute — enveloppe + carte dédiée.
- **patch (low)** BF3+EC5 — purge au logout seulement si l'API répond ok : un échec réseau redirige quand même et le QR reste en Cache Storage (appareil partagé) — purge systématique.
- **patch (low)** BF5+EC1+BF6+BF7+BF16 — SW : `addAll` non protégé (quota → install échoue alors que le shell est déjà caché) ; 4xx en ligne servi depuis le cache au lieu du 404 serveur (repli réservé 5xx/réseau) ; clé de cache navigation sans query string ; limites d'`extraireSousResources` (srcset) documentées.
- **patch (low)** BF9 — `chercherParJeton` revalide TOUTE la réplique à chaque scan (O(n) + regex) : chemin chaud du guichet 4.2 — `indexerAnnuaire()` dans shared (validation unique → Map jeton→coureur), lookups one-shot conservés.
- **patch (low)** BF10 — test RLS trivialement vrai (coureur B exclu par edition_id, pas par RLS) : fixture coureur org B sur l'édition A, invisible sous GUC A.
- **patch (low)** BF11 — hex des tokens dupliqués sans verrou (e-dossard.css + QR_ENCRE) : test épinglant l'égalité avec operationsTokens.
- **patch (low)** BF12+BF15 — assertion morte (`>74<`) supprimée ; aria-label QR « prénom nom ».
- **patch (low)** VG1+VG2+VG-other — tests manquants : `purgerCachesCoureur` (pattern stub idb), lien « Ton e-dossard » de la checklist (page.test.tsx espace-coureur, présent si complet/absent sinon), branche assistance de pageHorsLigne (SW testé avec `location.search`).
- **defer** VG3 — enregistrement client du SW (effet useEffect) non vérifiable sans harnais e2e (convention repo, même trou qu'en 3.3).
- **false** BF4 — pnpm-lock « absent du diff » : artefact de génération du diff de revue (lockfile exclu pour lisibilité) ; le lock est bien modifié dans l'arbre et sera commis.
- **false** BF8 — `LIMIT 1` sans ORDER BY : l'invariant `UNIQUE (account_id, edition_id)` (migration 0002) rend la ligne unique — lecture déterministe.
- **rejeté (low)** BF13 — fixtures jeton « à la main » par fichier : lisibles et locales, un helper partagé inter-fichiers est du churn sans gain.
- **false** BF14 — sprint-status `in-progress` : état piloté par le workflow, passé en review à la clôture.
- **false** EC6(claim) — spec « ON CONFLICT » vs code `FOR UPDATE + UPDATE WHERE NULL` : déviation documentée (commentaires du store + rapport), garanties identiques (création unique, jamais régénérée).

## Design Notes

- Jeton paresseux plutôt qu'à la validation : le flux 1.6 reste intouché (contrat 3.1/3.2), et « validé mais jamais consulté » n'a pas besoin de jeton — l'annuaire n'expose que les jetons existants.
- Le coureur non numéroté voit quand même son QR (le jeton existe dès consultation) : le guichet résoudra le dossard dès l'attribution ; « Numéro à venir » documente l'état.
- SVG serveur plutôt que canvas client : haute définition native, zéro JS, zéro lib embarquée — le « 30 jours » repose sur le cache SW, pas sur du runtime.
- L'unicité des jetons dans l'annuaire est une garantie du CONTRAT (doublons rejetés par `estAnnuaireValide`) — défense en profondeur de l'UNIQUE SQL.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0023, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (shared v2 + payload, jeton, page, SW coureur, annuaire v2).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé (qrcode serveur-only).

**Manual checks (if no CLI):**
- Espace coureur validé → e-dossard (QR + numéro) → DevTools offline + recharger → page intacte ; ajouter à l'écran d'accueil → mode avion → QR lisible ; scanner le QR avec l'appareil photo → la chaîne `azzel-e1:…` s'affiche (pas le numéro).
