---
title: 'Story 5.2 — Alertes hors-délais'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'dea9a28'
baseline_commit: 'dea9a28a8eef2ad6e902e01a300d475deb181942'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-5-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La sécurité des coureurs repose sur la vigilance humaine : rien n'alerte le PC quand un coureur n'a pas franchi un checkpoint avant sa barrière horaire (FR-25, UX-DR-12).

**Approach:** Barrières horaires par checkpoint : champ `barriere_le` (facultatif) sur la mission `scan_checkpoint` (formulaire admin, horaire datetime-local). Bloc d'alertes sur `/admin/course` : coureurs **attendus et non passés** après la barrière → bloc danger clignotant (période ≥ 1 s, statique sous `prefers-reduced-motion`), texte intégral « Dossard N — pas vu à {checkpoint} depuis {barrière} », actions directes « Appeler le secteur » (`tel:` du contact de la mission — si renseigné) et « Saisir l'abandon » (ancre/lien vers 5.3 — bouton désactivé V1 avec libellé « à venir »). Calcul côté serveur dans `getEtatCourse` (le polling 5 s propage), l'alerte disparaît dès réception du passage (arbitré). Alerte batterie : HORS PÉRIMÈTRE V1 (tracking = épopée 6) — note dans le bloc si vide.

## Boundaries & Constraints

**Always:**
- Attendu = coureur **retiré** (retrait arbitré) SANS passage arbitré au checkpoint APRÈS `barriere_le` (heure serveur > barrière) ; l'alerte part dès que la barrière est passée, pas avant.
- Bloc danger UX-DR-12 : clignotement borné ≥ 1 s de période, désactivé sous `prefers-reduced-motion` (le texte intégral porte alors seul l'alerte) ; chaque alerte = une ligne complète (dossard mono, checkpoint, barrière), JAMAIS la couleur seule.
- Actions directes PAR ligne : « Appeler le secteur » = `tel:` du contact de la mission du checkpoint (absent → libellé « contact du secteur non renseigné », lien inactif) ; « Saisir l'abandon » = bouton présent mais désactivé avec libellé « à venir (5.3) » V1.
- Résolution d'identité côté serveur uniquement (dossards) ; calculs sur horodatage serveur (AD-3).
- `barriere_le` facultatif, RFC3339 UTC stocké, datetime-local saisi ; nullable → pas d'alerte ; barrière ≥ début de mission sinon erreur champ ; affichée dans la liste admin des missions.
- Les alertes vivent avec le polling 5 s existant : fraîcheur inchangée, alertes réémises/retirées à chaque état (aucune persistance locale V1).

**Never:**
- Pas de saisie d'abandon fonctionnelle (5.3 — bouton désactivé explicitement), pas de notifications externes (email/SMS), pas d'alerte batterie (épopée 6).
- Pas de nouvelle page : bloc dans `/admin/course` (au-dessus des boards).
- Pas de suppression ni modification d'événements (lecture seule).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Alerte nominale | retiré, barrière passée, pas de passage | Bloc danger : « ⚠ Dossard N — pas vu à {checkpoint} depuis {HH:MM} » + actions | No error expected |
| Passage arrive | passage arbitré reçu après alerte | L'alerte DISPARAÎT au polling suivant | No error expected |
| Barrière non atteinte | barrière dans le futur | Pas d'alerte (coureur simplement attendu) | No error expected |
| Sans barrière | barriere_le NULL | Pas d'alerte pour ce checkpoint | No error expected |
| Coureur non retiré | pas parti | Jamais alerté (attendu = retiré uniquement) | No error expected |
| Coureur abandonné (5.3 futur) | abandon existant | Plus alerté (implémenté avec 5.3 — V1 : les abandonnés n'existent pas encore) | No error expected |
| Contact absent | secteur sans contact | « Appeler le secteur » inactif + libellé « contact non renseigné » | No error expected |
| prefers-reduced-motion | media query | Clignotement statique, texte intégral seul | No error expected |
| Aucune alerte | aucune barrière franchie | Bloc absent (ou note discrète) | No error expected |
| Barrière incohérente | barriere_le < debut_le | Erreur champ à la création/édition | erreur champ |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/admin/course/` (course-live, page, css) : bloc alertes au-dessus des boards, lignes avec actions, clignotement CSS borné + reduced-motion.
- `apps/web/src/modules/chrono/` — `etatCourse` : calcul des alertes (attendus non passés par checkpoint à barrière), exposition contact secteur (join mission → secteur).
- `apps/web/src/modules/missions/` — `barriere_le` : migration `0027_mission_barriere.sql`, domaine (facultatif, RFC3339, ≥ debutLe), formulaire (datetime-local, scan_checkpoint uniquement), liste admin.
- `apps/web/src/app/admin/missions/missions-manager.tsx` — patterns datetime-local + erreurs champ.

## Tasks & Acceptance

**Execution:**
- [x] `modules/missions/migrations/0027_mission_barriere.sql` — `mission.barriere_le timestamptz` nullable ; domaine : RFC3339 strict OU null, ≥ debutLe (erreur champ) ; formulaire admin : champ datetime-local « Barrière horaire (facultative) » réservé scan_checkpoint ; affichage dans la liste + tests.
- [x] `modules/chrono/` (store + service + tests) — `etatCourse` gagne `alertes: [{ dossard, checkpointId, checkpointTitre, barriereLe, contactSecteur|null }]` : retirés arbitrés résolus SANS passage arbitré au checkpoint, heure serveur > barrière ; contact du secteur de la mission (join) ; tests intégration (alerte émise, disparition au passage, barrière future/absente, non retiré, résolution dossard).
- [x] `apps/web/src/app/admin/course/` (course-live + css + tests) — bloc danger (`.course-alertes`) : lignes « ⚠ Dossard N — pas vu à {checkpoint} depuis {HH:MM} » + « Appeler le secteur » (`tel:` si contact, sinon libellé inactif) + « Saisir l'abandon (à venir) » désactivé ; clignotement `animation 1s steps(2)` + `prefers-reduced-motion: none` ; vide → bloc absent ; tests page (rendu, actions, reduced-motion CSS, absence).
- [x] `apps/web/src/lib/course/alertes-course.ts` (+ tests purs) — dérivations d'affichage : libellé « depuis HH:MM » (heure locale), tri (dossard croissant), statut contact — calque fraicheur-course.

**Acceptance Criteria:**
- Given un coureur retiré attendu au checkpoint km 12 (barrière 10:00) sans passage à 10:05, when Nadia regarde `/admin/course`, then le bloc danger affiche « ⚠ Dossard N — pas vu à Scan km 12 depuis 10:00 » avec les deux actions — clignotant, statique sous reduced-motion.
- Given le passage du coureur synchronisé à 10:12, when le polling rafraîchit, then l'alerte disparaît (le passage arbitré règle la question).
- Given un checkpoint sans barrière ou une barrière future, when l'état se calcule, then aucune alerte n'est émise.

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 10, edge-case-hunter 6, verification-gap 4 ; ~20 findings)
- **patch (medium)** BF1 — alerte obsolète : un coureur ARRIVÉ (passage arbitré au checkpoint est_arrivee) reste alerté aux checkpoints intermédiaires — exclusion des arrivés du calcul d'alertes (la sécurité est réglée ; l'ordre de parcours complet affinera en épopée 7), test corrigé en conséquence.
- **patch (medium)** BF4+EC3+VG-other — bascule de type sans reset : barrière/arrivée masquées mais conservées → 400 sur champ invisible, focus perdu — reset des champs dépendants au changement de type (≠ scan_checkpoint → barriereLe '', estArrivee false), idem estArrivee préexistant.
- **patch (low)** VG1+VG2+VG3 — tests manquants : UPDATE avec barrière (posée/modifiée/effacée — mock store + étape intégration), assemblage du corps formulaire extrait en pur testé ('' → null, ISO, champ toujours présent), contactSecteur NON NULL observé en intégration (fixture contact sur le secteur qui alerte).
- **patch (low)** BF3+EC5+VG-other — bombe temporelle : barrière « future » codée en dur 2027 — dérivée de l'heure d'exécution (now + 1 h) ; + découplage : le checkpoint col passé semé dans beforeAll (plus de dépendance inter-tests).
- **patch (low)** BF6 — barrière postérieure à finLe acceptée (alerte après démontage du checkpoint) — règle debutLe ≤ barriereLe ≤ finLe (erreur champ + CHECK SQL ajusté) + tests.
- **patch (low)** EC1+EC4 — payload alertes absent/non-tableau → crash de rendu : normalisation défensive à l'interprétation (Array.isArray, défaut []) ; barriereLe non-chaîne non-null → ERREUR champ (plus de null silencieux qui désarme l'alerte) + test.
- **patch (low)** BF7 — libellés produit : « Saisir l'abandon — bientôt disponible » et « arrive avec le suivi GPS » (plus de numéros de story/épopée visibles du PC) ; assertions ajustées.
- **patch (low)** BF8+BF9+EC6 — hygiène : garde CSS ciblée sur le BOUTON abandon (disabled précis, regex animation assouplie), tel:+ dégénéré filtré (au moins un chiffre requis).
- **defer** BF2 — alertes non scopées par épreuve (retiré de la Moyenne alerté aux checkpoints de la Longue) : sans modèle de parcours/checkpoint-épreuve, règle structurelle impossible V1 — note opérationnelle Design Notes, épopée 7 (parcours) tranchera.
- **defer** BF5 — acquittement/durée de vie des alertes (traitées par téléphone indiscernables des neuves) : décision produit ultérieure — l'arrivée et l'abandon (5.3) règlent les cas principaux.
- **defer** VG4 — branchement de l'heure locale après montage (vs emplacement --:--) : aucun harnais rendu client (convention), helper pur et branche pré-montage épinglés.
- **false** EC2 — retrait APRÈS la barrière = fausse alerte ? Non : parti après l'heure limite, le coureur ne franchira jamais dans les temps — l'alerte est factuelle et utile (le PC voit le cas), pas un faux positif.

## Design Notes

- Le calcul d'alerte vit côté SERVEUR dans `etatCourse` : une seule vérité (arbitrage AD-3), le polling propage — pas de timer client fragile désynchronisé du PC.
- « Attendu » = retiré : un coureur jamais parti au guichet n'alerte pas (ce serait le retrait/absence, une autre question opérationnelle).
- L'alerte batterie (UX-DR-12 `[ASSUMPTION]`) dépend du tracking (épopée 6) : le bloc prévoit la place, le PRD la confirme Should — rien n'est bâti sur du vent V1.
- LIMITE CONNUE V1 : les barrières s'appliquent à TOUS les retirés de l'édition, sans lien épreuve↔checkpoint (pas de modèle de parcours) — un coureur de la Moyenne peut alerter sur un checkpoint de la Longue si l'organisateur barre tous les checkpoints ; l'arrivée exclut de toutes les alertes. Le parcours par épreuve (épopée 7) affinera.
- « Saisir l'abandon » est rendu désactivé avec libellé « à venir (5.3) » : l'emplacement de l'action est gravé dans le muscle du PC avant que 5.3 n'arrive.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0027 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (barrière, alertes, page, dérivations).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Mission scan avec barrière T+30 min, coureur retiré sans passage, avancer l'horloge (ou barrière passée) → alerte clignotante + actions ; synchroniser le passage → alerte disparue ; prefers-reduced-motion simulé → statique ; contact absent → action inactive.
