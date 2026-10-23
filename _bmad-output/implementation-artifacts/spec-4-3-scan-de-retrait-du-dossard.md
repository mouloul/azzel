---
title: 'Story 4.3 — Scan de retrait du dossard'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '5c760e4'
baseline_commit: '5c760e4a53752786dfbf41325c1e36c304b62e60'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Au guichet, ~700 retraits le jour J : le volontaire ne peut pas marquer « présent au départ » en scannant l'e-dossard — ni l'outbox locale (append-only, AD-2), ni le dédoublonnage persistant par coureur n'existent (FR-8).

**Approach:** Mode **retrait** du scanner (`/volontaires/scan?mode=retrait`), débloqué quand le volontaire a une mission `distribution_dossards`. Chaque scan réussi append un événement `retrait` dans l'outbox **IndexedDB v3** (store `outbox` append-only + store `appareil` : identifiant d'appareil stable, requis par la clé d'idempotence AD-2). Dédoublonnage **persistant** : un retrait déjà en outbox (toutes sessions confondues) → voyant doublon avec l'heure du PREMIER retrait. Contrat `RetraitTerrain` versionné dans `shared` (types + clé d'idempotence). L'outbox appartient à l'APPAREIL (AD-5) : il survit à la déconnexion.

## Boundaries & Constraints

**Always:**
- Outbox **append-only** (IndexedDB, base v3 : stores `etat` + `annuaire` intacts, nouveaux `outbox` + `appareil`) : insertion et lecture uniquement — jamais de modification ni suppression locale (AD-2, AD-8) ; 4.5 marquera l'envoi.
- Clé d'idempotence du contrat : `appareilId + édition + jeton coureur` (AD-2) — générée par `shared`, jamais réinventée ; `appareilId` stable (généré une fois, store dédié).
- Dédoublonnage par coureur contre l'outbox (persistant, cross-session) : second scan → « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS » (heure du premier), aucun événement dupliqué ; le PREMIER retrait reste la référence (AD-3).
- Voyant succès retrait : « ✓ Dossard N — {prénom} » + mention « présent au départ » ; horodatage = heure de l'appareil (donnée locale, AD-3).
- Payload minimal (NFR-7) : version, type `retrait`, `editionId`, `jeton`, `horodatage`, `appareilId` — jamais de nom en clair dans l'outbox.
- L'outbox et l'appareilId survivent à la déconnexion (données d'appareil, AD-5) ; la purge existante (etat, annuaire, caches) reste inchangée.
- Même moteur, mêmes écrans, mêmes bips que 4.2 (mode = paramètre) ; mission « en cours » pour `distribution_dossards` (fenêtre horaire du helper 4.2).

**Never:**
- Pas d'envoi/réseau ni bandeau sync ni journal (4.5) ; pas de passages/checkpoints (4.4).
- Pas d'écriture serveur ni de migration SQL (le retrait remontera en 4.5).
- Pas de suppression ni d'édition d'un retrait en local (jamais de mutation d'outbox).
- Pas de nom de coureur persisté dans l'outbox (jeton seul).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Retrait (nominal) | QR connu, 1ᵉʳ scan (guichet) | « ✓ Dossard N — {prénom} · présent au départ », bip succès, événement appendé à l'outbox | IDB refusée → voyant succès + note « NON enregistré sur cet appareil » (jamais de mensonge) |
| Doublon retrait | même jeton re-scanné (même session OU session suivante) | « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS », bip doublon, AUCUN événement ajouté | No error expected |
| Inconnu | payload invalide/jeton absent | « ⚠ DOSSARD INCONNU — revérifier » (identique 4.2), rien en outbox | No error expected |
| Entrée guichet | mission `distribution_dossards` en cours | CTA « Scan retrait » vers `?mode=retrait` ; sans cette mission : CTA absent | No error expected |
| Mode retrait sans mission | URL directe sans mission guichet | Retour à la fiche avec message (le mode est débloqué par la mission) | redirection douce |
| Hors-ligne total | aucun réseau depuis le début | Retraits enregistrés en local, doublons détectés — tout remontera en 4.5 | No error expected |
| Déconnexion/reconnexion | volontaire se déconnecte puis revient | Outbox et appareilId intacts, doublons toujours détectés (cross-session) | No error expected |
| Upgrade IDB v2→v3 | base 3.3/3.4 existante | `outbox` + `appareil` créés SANS toucher `etat`/`annuaire` | No error expected |
| Purge logout | déconnexion | etat + annuaire + caches purgés ; outbox + appareilId conservés (AD-5) | No error expected |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/scan/` — moteur 4.2 : `etats-scan.ts` (résolution), `mission-scan.ts` (fenêtre horaire), `audio-scan.ts`, `decodeur-qr.ts` : le mode retrait réutilise TOUT.
- `apps/web/src/lib/idb-volontaires.ts` — base v2 (etat + annuaire, upgrade propre) : passer en v3 + stores `outbox`/`appareil` ; `effacerEtatVolontaires` (purge logout) à ajuster (conserve outbox/appareil).
- `apps/web/src/app/volontaires/scan/` — scanner 4.2 : paramètre `mode=retrait`, résolution/dédoublonnage branchés sur l'outbox, libellés dédiés.
- `apps/web/src/app/volontaires/volontaires-pwa.tsx` — CTA 4.2 (`scan_checkpoint`) : ajouter le CTA retrait (`distribution_dossards`).
- `packages/shared/src/` — contrats versionnés (`annuaire.ts`, `edossard.ts`) : y ajouter le contrat d'événement terrain (retrait + clé d'idempotence).
- `apps/web/src/lib/scan/etats-scan.test.ts` — pattern de tests purs (matrice) pour la résolution retrait.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/terrain.ts` (+ tests, exporté) — `RETRAIT_SCHEMA_VERSION = 1`, type `RetraitTerrain { version, type: 'retrait', editionId, jeton, horodatage, appareilId }`, `estRetraitValide()` (défensif), `cleIdempotenceRetrait(appareilId, editionId, jeton)` — le Passage (4.4) étendra ce module.
- [x] `apps/web/src/lib/idb-volontaires.ts` (+ tests) — base v3 : stores `outbox` (keyPath `cle`, clé d'idempotence — l'append d'une clé existante est un no-op) et `appareil` (clé `courant`) ; `obtenirAppareilId()` (généré une fois, stable), `ajouterRetrait(retrait)` (append-only, `cle` unique → pas de doublon physique), `listerRetraits()`, `retraitsParJeton()` (Map jeton → horodatage du premier) ; upgrade v2→v3 sans toucher etat/annuaire (test) ; purge logout conserve outbox+appareil (test).
- [x] `apps/web/src/lib/scan/etats-scan.ts` (+ tests) — `resoudreRetrait(payload, index, retraitsExistants)` pur : succès/doublon (heure du PREMIER retrait)/inconnu, libellés dédiés (« · présent au départ », « retiré à HH:MM:SS ») ; l'enregistrement retourne l'événement à appendé (jamais de mutation cachée).
- [x] `apps/web/src/app/volontaires/scan/` (page + client + tests) — paramètre `mode=retrait` : résolution via outbox (chargé au démarrage, incrémental après chaque append), append au succès, note « NON enregistré » si IDB refuse, mission guichet en badge ; URL directe sans mission guichet → redirection douce vers /volontaires.
- [x] `volontaires-pwa.tsx` + tests — CTA « Scan retrait » (mission `distribution_dossards` en cours via `mission-scan.ts` généralisé aux types), à côté du CTA passages.
- [ ] Tests — matrice retrait complète (nominal/doublon cross-session/inconnu/IDB refusée), append idempotent (même clé = un seul événement), upgrade v2→v3, purge logout conservatrice, gating CTA.

**Acceptance Criteria:**
- Given un e-dossard valide au guichet, when le volontaire scanne, then « présent au départ » est enregistré hors-ligne dans l'outbox (append-only, clé d'idempotence) et un second scan — même après déconnexion/reconnexion — affiche « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS » sans rien dupliquer.
- Given la sortie du volontaire, when il se déconnecte, then l'outbox et l'appareilId survivent (la fiche et l'annuaire sont purgés comme en 3.3/3.4).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 12, edge-case-hunter 6, verification-gap 2 ; ~20 findings)
- **patch (high)** VG1 — défaut vivant : les deux modes partagent UNE clé de cache SW `/volontaires/scan` (pathname seul, query ignorée) — hors-ligne la variante retrait écrase checkpoint : des passages seraient résolus/appendés comme RETRAITS (append-only non corrigeable). Clé = pathname + search (pattern sw-coureur 4.1) + test SW des deux variantes.
- **patch (medium)** BF1+BF10+EC3+VG-other — course du double-scan retrait : le voyant attend l'append IDB (budget < 1 s couplé au stockage), l'index n'est mis à jour qu'après → deux scans rapprochés affichent double succès, et un scan antérieur peut écraser le voyant du récent — décision immédiate (voyant+bip synchrones, index mis à jour optimiste avec rollback si l'append échoue) + séquence pour que seul le DERNIER scan rende.
- **patch (medium)** BF-course+EC4+EC6(claim) — `obtenirAppareilId` non atomique (get puis put séparés) : deux appels concurrents émettent deux appareilId, les clés d'idempotence divergent — get+put dans UNE transaction readwrite.
- **patch (low)** BF11+EC1 — searchParams typés sans `string[]` (`?mode=retrait&mode=x` → comparaison fausse silencieuse) sur les deux pages ; garde Array.isArray.
- **patch (low)** BF8+EC2 — « message éphémère » persistant : `?scan=retrait-sans-mission` reste dans l'URL (rechargement = notice réaffichée) — router.replace après affichage.
- **patch (low)** BF9+VG2 — câblage retrait non exécuté par aucun test : extraire `traiterScanRetrait` pur (résolution + index optimiste + append injectable + note) au gabarit de `resoudreEtEnregistrer`, scan-client ne garde qu'un appel mince ; tests (append ok → pas de note, refus → note + rollback index, doublon cross-session).
- **patch (low)** BF6+BF5 — message trompeur quand l'état missions ÉCHOUE (guichet légitime traité en « sans mission ») : distinguer échec/absence (redirection silencieuse sur échec) ; intitulés « en cours » corrigés (le repli hors fenêtre est assumé).
- **patch (low)** BF2+BF3+BF4+BF7+EC5 — hygiène : littéral `retrait-sans-mission` dupliqué (importer la constante), test d'unicité du message (comptage), `renduRedirige` avale tout (asserter la redirection), titre de section pour guichet pur, libellé succès sans coureur (défense `undefined`).
- **defer** BF12 — croissance non bornée de l'outbox sans séquence : concerné 4.5 (rejeu incrémental, éviction post-sync) — noté pour sa spec.

## Design Notes

- L'outbox vit sur l'APPAREIL, pas sur le compte (AD-5) : la purge de déconnexion (3.3) est donc amoindrie — outbox et appareilId sont explicitement conservés ; les événements ne portent que des jetons opaques (NFR-7).
- La clé d'idempotence en `keyPath` du store fait de l'append un no-op physique : même sans lire avant d'écrire, aucun doublon ne peut exister localement — 4.5 s'appuiera dessus pour le rejeu.
- Le mode est un paramètre du scanner (pas une page séparée) : moteur, écrans d'état, permission et audio restent UNIQUES — 4.4 greffera le mode passage pareillement.
- L'horodatage stocké est l'heure appareil au moment du scan (donnée brute, AD-3) ; l'offset estimé et l'arbitrage serveur arrivent en 4.5.

## Verification

**Commands:**
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (contrat terrain, outbox v3, résolution retrait, scanner mode, gating).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Volontaire avec mission distribution_dossards : CTA retrait → scanner → scan d'un e-dossard réel → « présent au départ » ; re-scan → « retiré à HH:MM:SS » ; déconnexion/reconnexion → re-scan → toujours doublon ; DevTools → Application → IndexedDB : store `outbox` peuplé, survit au logout.
