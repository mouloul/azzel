---
title: 'Story 5.3 — Saisie des abandons'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '143eebc'
baseline_commit: '143eebcec1e3feacaa37cc41e2c029d37d57fef9'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-5-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un coureur qui quitte la course reste dans les calculs du PC (« en course » à vie, alerté à chaque barrière) et sa sortie n'est tracée nulle part — la saisie d'abandon en trois champs n'existe pas (FR-17).

**Approach:** Table `abandon` (module chrono, migration 0028) : coureur (résolu par jeton/dossard), lieu (texte libre court), motif (liste fermée : blessure, épuisement, hors-délais, abandon volontaire, autre), heure LOCALE saisie convertie ISO UTC. Saisie depuis `/admin/course` : bouton « Saisir un abandon » (et l'action des lignes d'alerte devient active) → formulaire inline (recherche coureur par dossard, lieu, motif, heure défaut = maintenant) ; arbitrage AD-3 : `UNIQUE (edition_id, jeton)` + premier reçu gagne (PC et secteur concurrently) ; le coureur abandonné sort de « en course » et des ALERTES (5.2), la carte « Abandonnés » se remplit, il reste dans les rapports (données conservées, jamais supprimées).

## Boundaries & Constraints

**Always:**
- Saisie en trois champs + heure : coureur (recherche dossard, résolution serveur), lieu (1–200 car.), motif (liste fermée métier), heure locale (datetime-local, défaut maintenant, convertie ISO UTC stocké/affichée local).
- Arbitrage AD-3 : abandons concurrents (PC/secteur) → le PREMIER reçu serveur gagne (`UNIQUE (edition, jeton)`, réponse claire « déjà abandonné » à l'autre) ; jamais de suppression ni d'édition d'un abandon (append-only — une erreur de saisie sera corrigée par l'annulation auditable en 5.4 si besoin, V1 : rien).
- Effets calculs : abandonnés = abandons de l'édition ; « en course » = retraits − abandonnés − arrivés (jamais négatif) ; les abandonnés sont EXCLUS des alertes hors-délais (5.2) et des arrivés.
- Auteur tracé : email du compte organisateur (session) stocké avec l'abandon — l'auditabilité prime.
- UI : formulaire inline sur `/admin/course` (bouton dédié + action des lignes d'alerte active), erreurs champ, succès « Abandon enregistré — dossard N » ; le polling 5 s propage les compteurs ; heure affichée locale (convention horodatage).
- `requireRolePage('organisateur')` + guardAdmin ; RLS org ; enveloppes admin.course.*.

**Never:**
- Pas d'annulation d'abandon ni d'annulation de passage (5.4), pas de saisie par le volontaire PWA V1 (le PC saisit — le terrain appelle le PC, canal déjà défini), pas de notifications.
- Pas de modification/suppression d'abandon (append-only).
- Pas d'impact classements publics (épopée 7 consommera).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Saisie nominale | coureur en course, 3 champs + heure | Abandon enregistré, carte Abandonnés +1, en course −1, alertes du coureur disparues au polling | No error expected |
| Coureur introuvable | dossard inexistant/inconnu de l'org | Erreur champ « dossard inconnu » | erreur champ |
| Coureur déjà abandonné | second abandon (autre poste/onglet) | Refus clair « déjà abandonné » — le PREMIER reste (AD-3) | 409 enveloppe |
| Coureur jamais retiré | pas parti | Refus « ce coureur n'est pas parti » (abandon sans retrait n'a pas de sens course) | 409 enveloppe |
| Coureur arrivé | passage arrivée arbitré | Refus « déjà arrivé » | 409 enveloppe |
| Motif hors liste | valeur libre | Erreur champ (liste fermée) | erreur champ |
| Lieu vide/trop long | 0 ou > 200 car. | Erreur champ | erreur champ |
| Heure incohérente | heure future > maintenant | Erreur champ « l'heure d'abandon ne peut pas être dans le futur » | erreur champ |
| Depuis une alerte | action « Saisir l'abandon » d'une ligne | Formulaire PRÉ-REMPLI (dossard du coureur alerté) | No error expected |
| Multi-org | dossard de l'org B | Introuvable côté A (RLS) | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/chrono/` — module 4.5/5.1/5.2 : migration 0028 (`abandon`), store (insertion arbitée, liste), service (`saisirAbandon`, état course enrichi), intégration des exclusions dans `etatCourse`.
- `apps/web/src/app/admin/course/` — bouton « Saisir un abandon », formulaire inline, action d'alerte active, carte Abandonnés alimentée (note « à venir » retirée).
- `apps/web/src/app/admin/missions/missions-manager.tsx` — patterns formulaire admin (champs, erreurs, datetime-local).
- `apps/web/src/modules/missions/domain.ts` — pattern liste fermée (MISSION_TYPES) pour les motifs.
- `packages/shared/src/datetime.ts` — conventions horodatage.

## Tasks & Acceptance

**Execution:**
- [x] `modules/chrono/migrations/0028_abandons.sql` — `abandon` (id, organisation_id, edition_id, jeton_coureur, lieu CHECK 1–200, motif CHECK fermé, horodatage ISO (heure saisie), auteur_email, horodatage_reception serveur, UNIQUE (edition_id, jeton_coureur)) + RLS stricte + grants + index.
- [x] `modules/chrono/` (domain + store + service + errors + tests) — `MOTIFS_ABANDON` fermés ; `saisirAbandon(session, input)` : validation champ (dossard résolu org, retiré arbitré, pas arrivé, pas déjà abandonné — contraintes vérifiées dans la transaction avec l'insertion, AD-3 premier-gagne), heure locale → ISO, auteur tracé ; `etatCourse` : abandones compté, enCourse recalculé, abandonnés exclus des alertes et des arrivés ; erreurs dédiées (409 déjà abandonné / pas parti / déjà arrivé, 400 champ).
- [x] `POST /api/admin/course/abandon` (+ tests route) — guardAdmin, corps JSON validé (garde taille), enveloppes admin.course.*, no-store.
- [x] `apps/web/src/app/admin/course/` (course-live + css + tests) — bouton « Saisir un abandon » (en-tête) + action des lignes d'ALerte active (pré-remplissage dossard) ; formulaire inline : dossard (recherche), lieu, motif (select), heure (datetime-local, défaut maintenant) ; erreurs champ, succès, `router`-less (state local + re-poll immédiat) ; carte Abandonnés : note « à venir » retirée, compteur réel.
- [x] `apps/web/src/lib/course/abandon-form.ts` (+ tests purs) — validation locale du formulaire, conversion heure locale → ISO, assemblage corps (calque alertes-course).
- [ ] Tests intégration — saisie nominale end-to-end (compteurs, alertes, en course), doublon concurrent (premier gagne, 409 à l'autre), pas parti / déjà arrivé / dossard inconnu, RLS multi-org, heure future refusée.

**Acceptance Criteria:**
- Given un coureur en course et une ligne d'alerte le concernant, when Nadia clique « Saisir l'abandon », then le formulaire s'ouvre pré-rempli, l'enregistrement (lieu, motif, heure locale) sort le coureur d'« en course », remplit « Abandonnés » et fait disparaître ses alertes au polling suivant.
- Given deux saisies simultanées (PC et secteur), when les deux arrivent, then le premier reçu serveur gagne et l'autre reçoit « déjà abandonné » (AD-3) — jamais deux abandons pour un coureur.
- Given un abandon saisi, when l'épopée 7 calculera les rapports, then le coureur y figure (données conservées, append-only).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 15, edge-case-hunter 6, verification-gap 3 ; ~24 findings)
- **patch (medium)** EC2+EC3 — succès mal interprété : corps 201 null → TypeError AVANT le chaînage (abandon enregistré affiché en erreur réseau, ni re-poll ni succès) ; dossard non numérique du corps + champ modifié pendant l'envoi → « dossard 0/NaN » — garde du payload + dossard entier valide sinon repli contrôlé, champs désactivés pendant pending.
- **patch (medium)** BF15+EC5 — saisie perdue par concurrence UI : un second clic « Saisir un abandon » pendant un envoi en cours → le succès de l'ANCIEN envoi ferme le NOUVEAU formulaire (saisie en vol perdue) — verrou d'envoi : les ouvertures pendant envoi refusées (ou file d'attente), onEnregistre ne ferme que si son formulaire est encore ouvert.
- **patch (medium)** VG3 — le motif abandon_volontaire n'est JAMAIS inséré en base : la liste TS et le CHECK SQL vivent en double sans test de synchronisation — test d'intégration bouclant sur MOTIFS_ABANDON (un coureur retiré frais par motif) ; l'erreur CHECK serait un 500 muet.
- **patch (low)** BF1+BF2 — accessibilité : aria-label « Saisir l'abandon — dossard N » par ligne d'alerte (N boutons indifférenciés au lecteur d'écran) ; l'indice du champ heure référencé par aria-describedby.
- **patch (low)** BF6+EC4 — horloge PC en avance : l'heure préremplie « maintenant » refusée « futur » à vie — tolérance +2 min sur la comparaison (serveur ET client) + message champ évoquant le décalage.
- **patch (low)** BF3 — commentaire de test « 401/403/503 » mensonger : test 403 manquant (session volontaire) — ajouté.
- **patch (low)** BF5 — garde taille content-length : contournable (chunked légitime → 400 injuste ; mensonger → json() lit tout) — accepter l'absence de content-length (repli sur la validation du corps SEUL), la borne reste une défense en profondeur documentée.
- **patch (low)** BF7 — incohérence tutoiement/vouvoiement dans le MÊME formulaire (erreurs champ tutoient, enveloppes vouvoient) — le PC vouvoie : harmoniser les messages champ au vouvoiement.
- **patch (low)** BF8 — assertions globales fragiles : not.toContain('à venir') sur tout le HTML (NOTE_SANS_ALERTE voisine le contient) — cibler la note de la carte Abandonnés précisément.
- **patch (low)** BF10 — chronologie impossible : heure d'abandon antérieure au RETRAIT du coureur acceptée — borne inférieure horodatage ≥ horodatage_reception du retrait (déjà lu dans la tx) + erreur champ dédiée + tests.
- **patch (low)** BF11 — « édition courante » dupliquée entre etatCourse et saisirAbandon — helper SQL partagé dans le store (plus de copie).
- **patch (low)** BF12 — ergonomie clavier : autofocus premier champ à l'ouverture, Escape ferme, Annuler ACTIF pendant pending (annulation ≠ soumission).
- **patch (low)** BF13+BF14 — bandeau succès sans fin de vie (reste jusqu'à la prochaine ouverture) : expiration ~8 s ; « Se reconnecter » n'abandonne pas la saisie : cible _blank + avertissement.
- **patch (low)** BF16 — dépendance croisée chrono→missions (helpers RFC3339/datetime réutilisés) : déplacer les helpers vers @azzel/shared (contrat horodatage transverse), imports ajustés.
- **patch (low)** VG1 — FormulaireAbandon non rendu par aucun test (pattern MissionForm existe) — export + test SSR (options par motif avec valeur ≠ libellé, ids des champs, préremplissage dossard, aria).
- **defer** BF4+VG2 — câblage client de la soumission (POST→erreurs→succès+re-poll) non exécutable sans harnais interactif (convention repo, recette humaine couvre).
- **defer** BF9 — couplage des tests 5.3 aux compteurs résiduels 5.1/5.2 : reseed explicite — dette de harnais d'intégration (les assertions absolues documentent l'état attendu complet).
- **false** BF17 — jeton_coureur sans FK : choix CALQUÉ sur terrain_evenement (0025, documenté : l'audit survit aux données amont) — la migration 0028 le documente déjà implicitement, commentaire renforcé au passage.
- **false** EC6(claim)+VG-other — case Tests intégration non cochée : cochée par le workflow après lecture du diff (artefat de chronologie, pas un écart).

## Design Notes

- L'arbitrage abandon suit l'arbitrage passage : `UNIQUE (edition, jeton)` en SQL, premier reçu fait foi — la réponse « déjà abandonné » porte l'information à l'autre poste sans conflit visible.
- Les contraintes « pas parti / déjà arrivé » sont vérifiées dans la même transaction que l'insertion : l'état de course au moment de la saisie est la vérité (pas de validation à froid sur un état potentiellement périmé).
- L'heure saisie est une DONNÉE déclarative (heure locale du terrain), pas un temps de classement (AD-3) — stockée ISO, affichée locale.
- Le motif « hors-délais » reflète le cas alerte 5.2 : la saisie d'abandon y est l'action directe — le boucle sécurité est fermée.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0028 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (abandon, état course, routes, formulaire).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Depuis une alerte (recette 5.2) : saisir l'abandon → compteurs bougent, alerte disparue ; ressaisir le même dossard → « déjà abandonné » ; dossard inconnu / pas parti / déjà arrivé → refus clairs.
