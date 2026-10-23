---
title: 'Story 5.1 — Tableau de bord live du PC course'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'fdd3b39'
baseline_commit: 'fdd3b3955485a3e2231af786c3913b880da65cf3'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-5-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Au PC, Nadia pilote à l'aveugle : retraits, partants, en course, arrivés et passages par checkpoint ne sont visibles nulle part — les événements de l'épopée 4 sont ingérés sans surface de pilotage (FR-24, NFR-5, UX-DR-12).

**Approach:** Page `/admin/course` : cartes de synthèse (retraits, partants par épreuve, en course, arrivés, abandonnés-placeholder) + **boards par checkpoint** (lignes UX-DR-12 : tri heure décroissante, badge dossard mono, heure mono 15 px à droite, séparateurs pointillés, non cliquables V1) + **fraîcheur toujours affichée** (« synchronisé il y a X » — dernière réception serveur, y compris réseau dégradé). Rafraîchissement = polling 5 s d'une API dédiée (seule surface « live » — AD-7 adapté à ce repo sans Supabase), mise à jour d'état SANS rechargement ni flash. « Arrivés » exige un checkpoint d'arrivée identifié : colonne `mission.est_arrivee` (case à cocher admin, au plus un par édition — garde service).

## Boundaries & Constraints

**Always:**
- Fraîcheur NFR-5 : « synchronisé il y a X min » accolé aux chiffres EN TOUTES CIRCOUNSTANCES — échec réseau → les chiffres RESTENT affichés avec leur fraîcheur (jamais de figé présenté comme vivant, jamais d'écran vide).
- Boards (UX-DR-12) : une ligne par passage ARBITRÉ (premier reçu par coureur×checkpoint, AD-3), tri heure décroissante, badge dossard mono, heure mono 15 px alignée droite, séparateurs pointillés, lignes non cliquables V1.
- Agrégats : partants = coureurs validés par épreuve ; retraits = premiers reçus type retrait (par coureur) ; arrivés = retirés avec passage au checkpoint `est_arrivee` ; en course = retirés − abandonnés − arrivés (abandonnés = 0 en 5.1, compteur réservé 5.3) ; passages par checkpoint = arbitrés, horodatage serveur.
- Polling 5 s côté client (fetch `GET /api/admin/course/etat`, no-store), état React mis à jour sans rechargement — `prefers-reduced-motion` respecté (aucune animation), pause quand l'onglet est caché (`visibilitychange`).
- `mission.est_arrivee` : booléen, case à cocher dans le formulaire mission admin, au plus UN par édition (erreur champ claire sinon) ; absence de checkpoint d'arrivée → carte « arrivés » affiche 0 avec note « aucun checkpoint d'arrivée défini ».
- `requireRolePage('organisateur')` + guardAdmin sur l'API ; enveloppes admin.* ; RLS org ; horodatages serveur affichés en heure locale.
- Identifiants des coureurs sur le board : dossard (mono) — résolution jeton→coureur côté serveur uniquement.

**Never:**
- Pas d'alertes hors-délais ni actions « Appeler le secteur »/« Saisir l'abandon » (5.2/5.3), pas d'annulation (5.4), pas de classements/résultats publics (épopée 7).
- Pas de WebSocket/SSE/Supabase (polling simple, adapté au repo) ; pas de clic sur les lignes ni page détail coureur V1.
- Pas de suppression ni modification des événements — lecture seule totale.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouverture | événements synchronisés | Cartes (retraits, partants/épreuve, en course, arrivés, abandonnés 0) + boards par checkpoint triés + fraîcheur | No error expected |
| Polling nominal | +5 s, nouveaux passages | Chiffres/lignes mis à jour SANS flash ni scroll sauté ; fraîcheur rafraîchie | No error expected |
| Réseau dégradé | fetch échoue | Dernier état affiché, fraîcheur conservée (« il y a X min »), point discret « reconnexion… » ; jamais blanc | No error expected |
| Aucun événement | édition sans scans | Cartes à 0, boards vides avec libellé d'attente, fraîcheur = « aucune donnée reçue » | No error expected |
| Sans checkpoint d'arrivée | aucune mission est_arrivee | Arrivés = 0 + note « aucun checkpoint d'arrivée défini » | No error expected |
| Deux checkpoints d'arrivée | case cochée sur 2 missions | Refus à la création/édition : « un seul checkpoint d'arrivée par édition » | erreur champ |
| Arbitrage visible | même coureur×checkpoint scanné par 2 appareils | UNE ligne (premier reçu), pas de doublon | No error expected |
| Onglet caché | visibilitychange | Polling en pause, reprise au retour + rafraîchissement immédiat | No error expected |
| Non-organisateur | coureur/volontaire | 403 / redirection rôle | enveloppe |
| Multi-org | données org B | Rien d'affiché (RLS) | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/chrono/` — module 4.5 : `premierRecu`, store (`terrain_evenement`) : y ajouter l'agrégation `etatCourse` (requêtes de lecture, org-scopées).
- `apps/web/src/modules/missions/` — missions 3.2 : migration `0026_mission_arrivee.sql` + domaine (case est_arrivee, unicité par édition côté service) + formulaire admin (checkbox).
- `apps/web/src/app/admin/` — patterns pages/managers admin (sponsors, missions) + guardAdmin.
- `apps/web/src/app/volontaires/bandeau-sync.tsx` — pattern composant client à états/effets + `libellerBandeauSync` pur testé (calque pour la fraîcheur).
- `packages/shared/src/datetime.ts` — formatage local (heures des boards).
- `apps/web/src/db/multi-org.integration.test.ts` — RLS déjà couvert sur terrain_evenement.

## Tasks & Acceptance

**Execution:**
- [x] `modules/missions/migrations/0026_mission_arrivee.sql` — `mission.est_arrivee boolean NOT NULL DEFAULT false` + index partiel ; domaine/service : validation « au plus un par édition » (erreur champ), exposition dans les vues admin/volontaire ; case à cocher dans le formulaire mission (création + édition) + tests.
- [x] `modules/chrono/` (service + store + tests) — `getEtatCourse(session)` : partants par épreuve (validés), retraits arbitrés (premier par coureur), passages arbitrés par checkpoint (premier par coureur×checkpoint, horodatage serveur), arrivés (retirés ∧ passage au checkpoint est_arrivee), en course, abandonnés = 0 (réservé), fraîcheur = max(horodatage_reception) ; tout org-scopé, résolution jeton→coureur (dossards) côté serveur.
- [x] `GET /api/admin/course/etat` (+ tests route) — guardAdmin, no-store, réponse complète des agrégats + `generéA` serveur.
- [x] `apps/web/src/app/admin/course/` (page serveur + `course-live.tsx` client + css) — état initial SSR en props, polling 5 s (pause onglet caché, reprise immédiate au retour), mise à jour sans flash, fraîcheur permanente (« synchronisé il y a X s/min », ou « aucune donnée reçue »), point « reconnexion… » discret en échec ; cartes + boards UX-DR-12 (dossard mono, heure mono 15 px droite, séparateurs pointillés, tri décroissant, non cliquables) ; lien depuis l'espace admin existant.
- [x] `apps/web/src/lib/course/fraicheur-course.ts` (+ tests purs) — libellés de fraîcheur (seconde/min), fusion état polling/échec (le dernier état gagne, jamais blanc) — calque du pattern `libellerBandeauSync`.
- [ ] Tests — intégration `getEtatCourse` (partants/retraits/passages arbitrés/arrivés/en course, fraîcheur, sans checkpoint d'arrivée, RLS), unicité est_arrivee, routes, page SSR (cartes, board, fraîcheur), fraîcheur pure.

**Acceptance Criteria:**
- Given des retraits et passages synchronisés, when Nadia ouvre `/admin/course`, then toutes les cartes et boards s'affichent avec « synchronisé il y a X » — et se mettent à jour toutes les 5 s sans flash complet.
- Given le réseau du PC qui dégrade, when le polling échoue, then les derniers chiffres RESTENT affichés avec leur fraîcheur croissante et un point « reconnexion… » — jamais d'écran vide ni de figé muet.
- Given deux appareils ayant scanné le même coureur au même checkpoint, when le board s'affiche, then UNE seule ligne (premier reçu, AD-3).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 12, edge-case-hunter 7, verification-gap 2 ; ~21 findings)
- **patch (medium)** BF1+EC1+VG-other — trap incohérent : estArrivee non restreint à scan_checkpoint (case visible sur toute mission) mais etatCourse ne regarde QUE scan_checkpoint → un accueil coché consomme le slot d'unicité, bloque le vrai checkpoint, la carte Arrivés reste 0 — restreindre estArrivee aux missions scan_checkpoint (validation domaine + garde + case masquée hors type + erreur champ) + test.
- **patch (medium)** EC2 — coureurs fantômes : retraits/passages comptés sans résolution dossard (jeton orphelin) → « En course » > « Partants » à vie — retraits restreints aux jetons résolus, enCourse = retraitsRésolus − arrivés (jamais négatif).
- **patch (medium)** BF7 — partants vs retraits non filtrés sur validé : le même test crée un coureur « en constitution » synchronisable — filtrer retraits/passages sur dossards résolus uniquement (résolution = coureur validé numéroté consulté) et le documenter.
- **patch (low)** BF11 — heures des boards SSR au fuseau serveur (hydratation locale, écart masqué par suppressHydrationWarning) — les heures de passages rendues client-only après montage (calque de l'horloge fraîcheur), jambe serveur neutre.
- **patch (low)** BF4 — aria-live sur libellé re-rendu chaque seconde → spam lecteur d'écran — la zone live n'annonce QUE les transitions (échap au échec/rétablissement), la fraîcheur chiffrée hors zone live.
- **patch (low)** EC4+BF5 — fetch sans timeout (requêtes empilées, point reconnexion jamais affiché) — AbortSignal.timeout(10 s) ; EC3 — réponse 200 { ok, etat: null } → crash rendu — garde null → échec.
- **patch (low)** VG1 — interprétation réponse polling exécutée par aucun test (crash blanc NFR-5 si payload.ok retiré) — extraire interpreterReponseEtat en pur testé (erreur, ok:false, etat absent/null).
- **patch (low)** BF2+BF3+BF12 — liste missions sans marqueur « — arrivée » (le message 409 renvoie vers une mission introuvable) ; décochage silencieux par PUT qui omet le champ ; test deleteMission de la mission cochée puis re-coche (libération par suppression) — liste marquée, comportement PUT documenté (remplacement complet assumé), test suppression.
- **patch (low)** BF6 — « aucune donnée reçue » trompeur sans édition — distinguer « aucune édition configurée ».
- **patch (low)** BF10 — carte Abandonnés à 0 sans note — « saisie des abandons à venir » (réservé 5.3).
- **patch (low)** BF8+BF9+EC5+EC6+EC7 — hygiène : EtatCourseRecord/EtatCourse liés par un mapper satisfies (dérive 5.3), test 503 service + mapper toCourseApiError, tie-breaker id ASC sur l'édition courante (déjà canonique ailleurs — répliqué ici), garde !estArrivee avant le verrou (décocher ne verrouille plus inutilement), clé React board dossard+horodatage.
- **defer** VG2 — câblage formulaire → payload estArrivee non épinglé : aucun harnais composant client (convention), contrat serveur épinglé, recette humaine couvre le geste.

## Design Notes

- « Réaltime » V1 = polling 5 s : le repo n'a ni Supabase ni WebSocket ; une seule surface live (AD-7 respecté dans l'esprit — coût maîtrisé), la fraîcheur affichée honorerait un passage à SSE plus tard sans changer le contrat UI.
- « Arrivés » doit être défini, pas deviné : `mission.est_arrivee` (un par édition) donne au PC un levier explicite — sans lui, la carte affiche 0 + note, jamais un chiffre fabriqué.
- Les boards n'affichent que des passages ARBITRÉS (premier reçu) : le PC voit la vérité de classement (AD-3), pas le bruit des doublons d'appareils.
- Les abandonnés restent 0 en 5.1 : la carte existe déjà (structure stable) pour que 5.3 la remplisse sans refonte.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0026 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (agrégats, est_arrivee, routes, page, fraîcheur).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Synchroniser des scans (recette épopée 4) puis ouvrir `/admin/course` : cartes exactes, boards triés, fraîcheur vivante ; DevTools offline → chiffres figés + « reconnexion… » ; cocher un checkpoint d'arrivée en admin → carte arrivés alimentée après un passage à ce checkpoint.
