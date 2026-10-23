---
title: 'Story 6.2 — Activation du suivi GPS opt-in'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'bc641e6'
baseline_commit: 'bc641e6b7cdb9e7c9228e0e97bfa2a41bd39ee88'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-6-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les proches ne peuvent pas suivre la course : aucune position GPS n'existe ni côté app (aucun suivi, aucune outbox) ni côté serveur (aucun module tracking, aucune table position), et la carte publique de l'épopée 7 restera vide.

**Approach:** 1) Contrat `tracking` dans `packages/shared` : `PositionTerrain` (lat/lon + `capteA` ISO UTC + clé d'idempotence `appareil:capteA`), lot ≤ 200, réponses accepté/déjà-connu/rejeté, constante `INTERVALLE_POSITION_MS = 7 min` (jamais adaptative, SM-C2). 2) Module backend `modules/tracking` : migration 0030 (`appareil_coureur` jeton hashé pattern 0025 + `position` append-only clé unique + `offset_estime_ms`), `POST /api/coureur/tracking/appareil` (session → jeton brut une fois), `POST /api/coureur/tracking/sync` (Bearer jeton appareil SEUL — indépendant des sessions, la outbox survit à AD-5 ; serveur recalcule la clé : l'appareil propose, le serveur dispose). 3) App : écran « Suivi » opt-in explicite (toggle), `watchPositionAsync` Balanced/`timeInterval` 7 min (dev build, plugin expo-location arrière-plan), outbox SQLite append-only + marquage `envoyees`, sync par lots au retour réseau avec ré-enregistrement d'appareil sur 401, bandeau « ◷ N positions en attente » → « ✓ envoyés — file : 0 », journal sync accessible. Désactivé = littéralement rien d'enregistré.

## Boundaries & Constraints

**Always:**
- Opt-in explicite : aucun watcher, aucune insertion outbox, aucune requête sync tant que le coureur n'a pas activé ; « Désactivé : rien n'est enregistré » affiché en toutes lettres et VRAI.
- Fréquence fixe 7 min, précision équilibrée (`Accuracy.Balanced`) — jamais augmentée pour embellir la carte (SM-C2) ; la constante vit dans `shared` et n'est paramétrable nulle part.
- Horodatages ISO 8601 UTC (`capteA`), affichage local ; clé d'idempotence naturelle = `appareilId:capteA` ; le serveur RECALCULE la clé du lot reçu (jamais confiance au client).
- Jeton d'appareil : 256 bits base64url, stocké HASHÉ serveur, retourné brut une seule fois, révocable (`revokedAt`) ; la outbox et le jeton survivent à une révocation de session (AD-5) ; logout / changement de compte → purge jeton + outbox.
- Append-only strict : positions insérées `INSERT OR IGNORE` (cle PRIMARY KEY), marquage dans une table séparée `envoyees` ; rejouable après échec ; journal sync borné (lots, rejets, offsets horloge).
- Lot ≤ `SYNC_POSITION_MAX_LOT` (200) ; 413 → découpage réactif en moitiés ; garde taille de corps serveur (1 Mo) ; enveloppes d'erreur `tracking.*` côté sync, tutoiement côté écran.
- RLS : `position` lisible uniquement sous GUC organisation ; lookup jeton par hash hors GUC (pattern 0025/0011).
- Permission refusée → suivi silencieusement inactif, aucune culpabilisation, guide accessible (écran 6.3 futur) ; rétablissement possible depuis l'écran.

**Never:**
- Pas de carte publique ni d'exposition des positions (story 7.3) ; pas de guide permission iOS dédié (6.3) ; pas de pédagogie batterie/rappel J-7 (6.4).
- Pas de fréquence dynamique, pas de localisation au premier plan continue, pas de précision Haute par défaut.
- Pas de lecture directe des positions depuis un canal public sans passer par le backend (AD-7) ; pas de SDK Supabase côté app.
- Pas de position capturée hors opt-in, même « pour tester » ; aucun envoi de position en dehors du canal sync jeton appareil.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Activation | toggle activé, permissions accordées | watcher démarré (Balanced, 7 min), 1re position → outbox, bandeau N=1 | permission refusée → inactif silencieux, message sans culpabilisation |
| Désactivation | toggle désactivé | watcher stoppé, AUCUNE insertion ni requête, texte « rien n'est enregistré » | N/A |
| Capture intervalle | 2 ticks à 7 min | 2 lignes outbox, clés `appareil:capteA` distinctes | doublon même capteA → INSERT OR IGNORE |
| Sync lot | réseau revenu, 250 positions | 2 lots ≤200, marquages `envoyees`, bandeau « ✓ file : 0 » | hors-ligne → outbox conservée, retry |
| Idempotence serveur | même lot rejoué | déjà-connu pour chaque clé, aucune nouvelle ligne | N/A |
| Lot > 200 | client envoie 250 | 413 tracking.lot_trop_grand → découpage client en moitiés | retry |
| Jeton appareil 401 | jeton révoqué/invalide | ré-enregistrement via session puis rejeu du lot | session aussi morte → sync différée, hors-ligne apparent |
| Session révoquée (AD-5) | login web après app | sessions interactives mortes mais sync positions CONTINUE (jeton indépendant) | N/A |
| Position invalide | lat hors [-90,90] | rejetée par la garde client (jamais insérée) ; serveur rejette aussi | reste hors outbox / réponse rejeté |
| Changement de compte | autre email se connecte | outbox + jeton appareil purgés avant toute nouvelle capture | N/A |
| Corps trop grand | lot > 1 Mo | 413 tracking.corps_trop_grand | découpage client |
| Multi-org | org B | positions cloisonnées par organisation (RLS/GUC) | fuite impossible |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/api/volontaires/appareil/route.ts` + `sync/route.ts` + `modules/chrono/service.ts` (`enregistrerAppareil`, `verifierJetonAppareil`) — gabarit exact jeton appareil + sync Bearer.
- `modules/chrono/migrations/0025_chrono_terrain.sql` — gabarit tables `appareil` (hash hors GUC, pattern 0011) et `terrain_evenement` (append-only, cle UNIQUE, offset) → décliner en `appareil_coureur` + `position` (0030).
- `apps/web/src/modules/inscriptions/migrate.ts` — `MIGRATION_DIRS` : ajouter le dossier tracking ; dernier numéro 0029 → 0030.
- `packages/shared/src/terrain.ts` + `datetime.ts` (`estHorodatageValide`, ISO UTC) — gabarit contrat + gardes à décliner en `tracking.ts`.
- `apps/web/src/lib/sync/sync-terrain.ts` + `apps/web/src/lib/idb-volontaires.ts` — modèle moteur de sync (tranches ≤ max, 413 moitiés, register-then-retry, journal borné) à transposer côté SQLite.
- `apps/runners/src/api-client.ts` (`ApiErreur`, timeout, fetchImpl injectable), `src/orchestration.ts` (ports injectés), `src/auth-store.ts` (SecureStore/AsyncStorage, `oublierSession` vs `purgerAuth`), `src/offline-cache.ts` (pattern purge) — y brancher jeton appareil (`azzel.jeton_appareil`) et purge au changement de compte.
- `apps/runners/src/app-state.ts` + `App.tsx` — écran `'suivi'` (+ journal), accès depuis dossier et e-dossard.
- `apps/runners/src/ecrans/ui.tsx` (`Bouton` disabled, `Carte`, bandeaux) + `theme.ts` (`syncPending`/`syncSent`) — bandeau sync.
- `apps/runners/app.json` — plugin `expo-location` (`isAndroidBackgroundLocationEnabled`, `isIOSBackgroundLocationEnabled`) ; installer `expo-sqlite` (~58).
- `apps/web/src/app/api/coureur/guard.ts` (6.1) — sous-routes tracking sous guard coureur ; sync sous Bearer jeton appareil uniquement.
- Tests : `apps/web/src/app/api/volontaires/sync/route.test.ts` (unitaire) + `coureur-api.integration.test.ts` + `chrono.integration.test.ts` (intégration) ; runners vitest node, mocks in-file (expo-sqlite à mocker pareil).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/tracking.ts` (+ tests) — contrat : `PositionTerrain` (gardes `estPositionValide` lat [-90,90], lon [-180,180], `capteA` ISO UTC strict), `cleIdempotencePosition(appareilId, capteA)`, `LotSyncPosition {appareilId, positions}`, `ReponseLotPosition` (resultats/compteurs/recuA), `SYNC_POSITION_MAX_LOT=200`, `INTERVALLE_POSITION_MS=7*60_000`, `JOURNAL_SUIVI_MAX_ENTREES=100` ; export index.
- [x] `apps/web/src/modules/tracking/` — `domain.ts`, `errors.ts` (`tracking.jeton_invalide|appareil_revoked|corps_invalide|corps_trop_grand|lot_trop_grand|position_invalide`), `store.ts` (`enregistrerAppareilCoureur` find-or-create hash, `trouverAppareilParHash` hors GUC, `insererLotPositions` ON CONFLICT DO NOTHING + `last_sync_at` + offset, dans withOrg), `service.ts` (décisions, recalcule les clés).
- [x] `apps/web/src/modules/tracking/migrations/0030_tracking.sql` + inscription dans `MIGRATION_DIRS` — `appareil_coureur` (UNIQUE jeton_hash, UNIQUE (organisation_id, account_id, appareil_client), revoked_at, last_sync_at, RLS hash hors GUC) ; `position` (append-only, cle_idempotence UNIQUE, lat/lon numeric CHECK bornes, capte_at, recu_a, offset_estime_ms, index, RLS stricte).
- [x] `apps/web/src/app/api/coureur/tracking/appareil/route.ts` (+ tests) — POST session coureur `{appareilClient}` → `{ jeton }` brut une fois (find-or-create AVEC rotation du jeton au ré-enregistrement, pattern 0025).
- [x] `apps/web/src/app/api/coureur/tracking/sync/route.ts` (+ tests) — POST Bearer jeton appareil seul ; garde corps 1 Mo ; lot ≤ 200 ; réponse `ReponseLotPosition` ; erreurs enveloppe `tracking.*`.
- [x] Intégration `tracking-api.integration.test.ts` — sync end-to-end vraie base : accepté/déjà-connu, idempotence, jeton survit à la révocation de session (AD-5), appareil révoqué → 401, RLS multi-org, lot > 200 → 413.
- [x] `apps/runners/package.json` + `app.json` — installer `expo-sqlite` ; plugin expo-location arrière-plan iOS+Android.
- [x] `apps/runners/src/tracking/outbox-sqlite.ts` (+ tests, expo-sqlite mocké) — schéma `positions` (cle PRIMARY KEY, lat, lon, capte_a, ajoute_a) append-only INSERT OR IGNORE + `envoyees(cle)` + `journal` borné ; `listerEnAttente`, `marquerEnvoyees`, `compterEnAttente`, `purgerOutbox`.
- [x] `apps/runners/src/tracking/suivi-store.ts` (+ tests) — préférence opt-in AsyncStorage (`azzel.suivi.optin`), jeton appareil SecureStore (`azzel.jeton_appareil`), `appareilClient` stable (UUID AsyncStorage) ; oublierSession garde jeton+outbox, purgerAuth/changement de compte purge tout.
- [x] `apps/runners/src/tracking/moteur.ts` (+ tests, expo-location mocké) — `demarrerSuivi`/`arreterSuivi` : `watchPositionAsync` Balanced + timeInterval INTERVALLE_POSITION_MS + deferredUpdates ; garde `estPositionValide` avant insertion ; AUCUN code d'enregistrement hors opt-in.
- [x] `apps/runners/src/tracking/sync-positions.ts` (+ tests) — moteur de sync : tranches ≤ 200, 413 → moitiés, 401 jeton → ré-enregistrement puis rejeu, écrit journal (offsets `recuA - capteA`), jamais d'exception non gérée.
- [x] `apps/runners/src/ecrans/suivi.tsx` + `journal-sync.tsx` + câblage `App.tsx`/`app-state.ts` — écran Suivi (toggle opt-in explicite, état permissions, bandeau « ◷ N positions en attente » → « ✓ envoyés — file : 0 » cliquable → journal, texte littéral « Désactivé : rien n'est enregistré »), accès depuis dossier et e-dossard ; sync déclenchée au premier plan et après capture.
- [x] Tests matrice — chaque rangée ci-dessus couverte par au moins un test (unitaire runners/web ou intégration).

**Acceptance Criteria:**
- Given l'app installée (6.1), when le coureur active le suivi, then des positions équilibrées sont capturées toutes les 7 min, stockées hors-ligne, et envoyées en lot au retour du réseau (FR-18, AD-2) sans jamais augmenter la fréquence.
- Given le suivi désactivé, when l'app tourne, then aucun watcher n'est actif, aucune ligne n'est insérée, aucune requête sync ne part — le texte « rien n'est enregistré » est littéral.
- Given une session coureuse révoquée par un login web (AD-5), when l'app synchronise, then la sync positions continue (jeton d'appareil indépendant) et la outbox survit.
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : intervalle fixe 7 min (milieu de la fourchette 5–10, batterie d'abord) ; SQLite via expo-sqlite plutôt qu'AsyncStorage pour l'outbox (append-only, volumétrie) ; tables dédiées `appareil_coureur`/`position` dans un nouveau module tracking (pas de réutilisation des tables volontaires) ; marqueur d'envoi en table séparée pour préserver l'append-only.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration tracking)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | `AbortSignal.timeout` (sync-positions.ts:292,342) inexistant en Hermes/RN (le propre api-client.ts l'a exclu) → chaque sync échoue sur appareil réel, positions jamais envoyées. | patch |
| 2 | medium | Courses `demarrer`/`arreter` : deux demarrer concurrents posent 2 watchers (garde avant await) ; arreter pendant demarrer en vol laisse un watcher fuyant ; enCours non réinitialisé sur rejet (moteur.ts). | patch |
| 3 | medium | `enregistrerPosition` (SQLite sync) sans try/catch dans le callback natif → exception non gérée dans le watcher (moteur.ts:99). | patch |
| 4 | medium | `requestBackgroundPermissionsAsync` rejetée (pas seulement refusée) propage → demarrer jette, suivi mort bien que l'avant-plan soit accordé (moteur.ts:145). | patch |
| 5 | medium | `lireAppareilClient` régénère un UUID par appel en cas de stockage HS → appareilId capture ≠ appareilId sync → 400 permanent + une ligne appareil_coureur par enregistrement (suivi-store.ts:85). | patch |
| 6 | medium | Race logout/sync en vol : `enregistrerAppareilPourSync` terminant après la purge réécrit le jeton du compte précédent → positions attribuées au mauvais coureur. | patch |
| 7 | low | `tokenRef` muté dans l'updater setEtat (effet de bord, double-invoke StrictMode) — assigner hors updater. | patch |
| 8 | medium | Garde DoS 1 Mo : requête chunked sans content-length contourne la borne et est parsée en entier (sync/route.ts:45) → rejeter l'absence d'en-tête (411). | patch |
| 9 | low | Route appareil sans garde de taille de corps (session-auth DoS), incohérent avec sync. | patch |
| 10 | low | numeric(9,6) arrondit au-delà de 6 décimales : perte < 0,11 m — négligeable pour la carte. | rejeté |
| 11 | low | `version: 1` codé dur dans sync versPositionTerrain (vs POSITION_SCHEMA_VERSION) — bump de schéma = rejet silencieux du replay. | patch |
| 12 | medium | 400 serveur (appareil incohérent, corps invalide) maquillés en `reseau` → retry infini, jamais journalisé, file jamais vidée (sync-positions.ts). | patch |
| 13 | medium | `deferredUpdates` exigé par la tâche, absent des options du watcher, et le titre du test prétend le couvrir (0 assertion) — livrer l'option + asserter, ou corriger la spec. | patch |
| 14 | low | Docstring « absorbe TOUT, jamais d'exception » contredite par le test même qui attend un rejet — corriger le contrat écrit. | patch |
| 15 | false | « Jamais régénéré sinon » (texte de tâche) vs rotation UPSERT : la matrice GELÉE exige register-then-retry après 401, impossible sans rotation (jeton brut non relisible) — erreur de rédaction de la tâche, corrigée dans le Spec Change Log. | spec-texte |
| 16 | low | Sync multi-lots en vol continue après désactivation — vérifier l'opt-in entre les lots (boucle). | patch |
| 17 | medium | Arrière-plan refusé (« Pendant l'utilisation ») : l'écran affiche « partagée toutes les 7 min » alors qu'un téléphone verrouillé ne capturera rien — état distinct + texte honnête requis. | patch |
| 18 | low | Désactivé avec N>0 en attente : bandeau caché, positions dans un trou noir invisible — afficher le bandeau + expliquer (départ à la réactivation, par conception : aucune sync hors opt-in). | patch |
| 19 | low | `ecrireOptin` échec avalé : l'écran dit « activé », au redémarrage le suivi est coupé à l'insu — propager l'erreur à l'écran. | patch |
| 20 | low | Accumulation de lignes appareil_coureur orphelines au fil des logout/login (jetons anciens valides à vie) : gestion/révocation d'appareils = décision produit ultérieure. | différé |
| 21 | low | « Retour réseau » seulement simulé (AppState + post-capture) : délai max 7 min acceptable pour FR-18 ; listener NetInfo = amélioration. | différé |
| 22 | low | `offsetMoyenLot` peut écrire NaN si capteA corrompu en base locale — garde directe. | patch |
| 23 | low | Nom ambigu `appareilId` : réponse enregistrement (UUID ligne serveur) vs corps sync (UUID client) — renommer le champ de réponse. | patch |
| 24 | low | Route sync : corps parsé/validé AVANT le Bearer — inverser (401 d'abord). | patch |
| 25 | medium | Câblage App.tsx suivi non testé (toggle/logout/changement de compte — l'invariant opt-in littéral ne tient que par de la colle invisible) ; changement de compte ne stoppe pas le moteur ; échec de purge outbox avalé. | patch |
| 26 | medium | Adaptateur HTTP sync (`creerPosterLotPositions`/`enregistrerAppareilPourSync`) : zéro test — mapping 401 révoqué/413/200 malformé exécuté nulle part. | patch |
| 27 | low | `last_sync_at` ignoré sur lot vide/entièrement rejeté — déplacer le UPDATE hors du if. | patch |

## Spec Change Log

- 2026-10-23 revue 1 : la tâche appareil disait « find-or-create, jamais régénéré sinon » — contradit par la matrice gelée (401 jeton → ré-enregistrement puis rejeu, impossible sans rotation : le jeton brut n'est retourné qu'une fois, seul le hash vit en base). Amendé : « find-or-create AVEC rotation du jeton au ré-enregistrement (pattern 0025), jeton brut retourné une seule fois ». L'état connu-evité : un ré-enregistrement qui rendrait le jeton précédent actif ; KEEP : UPSERT atomique + drapeau `rotation`, refus dédié si révoqué.
