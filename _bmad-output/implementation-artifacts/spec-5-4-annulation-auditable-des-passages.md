---
title: 'Story 5.4 — Annulation auditable des passages'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'bd5abef'
baseline_commit: 'bd5abefdd8fac689ec2cefc480d8f6089fe72c74'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-5-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un passage erroné (mauvais scan, mauvais coureur) fausse le chrono pour toujours : aucune surface ne permet de le corriger, et l'interdiction absolue de suppression (AD-8) n'a pas encore son exutoire — l'annulation auditable n'existe pas.

**Approach:** Table `annulation` (module chrono, migration 0029) : une annulation cible UN `terrain_evenement` (passage ou retrait), porte un motif (1–500), l'auteur (email session) et l'horodatage serveur. L'événement annulé reste INTACT (jamais modifié ni supprimé) ; les lectures arbitrées (`etatCourse`, `premierRecu`) l'EXCLUENT — un passage annulé est neutre pour les boards/compteurs/alertes/arrivés. Si l'annulation retire le premier reçu d'une clé naturelle, le SUIVANT non annulé devient le premier (ré-arbitrage en lecture). UI : les lignes des boards `/admin/course` deviennent actionnables (« … »/bouton « Annuler ce passage ») → confirmation avec motif obligatoire ; annulation idempotente (déjà annulé → message clair, pas d'erreur) ; re-poll immédiat. Aucune autre surface (PWA/app) ne permet d'annuler.

## Boundaries & Constraints

**Always:**
- AD-8 strict : `terrain_evenement` reste append-only INTACT — l'annulation est un ÉVÉNEMENT séparé ; l'audit complet (auteur, horodatage, motif) vit dans `annulation` ; l'événement original reste lisible pour les rapports (épopée 7 : « passages annulés » comme donnée).
- Ré-arbitrage en lecture : `premierRecu`/`etatCourse` excluent les événements annulés — si le premier reçu d'un coureur×checkpoint est annulé, le suivant non annulé fait foi (l'ordre des horodatages serveur des événements restants tranche).
- Idempotence : annuler un événement déjà annulé → succès « déjà annulé » (pas d'erreur, pas de double ligne) ; UNIQUE (evenement_id) en base.
- Cible validée : l'événement doit exister DANS l'organisation (RLS) et l'édition courante ; motif obligatoire 1–500 ; auteur = email session.
- UI : bouton par ligne de board (visible au survol ET au focus clavier, aria-label « Annuler le passage — dossard N à {checkpoint} »), dialogue de confirmation inline avec motif OBLIGATOIRE, résultat « Passage annulé — dossard N », re-poll immédiat ; le board retire la ligne au polling suivant.
- Les compteurs suivent : arrivés/en course/abandonnés recalculés (un arrivé dont le passage d'arrivée est annulé repart « en course ») ; alertes recalculées.
- `requireRolePage`/`guardAdmin`, RLS, enveloppes admin.course.*, horodatages serveur.

**Never:**
- Aucune suppression ni mutation de `terrain_evenement` (AD-8) ; aucune annulation d'abandon V1 (l'abandon est déclaratif, sa correction viendrait d'un besoin réel — pas construit sur du vent).
- Pas d'annulation depuis la PWA/l'app (admin PC uniquement).
- Pas d'historique d'annulations côté UI V1 (les annulations sont visibles en base — surface rapport en épopée 7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Annulation nominale | passage affiché sur un board | Confirmation motif → « Passage annulé », ligne disparue au re-poll, compteurs recalculés | No error expected |
| Ré-arbitrage | le premier reçu annulé, un second existe | Le SECOND devient la ligne du board (heure du second) | No error expected |
| Plus que ce passage | annulation du seul passage du coureur à ce checkpoint | Ligne disparue, coureur redevient « attendu » (alerte si barrière passée) | No error expected |
| Arrivée annulée | passage au checkpoint est_arrivee annulé | Arrivés −1, en course +1, alertes recalculées | No error expected |
| Déjà annulé | double clic/rejeu | Succès « déjà annulé », aucune seconde ligne | idempotent |
| Motif vide | confirmation sans motif | Erreur champ « le motif est obligatoire » | erreur champ |
| Événement d'une autre org | id deviné | 404 introuvable (RLS) | enveloppe |
| Retrait annulable ? | cible type retrait | REFUS V1 : « seuls les passages peuvent être annulés » (le retrait erroné = correction guichet, besoin séparé) | 409 enveloppe |
| Événement inexistant | uuid inconnu | 404 | enveloppe |
| Multi-org | événement org B | Invisible/introuvable côté A | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/chrono/` — migration 0029, `etatCourse`/`premierRecu` à EXCLURE les annulés (NOT EXISTS), service `annulerPassage`.
- `apps/web/src/app/admin/course/` — boards actionnables, dialogue confirmation, tests.
- `apps/web/src/app/admin/course/course-live.tsx` — patterns formulaire inline (abandon 5.3) à calquer.
- `apps/web/src/modules/chrono/abandon-form.ts` / `lib/course/` — calques purs.

## Tasks & Acceptance

**Execution:**
- [x] `modules/chrono/migrations/0029_annulations.sql` — `annulation` (id, organisation_id, evenement_id REFERENCES terrain_evenement UNIQUE, motif CHECK 1–500, auteur_email, horodatage_reception DEFAULT now()) + RLS stricte + REVOKE UPDATE/DELETE (append-only) + grants.
- [x] `modules/chrono/` (store + service + errors + tests) — `annulerPassage(session, { evenementId, motif })` : cible = événement PASSAGE de l'édition courante org-scopé (retrait → 409 dédié), insertion idempotente (UNIQUE evenement_id, ON CONFLICT → « déjà annulé ») ; `etatCourse`/`premierRecu` : toutes lectures arbitrées excluent les annulés (NOT EXISTS annulation) — ré-arbitrage automatique ; tests unitaires + intégration (nominal, ré-arbitrage second fait foi, annulation unique passage → retour au vide, arrivée annulée → en course, idempotence, retrait refusé, RLS, compteurs/alertes recalculés).
- [x] `POST /api/admin/course/annulation` (+ tests route) — guardAdmin, garde corps, enveloppes admin.course.*, no-store.
- [x] `apps/web/src/app/admin/course/` (course-live + css + tests) — chaque ligne de board porte un bouton « Annuler » (aria-label complet, visible hover+focus) → dialogue inline : motif textarea OBLIGATOIRE + confirmer/annuler ; chargement, succès « Passage annulé », re-poll immédiat ; erreurs 409/404 affichées proprement.
- [x] `apps/web/src/lib/course/annulation-form.ts` (+ tests purs) — validation motif (1–500), assemblage corps (calque abandon-form).
- [x] Tests page — bouton par ligne, dialogue, aria, exclusion des lignes des boards non cliquables existants.

**Acceptance Criteria:**
- Given un passage erroné affiché sur un board, when Nadia l'annule avec motif, then la ligne disparaît, les compteurs/alertes se recalculent (ré-arbitrage : le second passage fait foi s'il existe) — et l'événement original reste INTACT en base avec son annulation tracée (auteur, horodatage, motif).
- Given un double clic sur « Confirmer », when la seconde requête arrive, then « déjà annulé » sans erreur ni double ligne.
- Given une tentative d'annuler un retrait, when la requête part, then refus clair « seuls les passages peuvent être annulés » (V1).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 12, edge-case-hunter 4, verification-gap 3 ; ~19 findings)
- **patch (high)** VG1+EC1 — contradiction vivante : l'annulation d'un passage d'ARRIVÉE repasse le coureur « en course » (board), mais la garde « déjà arrivé » de saisirAbandon ignore les annulations → l'abandon du coureur redevenu en course est refusé à jamais — NOT EXISTS symétrique dans la garde + test d'intégration croisement (annuler arrivée → abandon réussit).
- **patch (medium)** BF1+EC2 — Escape pendant l'envoi : le fieldset disabled fait perdre le focus → le onKeyDown du form ne reçoit plus rien (commentaire mensonger) ET la fermeture pendant l'envoi laisse le fetch courir (setServerError/déclenchement tardifs) — onKeyDown écouté tant que le dialogue est ouvert (pas dépendant du focus interne), fermeture pendant envoi = annulation logique (réponse tardive ignorée via numéro d'ouverture, calque abandon).
- **patch (medium)** BF11 — bandeau succès tardif croisé : le succès d'une ANNULATION peut surgir pendant que le formulaire d'ABANDON est ouvert (minuterie/état partagés) — les succès ne posent leur bandeau QUE si leur propre surface est encore active.
- **patch (low)** BF2 — erreur serveur fields.evenementId jamais affichée (le dialogue ne rend que le motif) — rendue + focus.
- **patch (low)** BF3 — rôle dialog incomplet : role="dialog"/aria-modal, focus piégé (Tab cycle), hint AD-8 relié par aria-describedby au textarea motif.
- **patch (low)** BF4 — irréversibilité non signalée : le dialogue avertit « opération définitive — aucun retour arrière » (REVOKE UPDATE/DELETE = rien ne peut défaire).
- **patch (low)** BF5 — la cible du dialogue gagne l'horodatage du passage (« Passage dossard N à {checkpoint} — {HH:MM:SS} ») : identification du doublon avant confirmation.
- **patch (low)** EC3 — résolution du dossard cible sans status='validé' : un événement pilote par un coureur non validé serait annulable « à l'aveugle » (201 pour un invisible) — symétrie avec dossardParJeton.
- **patch (low)** EC4+VG3 — reduced-motion : la transition d'opacité du bouton « … » coupée ; assertion CSS hover ÉPINGLANT opacity:1 (la déclaration, pas le sélecteur seul).
- **patch (low)** BF6+BF7 — défense en profondeur : FK composite (UNIQUE (organisation_id, id) sur terrain_evenement → FK annulation composite) rendant la cohérence org STRUCTURELLE ; horodatage d'audit : now() SQL (DEFAULT conservé, le service ne passe plus maintenant) — cohérence avec l'ordre d'arbitrage.
- **patch (low)** BF10 — garde taille : test du contour réel (content-length ABSENT + gros corps chunked → la garde ne borne pas, la validation du corps tranche) documenté et épinglé.
- **patch (low)** BF12 — naming partagé abandon/annulation (SUCCES_ABANDON_MS, .course-abandon-succes réutilisés par 5.4) : alias sémantiques (SUCCES_DIALOGUE_MS, .course-dialogue-succes) pour stopper la dérive.
- **defer** BF9+VG2 — câblage client du dialogue (POST/erreurs/re-poll) : aucun harnais interactif (convention, calque 5.3 en l'état — recette humaine).
- **defer** BF8 — flakiness potentielle des tests d'intégration (tie-break UUID si même milliseconde) : les attendre(10) actuels suffisent en pratique, fixtures à horodatages injectés = dette de harnais.
- **rejeté (low)** BF13 — NOT EXISTS sur les retraits « code mort V1 » : hypothèse d'avenir DOCUMENTÉE (l'annulation de retrait viendra) — la cohérence de lecture est un invariant, pas une couverture.

## Design Notes

- L'annulation est un ÉVÉNEMENT, pas une mutation : `terrain_evenement` reste la vérité brute (l'épopée 7 rendra « passages annulés » dans les rapports) — les lectures arbitrées filtrent par NOT EXISTS, index UNIQUE sur evenement_id.
- Le ré-arbitrage « second fait foi » tombe GRATUITEMENT : les requêtes DISTRICT ON ordonnent les événements restants — exclure l'annulé suffit, jamais de réécriture.
- L'annulation du retrait est refusée V1 : le besoin réel (guichet corrige un retrait erroné) implique de rouvrir « présent au départ » — une sémantique différente, construite sur demande.
- Le dialogue suit le gabarit abandon 5.3 : inline, motif obligatoire, re-poll immédiat — le geste de correction du PC reste UN seul muscle.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0029 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (annulation, ré-arbitrage, routes, UI).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Board km 12 : annuler le passage du dossard 101 avec motif → ligne disparue, « en course » recalculé, un second scan du 101 (non annulé) devient la ligne ; re-cliquer sur une ligne déjà annulée (rejeu curl) → « déjà annulé » ; psql : terrain_evenement INTACT, annulation tracée.
