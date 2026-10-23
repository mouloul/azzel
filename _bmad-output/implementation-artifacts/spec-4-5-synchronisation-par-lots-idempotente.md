---
title: 'Story 4.5 — Synchronisation par lots idempotente'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '5b426b0'
baseline_commit: '5b426b0a399cf7adbe04a553e149ecb607a3ddb7'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les retraits et passages scannés en zone blanche restent dans l'outbox locale : rien ne remonte au serveur, l'arbitrage premier-reçu-fait-foi n'existe pas, et la boîte d'envoi meurt avec la session (FR-14, NFR-3, AD-2/3/5).

**Approach:** Module **chrono** serveur : table `terrain_evenement` (append-only serveur, `cle_idempotence` UNIQUE → rejeu jamais en doublon visible, horodatage serveur + offset estimé journalisés) + table `appareil` (jeton d'appareil dédié au canal sync, indépendant des sessions, révocable — AD-5). Endpoint `POST /api/volontaires/sync` authentifié par **Bearer jeton d'appareil** (survit aux sessions révoquées) : lot d'événements validés par contrat shared, jetons résolus côté serveur, insertions idempotentes, réponse par événement (accepté/déjà-connu/rejeté+motif). Client : moteur de sync (déclenché à l'ouverture en ligne, à l'événement `online`, et depuis le bandeau), **bandeau sync permanent** (UX-DR-8 : « ◷ N en attente » → « ✓ envoyés — file : 0 ») et **journal sync** en lecture seule (lots, acceptés/doublons/rejets, offsets horloge) — IndexedDB v4 (stores `envoyes` + `journal`, l'outbox reste append-only immuable).

## Boundaries & Constraints

**Always:**
- Idempotence de bout en bout : clé d'idempotence du contrat shared en `UNIQUE` SQL — le rejeu d'un lot entier est un no-op visible (« déjà-connu »), JAMAIS un doublon ; réponse par événement : `{ cle, statut: 'accepté'|'déjà-connu'|'rejeté', motif? }` + compteurs du lot.
- Arbitrage serveur (AD-3) : pour une clé naturelle (édition, coureur, checkpoint), le PREMIER passage reçu (horodatage serveur) fait foi — les suivants restent stockés pour audit, neutres pour le classement ; idem retraits (premier = présent au départ) ; l'horodatage APPAREIL est conservé comme donnée, l'offset estimé (référence serveur à la réception) est calculé et journalisé par événement.
- Jeton d'appareil (AD-5) : enregistrement via session volontaire (`POST /api/volontaires/appareil` → `{ appareilId, jeton }`, hash stocké) ; sync par `Authorization: Bearer` SANS session ; révocable côté admin (`POST /api/admin/appareils/[id]/revoquer`) — un appareil révoqué reçoit 401 dédié, le client affiche « Appelle le PC » (jamais d'auto-réenregistrement silencieux).
- Bandeau sync (UX-DR-8) TOUJOURS visible sur /volontaires : compteur d'attente (retraits + passages non envoyés), état d'envoi, « ✓ envoyés — file : 0 » ; journal en lecture seule (details) : lots horodatés, acceptés/déjà-connus/rejetés avec motifs, offset moyen ; aucune suppression locale d'événement (marquage `envoyes` à part, outbox immuable).
- Déclenchements client : ouverture en ligne (après fetch etat OK), événement `online`, bouton du bandeau ; lots ≤ 200 événements (reprise par tranches) ; échec réseau → rien de perdu, retry suivant.
- RLS `organisation_id` partout (evenement + appareil), `withOrg` sur chaque requête métier ; horodatages ISO UTC stockés.
- Contrats : validation par `estRetraitValide`/`estPassageValide` (shared) AVANT stockage ; jeton coureur résolu côté serveur (UNIQUE `coureur.jeton_edossard`, org-scopé) — jeton inconnu = rejet motivé (pas de stockage).

**Never:**
- Pas de classement/résultats ni tableau de bord (épopées 5/7) — le module chrono NE fait qu'ingérer et arbitrer le premier reçu.
- Pas d'annulation de passage (épopée 5), pas de suppression/édition d'événements (append-only serveur ET client).
- Pas de WebSocket/push : HTTP POST par lots, déclenché client.
- Pas de temps « définitif » côté appareil (AD-3) ; jamais de mutation de l'outbox locale (le marquage d'envoi vit dans SON store).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sync nominale | outbox 12 événements, réseau de retour | Lot envoyé, 12 acceptés, bandeau « ✓ envoyés — file : 0 », journal lot (offset moyen) | No error expected |
| Rejeu intégral | même lot renvoyé (crash avant ack) | 12 « déjà-connu », AUCUN doublon en base, bandeau file : 0 | No error expected |
| Jeton inconnu | événement au jeton absent de l'org | « rejeté — coureur inconnu », non stocké, journal motif | No error expected |
| Événement hors contrat | payload invalide côté serveur | « rejeté — contrat invalide », non stocké | No error expected |
| Arbitrage | 2 appareils, même passage (coureur×checkpoint) | Premier reçu (horodatage serveur) fait foi ; second stocké audit, neutre | No error expected |
| Appareil révoqué | Bearer révoqué | 401 dédié « appareil révoqué » ; bandeau « Appelle le PC », sync stoppée | enveloppe |
| Session révoquée | volontaire déconnecté, réseau OK | Sync FONCTIONNE (Bearer appareil) — la boîte d'envoi survit (AD-5) | No error expected |
| Hors-ligne au déclenchement | fetch échoue | Bandeau conserve « ◷ N en attente », retry au prochain online/ouverture | jamais de perte |
| Lot > 200 | 450 événements | 3 tranches séquentielles, compteur global cohérent | No error expected |
| Premier lancement sans jeton sync | PWA ouverte en ligne, session active | Enregistrement appareil automatique puis sync | enregistrement impossible (offline) → différé, bandeau « N en attente » |
| Multi-org | appareil org A | Événements résolus/bornés org A (RLS), aucun coureur B | RLS |
| Purge logout | déconnexion | Outbox + envoyes + journal + appareil/jeton CONSERVÉS (AD-5, inchangé) | No error expected |

</frozen-after-approval>

## Code Map

- `packages/shared/src/terrain.ts` — contrats retrait/passage + clés d'idempotence : la sync les consomme, jamais ne réinvente ; y ajouter si besoin le type d'union `EvenementTerrain` et le format de réponse de lot.
- `apps/web/src/lib/idb-volontaires.ts` — base v3 (outbox `cle` keyPath, appareil) : passer v4 + stores `envoyes` (cle → envoyeA) et `journal` (append, borné ~100) ; `enregistrerAppareil(jetonSync)`, `lireAppareil()` étendu ; compteur d'attente = outbox − envoyes ; upgrade v3→v4 sans toucher l'existant.
- `apps/web/src/app/volontaires/volontaires-pwa.tsx` — bandeau sync (UX-DR-8) + journal + déclenchements (ouverture en ligne, `online`, bouton).
- `apps/web/src/modules/missions/` — pattern module (domain/errors/service/store/migrations) à reproduire pour `modules/chrono`.
- `apps/web/src/modules/inscriptions/store.ts` — résolution jeton → coureur (`coureur.jeton_edossard`, org-scopé, pattern requête locale).
- `apps/web/src/app/api/volontaires/` — guard session (guard.ts) et patterns routes ; la sync utilise un guard DÉDIÉ par Bearer appareil.
- `apps/web/src/db/multi-org.integration.test.ts` — étendre aux tables chrono.
- `apps/web/src/app/admin/` — pattern route admin simple pour la révocation.

## Tasks & Acceptance

**Execution:**
- [x] `modules/chrono/migrations/0024_chrono_terrain.sql` — `terrain_evenement` (id, organisation_id, cle_idempotence UNIQUE, type, edition_id, jeton_coureur, checkpoint_id nullable, horodatage_appareil, horodatage_reception (serveur, DEFAULT now()), offset_estime_ms, appareil_id) + index clé naturelle (edition, jeton, checkpoint) ; `appareil` (id, organisation_id, appareil_client UNIQUE(org, appareil_client), jeton_hash UNIQUE, revoked_at nullable, last_sync_at) ; RLS + grants + MIGRATION_DIRS.
- [x] `modules/chrono/` (domain + errors + store + service + tests) — `enregistrerAppareil(session, appareilClient)` (find-or-create, jeton brut retourné une fois, hash stocké) ; `verifierJetonAppareil(bearer)` (hash lookup, révoqué → 401 dédié, last_sync_at rafraîchi) ; `synchroniserLot(appareil, evenements)` : validation contrat, résolution jeton→coureur org, `INSERT … ON CONFLICT (cle_idempotence) DO NOTHING RETURNING` (accepté vs déjà-connu), offset estimé par événement, réponse détaillée + compteurs ; `premierRecu(edition, jeton, checkpoint)` (requête d'arbitrage, pour 5/7) ; `listerAppareils(session)` + `revoquerAppareil(session, id)`.
- [ ] Routes — `POST /api/volontaires/appareil` (session → enregistrement), `POST /api/volontaires/sync` (Bearer appareil, lot ≤ 200 → 413 au-delà, enveloppes volontaires.*, no-store), `POST /api/admin/appareils/[id]/revoquer` + `GET /api/admin/appareils` (guardAdmin) ; tests routes (401 révoqué, 413, formes, garde session ≠ sync).
- [x] `apps/web/src/lib/idb-volontaires.ts` (+ tests) — v4 : stores `envoyes`/`journal` ; `marquerEnvoyes(cles[])`, `compterEnAttente()`, `lireJournal()`/`ajouterEntreeJournal()` (borné), `enregistrerJetonSync(jeton)`/`lireJetonSync()` ; upgrade v3→v4 intègre l'existant.
- [x] `apps/web/src/lib/sync/sync-terrain.ts` (+ tests purs) — orchestration : composer les tranches (retraits + passages non envoyés), POST par Bearer, marquer envoyés (y compris « déjà-connu » — le serveur connaît), journaliser le lot (acceptés/doublons/rejets + motifs + offset moyen), erreurs réseau absorbées (retour état) ; appareil révoqué → statut dédié.
- [x] `volontaires-pwa.tsx` + css + tests — bandeau sync permanent (compteur via compterEnAttente, états ◷/envoi/✓/révoqué/Appelle le PC), journal `<details>` lecture seule, déclenchements (fetch etat OK, `online`, bouton), enregistrement appareil automatique à l'ouverture en ligne si jeton absent.
- [ ] Tests intégration — sync nominale multi-événements, REJEU INTÉGRAL sans doublon (ON CONFLICT), arbitrage deux appareils (premier reçu fait foi, second stocké neutre), rejets (jeton inconnu, contrat invalide), révocation (401 après, sync avant), RLS multi-org (ORG_TABLES étendues), offset journalisé.

**Acceptance Criteria:**
- Given 217 passages en attente et le réseau qui revient, when la sync se déclenche, then tout remonte par lots idempotents (tranches de ≤ 200), le bandeau passe « ◷ 217 passages en attente » → « ✓ envoyés — file : 0 », et un REJEU intégral ne crée aucun doublon visible.
- Given deux appareils qui scannent le même passage, when les deux lots remontent, then le premier reçu fait foi (arbitrage serveur) et le second est archivé neutre — jamais de suppression locale.
- Given la session du volontaire révoquée mais l'appareil enregistré, when le réseau revient, when la sync part, then elle réussit (Bearer appareil, AD-5) — la boîte d'envoi ne meurt jamais d'une session.

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 14, edge-case-hunter 8, verification-gap 3 ; ~25 findings)
- **patch (high)** VG3 — l'écran « session expirée » DEMONTE le bandeau sync : la promesse AD-5 (« session révoquée → sync fonctionne ») est tenue côté serveur mais pas côté client — la file reste bloquée jusqu'au re-login. BandeauSync monté aussi sur la branche déconnectée + test.
- **patch (medium)** EC5 — checkpointId fantôme : un passage au contrat valide avec un checkpoint inexistant côté org est STOCKÉ (arbitrage premierRecu lit du bruit) — résolution checkpoint contre mission org-scopée, rejet « checkpoint inconnu ».
- **patch (medium)** BF12+EC4 — courses d'enregistrement : find-or-create SELECT+INSERT concurrents → 23505 brute en 500 ; upsert `ON CONFLICT (organisation_id, appareil_client) DO UPDATE jeton_hash` (révoqué toujours refusé).
- **patch (low)** BF2 — clés corrompues comptées en attente à vie (compterEnAttente ≠ filtre de lister) : même filtrage des deux côtés, cohérence bandeau.
- **patch (low)** BF4+BF5 — perf jour J : marquerEnvoyes/ajouterEntreeJournal en UNE transaction groupée (pas 200 tx par lot) ; insererLot en INSERT multi-lignes (unnest) au lieu de 200 allers-retours.
- **patch (low)** BF6 — last_sync_at rafraîchi AVANT l'ingestion (sync fantôme en liste PC sur échec) : rafraîchi après insererLot réussi.
- **patch (low)** BF8+BF9 — enregistrement appareils illimité (rotation en boucle, lignes infinies) : plafond par org (50) ; garde de taille de corps avant json() sur /sync.
- **patch (low)** BF10 — 413 mappé « reseau » : si les bornes divergent (déploiement désynchronisé), boucle infinie sur la même tranche — découpage réactif sur 413 (moitié).
- **patch (low)** BF11+BF7 — enveloppes croisées : routes admin/appareils mappées volontaires.sync.* sur la surface PC (mapper admin.appareils.* dédié, vouvoiement) ; CorpsAppareilInvalideError morte supprimée.
- **patch (low)** EC1+EC2 — fetch sync/enregistrement sans timeout (bandeau figé « Envoi en cours » à vie, enCours verrouillé) : AbortSignal.timeout(30 s) + drapeau de relance si déclenchement pendant envoi.
- **patch (low)** EC3+EC6 — échec de lecture outbox maquillé en file vide (« ✓ file : 0 » mensonger) : erreur distinguée (état « comptage impossible ») ; phase « envoye » seulement si enAttente === 0 (rejets restants → attente).
- **patch (low)** EC7(claim partiel) — enregistrement 401 « appareil révoqué » : enregistrerAppareilPourSync lit le code et propage l'état révoqué au bandeau.
- **patch (low)** BF1+VG1+VG2 — aria-labelledby id inexistant ; bandeau absent des tests de la page (marqueurs SSR) ; enregistrerAppareilPourSync + orchestration register-then-retry extraits et testés (fetch factice).
- **defer** BF3 — getAll complet par rafraîchissement + croissance non bornée (outbox/envoyes à vie) : volumétrie jour J réelle à observer, compaction post-ACK et cursor range déjà notés (4-3/4-4) — épopée 5.
- **defer** BF13(bandeau effets) — effets interactifs du bandeau (déclenchements, retry) : aucune infra composant interactif (convention).
- **false** EC8(claim) — migration 0025 vs 0024 de la spec : 0024 était pris (alphabet dossard), séquence globale unique — écart documenté.
- **false** VG-other(commentaire) — « pas de sync sur session morte » : l'effet de montage tente dès navigator.onLine — bénin et conforme AD-5, commentaire corrigé au passage.

## Design Notes

- L'arbitrage « premier reçu » s'appuie sur `horodatage_reception` SERVEUR (monotone, hors horloges clients) : AD-3 — l'heure appareil et l'offset estimé restent des DONNÉES (audit), jamais des temps de classement.
- Le marquage d'envoi vit dans un store séparé (`envoyes`) : l'outbox demeure append-only immuable (AD-2/AD-8) — « déjà-connu » au rejeu marque AUSSI envoyé (le serveur connaît, c'est tout ce qui compte).
- L'enregistrement appareil exige une SESSION (le volontaire atteste l'appareil), la sync n'exige QUE le jeton (AD-5) — un appareil révoqué n'auto-réenregistre jamais : assistance humaine.
- Le journal client est borné (~100 entrées) : c'est un journal de terrain (fraîcheur, rejets), pas un audit — l'audit complet vit en base côté serveur.
- Module `chrono` volontairement mince : ingestion + arbitrage uniquement ; classements et tableaux (épopées 5/7) interrogeront `premierRecu` sans toucher à l'ingestion.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0024 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (chrono, sync, routes, bandeau, arbitrage, rejeu, RLS).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Scanner des passages en offline (DevTools) → repasser online : bandeau « ✓ envoyés — file : 0 », journal détaillé ; couper le réseau pendant l'envoi → compteur intact, retry ; révoquer l'appareil en admin → bandeau « Appelle le PC » ; `psql` : `terrain_evenement` peuplé, rejeu du même lot via curl → idempotent.
