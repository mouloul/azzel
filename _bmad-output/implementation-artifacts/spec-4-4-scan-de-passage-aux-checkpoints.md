---
title: 'Story 4.4 — Scan de passage aux checkpoints'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '493f387'
baseline_commit: '493f387d671ec8ed94152612a5be65ab8f1d6a50'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En zone blanche, le scanneur ne peut pas enregistrer les passages : le mode checkpoint du scanner (4.2) ne dédoublonne qu'en session, aucun `Passage` (e-dossard → checkpoint, horodatage local) n'est persisté — le chrono de la course sera incomplet (FR-13, NFR-3 socle).

**Approach:** Le mode checkpoint du scanner persiste ses passages dans l'outbox (même store, clé d'idempotence `passage:v1:appareil:édition:jeton:checkpoint`) : le **checkpoint est la mission scan en cours** (`missionScanEnCours` — son id fait référence, son titre s'affiche) ; contrat `PassageTerrain` versionné dans `shared` (clé naturelle édition+coureur+checkpoint, AD-6/AD-8). Dédoublonnage persistant **par coureur ET par checkpoint** : même coureur même checkpoint → doublon (heure du premier) ; même coureur à un AUTRE checkpoint → nouveau succès. Gabarit `traiterScanRetrait` : décision immédiate, append optimiste avec rollback, séquence dernier-scan-gagne. Gating du mode par la mission scan (comme le retrait).

## Boundaries & Constraints

**Always:**
- Libellés EXACTS (FR-13) : succès « ✓ Passage enregistré — dossard N · HH:MM:SS » (heure appareil DANS le libellé), doublon « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » (heure du PREMIER passage), inconnu « ⚠ DOSSARD INCONNU — revérifier » + appel PC — voyant UX-DR-7 inchangé (≥ 96 px, ≥ 24 px/800, clignotement borné).
- Clé naturelle du Passage : **(édition, coureur, checkpoint)** (AD-6, AD-8) — versionnée dans `shared`, jamais réinventée ; l'appareil s'y ajoute pour la clé d'idempotence locale (AD-2), l'arbitrage serveur premier-reçu-fait-foi arrive en 4.5 (AD-3).
- Le checkpoint EST la mission `scan_checkpoint` en cours (id = référence, titre = libellé du badge) — V1 documentée, aucun changement de schéma missions.
- Dédoublonnage persistant cross-session contre l'outbox (index `${jeton}:${checkpointId}` → premier passage) ; même coureur, autre checkpoint → succès.
- Confirmation < 1 s : décision/voyant/bip SYNCHRONES (gabarit 4.3), append en arrière-plan, rollback + note « NON enregistré » si IDB refuse.
- Mode checkpoint gated par la mission scan (URL directe sans mission → redirection douce, message dédié — cohérent avec le retrait : le checkpoint identifie le passage).
- Payload minimal (NFR-7) : version, type `passage`, editionId, jeton, checkpointId, horodatage, appareilId — jamais de nom.
- Purge logout conserve outbox/appareil (AD-5, inchangé) ; SW : chaque variante sous sa clé (déjà le cas, tests).

**Never:**
- Pas d'envoi/réseau ni bandeau sync ni journal (4.5) ; pas d'arbitrage serveur ni d'annulation (épopée 5) ; pas de table chrono côté serveur (4.5).
- Pas de nouvelle page : le mode checkpoint du scanner existant, même moteur/écrans/bips.
- Pas de suppression ni d'édition locale d'un passage (append-only strict).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Passage (nominal) | QR connu, 1ᵉʳ passage à ce checkpoint | « ✓ Passage enregistré — dossard 74 · 07:05:09 », bip succès, événement appendé | IDB refusée → note « NON enregistré » + rollback |
| Doublon même checkpoint | re-scan même coureur même checkpoint | « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », bip doublon, aucun événement | No error expected |
| Autre checkpoint | même coureur, mission scan différente (autre checkpointId) | NOUVEAU succès (passage distinct) | No error expected |
| Inconnu | payload invalide/jeton absent | « ⚠ DOSSARD INCONNU — revérifier » + Appeler le PC, rien en outbox | No error expected |
| Doublon cross-session | déconnexion/reconnexion puis re-scan | Toujours doublon (outbox persistant) | No error expected |
| Mode sans mission scan | URL /scan directe sans mission scan_checkpoint | Redirection douce vers la fiche + message dédié | No error expected |
| Échec état missions | getMissionsVolontaireState échoue | Redirection silencieuse (distinguer échec/absence, pattern 4.3) | No error expected |
| Hors-ligne total | aucun réseau | Passages enregistrés localement, doublons détectés — 4.5 remontera | No error expected |
| Horloge voyant | heure affichée | Heure appareil locale, mono (AD-3 : donnée brute, jamais un temps de classement) | No error expected |

</frozen-after-approval>

## Code Map

- `packages/shared/src/terrain.ts` — contrat retrait (4.3) : y ajouter `PassageTerrain` sur le même gabarit (version, type, garde défensive, clé d'idempotence).
- `apps/web/src/lib/scan/etats-scan.ts` — `resoudreRetrait`/`traiterScanRetrait` (4.3) : y adjoindre `resoudrePassage` + `traiterScanPassage` (même gabarit : décision synchrone, append optimiste injectable, rollback, note).
- `apps/web/src/lib/idb-volontaires.ts` — `ajouterRetrait`/`retraitsParJeton` : mêmes fonctions pour les passages (même store outbox, préfixe de clé distinct) + index `${jeton}:${checkpointId}`.
- `apps/web/src/app/volontaires/scan/` — mode checkpoint (défaut) : checkpointId depuis la mission scan en cours, gating + redirection douce (pattern retrait), libellé succès avec heure intégrée.
- `apps/web/src/lib/scan/mission-scan.ts` — `missionScanEnCours` (déjà) fournit le checkpoint.
- `apps/web/src/app/volontaires/volontaires-pwa.tsx` — CTA passages inchangé (gating déjà par mission scan) ; message dédié du mode sans mission.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/terrain.ts` (+ tests) — `PASSAGE_SCHEMA_VERSION = 1`, `PassageTerrain { version, type: 'passage', editionId, jeton, checkpointId, horodatage, appareilId }`, `estPassageValide()` (gabarit retrait : ISO UTC strict, jeton, identifiants), `cleIdempotencePassage(appareilId, editionId, jeton, checkpointId)` — jamais de collision avec les clés retrait.
- [x] `apps/web/src/lib/idb-volontaires.ts` (+ tests) — `ajouterPassage()`, `listerPassages()`, `passagesParJetonCheckpoint()` (Map `${jeton}:${checkpointId}` → horodatage du PREMIER) ; append idempotent même clé (gabarit retrait) ; retraits et passages cohabitent dans le store outbox sans interférer.
- [x] `apps/web/src/lib/scan/etats-scan.ts` (+ tests) — `resoudrePassage(payload, index, passagesExistants, checkpointId)` pur (succès / doublon même checkpoint avec heure du premier / inconnu) + `traiterScanPassage(...)` (gabarit `traiterScanRetrait` : décision synchrone, index optimiste, append injectable, rollback + note, retour immédiat) ; libellés EXACTS (« ✓ Passage enregistré — dossard N · HH:MM:SS », « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS »).
- [x] `apps/web/src/app/volontaires/scan/` (page + client + tests) — mode checkpoint : checkpointId = mission scan en cours (redirect douce dédiée sans mission, silencieuse sur échec d'état — pattern 4.3), badge = titre de la mission, libellé succès avec heure, câblage `traiterScanPassage` + séquence ; TEXTES_SCAN.checkpoint ajustés (passage enregistré, hint doublon).
- [x] `volontaires-pwa.tsx` + tests — message dédié « passage-sans-mission » (gabarit retrait) ; CTA passages inchangé.
- [ ] Tests — matrice passage complète (nominal/doublon même checkpoint/autre checkpoint succès/inconnu/cross-session), append idempotent, coexistence outbox, gating + redirections, libellés exacts épinglés.

**Acceptance Criteria:**
- Given un annuaire chargé et une mission scan en cours, when le scanneur scanne un coureur puis le rescanne puis scanne un autre coureur, then « ✓ Passage enregistré — dossard N · HH:MM:SS » (< 1 s, bip succès), « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » (bip doublon, rien dupliqué), et un nouveau succès — tout persisté cross-session dans l'outbox.
- Given le même coureur scanné depuis un AUTRE poste (mission scan différente), when le scan réussit, then c'est un passage DISTINCT (clé naturelle édition+coureur+checkpoint) — l'arbitrage premier-reçu-fait-foi est différé à 4.5 (AD-3).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 9, edge-case-hunter 3, verification-gap 1 ; ~13 findings)
- **patch (medium)** EC1 — note de refus perdue sur doublon optimiste : append échoue APRÈS qu'un rescan a affiché « DÉJÀ PASSÉ » (entrée optimiste) — le rollback retire l'entrée mais la note « NON enregistré » n'atteint jamais le voyant doublon (garde de séquence) : le PC voit « DÉJÀ PASSÉ » pour un passage jamais persisté. `cleComposite` portée par le résultat doublon, le refus l'expose, le client applique la note au voyant doublon correspondant ; tests purs.
- **patch (low)** BF1+EC3(deletion)+VG-other — code mort 4.2 (`resoudreScan`, `resoudreEtEnregistrer`, `libelleVoyantScan`, `ResultatScan`, `DejaVus`) sans consommateur production après le basculement : suppression + tests retirés (le dédoublonnage de session est remplacé par les orchestrateurs persistants).
- **patch (low)** BF3 — asymétrie édition clé stockage/index : morte par construction (jeton globalement UNIQUE par coureur/édition — deux éditions = deux jetons distincts, la clé `${jeton}:${checkpointId}` ne peut pas collisionner inter-éditions) : documenté dans cleIndexPassage.
- **patch (low)** BF4 — repli hors fenêtre du gating vs « en cours » : comportement assumé (préparation avant la course), commentaires de scan/page.tsx corrigés (« mission du type, fenêtre courante d'abord, repli assumé »).
- **patch (low)** BF5 — hintPret surpromettant (« déjà passé à CE point de contrôle ») : le dédoublonnage local est par appareil — reformulé « sur cet appareil ».
- **patch (low)** BF6+BF7+BF8+VG-other(titre) — hygiène : assertion miroir 4.3 (MESSAGE_SCAN_PASSAGE absent pour retrait-sans-mission), table Record pour noticeScan (ternaire imbriqué), objectContaining au lieu de l'arité interne de React, titre de test « inchangé (4.2) » corrigé (le gating change précisément).
- **defer** BF2+VG1 — câblage client (surPayload mode passage) non exécuté par un test : aucune infra composant interactif (convention repo) ; orchestrateur pur, props page et gating serveur chacun vérifiés.
- **defer** BF9 — getAll outbox complet à chaque démarrage du scanner : volumétrie journée de course — cursor range par préfixe à traiter en 4.5 (rejeu incrémental, noté aussi en 4.3).
- **rejeté (low)** EC2 — index garde l'horodatage tardif sur ConstraintError multi-onglets : fenêtre de secondes, même appareil/checkpoint, l'outbox reste correct (premier stocké) — l'écart d'affichage est cosmétique.
- **false** BF2(partie spec) — case Tests non cochée : artefact de chronologie (cochée après lecture du diff par la revue).

## Design Notes

- Le checkpoint EST la mission scan : V1 documentée (aucune entité checkpoint dédiée) — la clé naturelle (édition, coureur, checkpoint) reste exacte, le jour où un référentiel checkpoints existera, seul le fournisseur du `checkpointId` changera.
- La clé locale ajoute l'appareil à la clé naturelle (AD-2 : dédoublonnage cross-appareils = arbitrage serveur 4.5) : deux postes qui scannent le même coureur au même checkpoint produisent deux événements distincts localement — c'est voulu, le serveur arbitrera (AD-3).
- Même store outbox, préfixes de clé distincts (`retrait:v1:` / `passage:v1:`) : aucune migration, coexistence testée — 4.5 listera l'un et l'autre.
- Le doublon « même coureur autre checkpoint » n'existe PAS : c'est un succès — seule la paire (coureur, checkpoint) dédoublonne (FR-13).

## Verification

**Commands:**
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (contrat passage, outbox coexistence, matrice passage, scanner, gating).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Volontaire scan : scanner un e-dossard → « ✓ Passage enregistré — dossard N · HH:MM:SS » ; re-scan → doublon avec l'heure du premier ; déconnexion/reconnexion → toujours doublon ; DevTools → IndexedDB : outbox peuplé (`passage:v1:…`), retraits et passages cohabitent.
