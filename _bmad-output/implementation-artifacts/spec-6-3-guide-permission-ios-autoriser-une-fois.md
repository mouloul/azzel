---
title: 'Story 6.3 — Guide permission iOS « Autoriser une fois »'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '7fbd11e'
baseline_commit: 7fbd11ed12eaf7eb7de3cb4cb3621f9c7285227e
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-6-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le piège iOS « Autoriser une fois » coupe silencieusement le suivi au premier verrouillage de l'écran : à la réouverture, le coureur ne sait pas pourquoi sa famille ne le voit plus avancer, et rien ne le guide vers « Toujours ».

**Approach:** 1) Détection au premier plan (AppState) : opt-in actif + permission perdue alors que le suivi tournait → état « interrompu » et affichage AUTOMATIQUE (une fois par interruption) de l'écran guide ; permission jamais accordée → suivi silencieusement inactif, message sans culpabilisation. 2) Écran guide à étapes numérotées : chemin complet « Réglages > Azzel > Localisation > Toujours » en exergue + bouton contour « Ouvrir les Réglages » (Linking.openSettings) ; variante Android (« Paramètres > Applications > Azzel > Autorisations > Position > Autoriser tout le temps »). 3) Rétablissement : retour au premier plan avec permission accordée → le suivi REPART seul (redémarrage du watcher, reprise bandeau), sans manipulation. 4) Le guide reste toujours accessible depuis l'écran Suivi (« Comment garder mon suivi actif ? »).

## Boundaries & Constraints

**Always:**
- Écran guide : étapes numérotées, chemin système COMPLET en exergue (copiable visuellement, jamais « va dans tes réglages ») ; bouton contour « Ouvrir les Réglages » ouvre les réglages système de l'app ; tutoiement, ton neutre — aucune culpabilisation, jamais d'urgence feinte.
- Détection au retour au premier plan UNIQUEMENT quand l'opt-in est actif (tracking désactivé = aucun check, aucun guide automatique — « rien n'est enregistré » reste littéral).
- Permission rétablie → relance automatique du watcher + sync au premier plan, aucune manipulation supplémentaire ; l'état affiché reflète la réalité (actif / actif-avant-plan / interrompu / refusé).
- Guide accessible en PERMANENCE depuis l'écran Suivi (bouton), même quand tout va bien.
- Aucune donnée nouvelle collectée ; aucun changement serveur ; iOS = parcours canonique (« Toujours »), Android = variante « Autoriser tout le temps ».
- Cibles ≥ 48 dp, chemin système lisible (pas seulement couleur), accessibilité.

**Never:**
- Pas de modification du moteur de capture/outbox/sync (6.2 livrés) hormis le branchement de redémarrage.
- Pas de nouvelle permission demandée à l'insu (les demandes restent déclenchées par le toggle opt-in) ; pas de pop-up système depuis le guide.
- Pas de backend, pas de nouvelle route API, pas de migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| « Autoriser une fois » expirée | opt-in actif, suivi qui tournait, retour premier plan, permission perdue | Écran guide affiché automatiquement (1 fois par interruption), état « interrompu » | N/A |
| Ouvrir les Réglages | bouton contour | Linking.openSettings() → réglages système de l'app ; échec → message + le chemin reste affiché | openURL rejeté → enveloppe douce |
| Permission rétablie (« Toujours ») | retour premier plan, permission accordée, opt-in actif | Watcher redémarré SEUL, bandeau reprend, guide disparaît | N/A |
| Permission refusée net | jamais accordée / refus | Suivi silencieusement inactif, texte sans culpabilisation, guide accessible via bouton | jamais d'auto-affichage du guide |
| Accès permanent | écran Suivi, tout va bien | Bouton « Comment garder mon suivi actif ? » → guide | N/A |
| Opt-in désactivé | retour premier plan | Aucun check de permission, aucun guide automatique | N/A |
| Android | Platform.OS === 'android' | Guide avec chemin Android (« Autoriser tout le temps ») | N/A |
| Premier plan répété | 3 retours, toujours interrompu | Guide auto UNE fois, puis simple état dans Suivi (pas de harcèlement) | N/A |

</frozen-after-approval>

## Code Map

- `apps/runners/src/tracking/moteur.ts` — états `EtatSuivi` (actif / actif-avant-plan / permission-refusee / inactif), `demarrer`/`arreter`, `demanderPermissionsNatives` ; y ajouter la lecture non intrusive des permissions (`getForegroundPermissionsAsync`/`getBackgroundPermissionsAsync`) sans nouvelle demande.
- `apps/runners/src/tracking/orchestration-suivi.ts` (+ tests) — décisions pures à ports injectés (toggle/logout/premier plan) : y ajouter `reprendreAuPremierPlan` (classification → redémarrer | guide | rien) et l'anti-répétition du guide (une fois par interruption).
- `apps/runners/App.tsx` — listener AppState existant (premier plan → sync) : y brancher la détection et l'écran `guide-permission` ; machine à états `Ecran` dans `app-state.ts`.
- `apps/runners/src/ecrans/suivi.tsx` — états moteur affichés, bandeau : ajouter bouton permanent vers le guide + encart état interrompu.
- `apps/runners/src/ecrans/ui.tsx` — `Bouton` (disabled/contour), `Carte`, `Surtitre`/`Titre` : composer le guide avec ces briques.
- `react-native` `Linking.openSettings()` + `Platform.OS` — API stables RN 0.88, aucune dépendance nouvelle.
- Tests : vitest node, mocks in-file (moteur mocké comme `moteur.test.ts`, Linking/Platform stubables) ; aucun test d'intégration requis (zéro serveur).

## Tasks & Acceptance

**Execution:**
- [ ] `apps/runners/src/tracking/permission.ts` (+ tests) — pures : `classierPermission({optIn, suiviTournait, avantPlanAccordee, arrierePlanAccordee, platform})` → `ok | redemarrer | interrompu | refuse | rien` ; jamais d'exception.
- [ ] `apps/runners/src/tracking/orchestration-suivi.ts` (+ tests) — `reprendreAuPremierPlan` : selon classification → redémarrer le watcher (permission revenue), marquer interrompu + demander l'affichage du guide UNE fois par interruption, ou ne rien faire (opt-in off, jamais accordée) ; retour premier plan répété sans changement → pas de re-guide.
- [ ] `apps/runners/src/ecrans/guide-permission.tsx` — étapes numérotées, chemin système complet en exergue (iOS « Réglages > Azzel > Localisation > Toujours » / Android « Paramètres > Applications > Azzel > Autorisations > Position > Autoriser tout le temps » selon `Platform.OS`), bouton contour « Ouvrir les Réglages » (`Linking.openSettings()`, échec → message doux, le chemin reste lisible), texte neutre (jamais de culpabilisation), retour vers Suivi.
- [ ] `apps/runners/src/ecrans/suivi.tsx` — bouton permanent « Comment garder mon suivi actif ? » ; état « interrompu » avec phrase factuelle (« le suivi s'est arrêté quand l'app a été verrouillée — suis le guide pour le reprendre ») ; état refusé inchangé (message doux).
- [ ] `apps/runners/App.tsx` + `src/app-state.ts` — écran `'guide-permission'` dans la machine ; listener AppState : lecture des permissions SANS demande + `reprendreAuPremierPlan` → affichage auto du guide ou redémarrage silencieux ; aucune détection quand opt-in désactivé.
- [ ] `apps/runners/src/tracking/moteur.ts` — exposer `lirePermissions()` (get* sans request*) réutilisable par l'orchestration ; le démarrage existant inchangé.
- [ ] Tests matrice — chaque rangée couverte (pures orchestration + classification ; rendu écran non testé RN, logique testée).

**Acceptance Criteria:**
- Given le suivi activé puis l'app verrouillée avec « Autoriser une fois », when le coureur rouvre l'app, then l'écran guide s'affiche automatiquement avec le chemin complet et le bouton « Ouvrir les Réglages » (UX-DR-16).
- Given la permission rétablie à « Toujours », when le coureur revient au premier plan, then le suivi repart seul et le guide disparaît — aucune manipulation.
- Given l'opt-in désactivé, when l'app revient au premier plan, then aucune vérification ni guide automatique — rien n'est enregistré.
- Given `pnpm typecheck && pnpm test`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : distinction « interrompu » (tournait + perdu = piège iOS « Autoriser une fois ») vs « refusé » (jamais accordée) — seul l'interrupt déclenche l'affichage automatique ; guide auto UNE fois par interruption (anti-harcèlement) mais bouton d'accès permanent ; aucun changement serveur.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès (nouvelles suites permission/orchestration)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | medium | Rétrogradation « Toujours » → « Pendant l'utilisation » non détectée : `suiviTournait` + avant-plan ok + arrière-plan révoqué → verdict 'ok', état 'actif' menteur (permission.ts:44-56 confirmé). | patch |
| 2 | medium | Contrat « guide ouvert via bouton jamais refermé » non tenu + transition d'écran (auto-affichage/fermeture) sans test — extraire en pure `ecranApresReprise` avec marqueur d'origine (App.tsx:202-204, AC ligne 83). | patch |
| 3 | medium | Course de deux AppState 'active' rapprochés : ref non sérialisé → double guide/double arreter ; opt-out/logout pendant reprise en vol → optIn ressuscité. Sérialiser + vérifier génération session. | patch |
| 4 | low | `etatSuiviRef.current = etatSuivi` muté pendant le render — passer par useEffect. | patch |
| 5 | low | `revenirAuPremierPlan` code mort (plus appelé) : supprimer avec ses tests. | patch |
| 6 | low | Échec `lireOptin` propage `optIn:false` à l'UI (toggle visuellement désactivé alors que la préférence est inconnue) — omettre le champ comme pour permissions null. | patch |
| 7 | low | Guide auto affiché sans mémoire d'écran d'origine (peut écraser e-dossard en course) et « Retour au suivi » perd le contexte — mémoriser l'origine. | patch |
| 8 | low | `platform` mort dans `classierPermission` — retirer (bruit API). | patch |
| 9 | low | Lecture VoiceOver hachée des étapes (badge et texte en deux focuses) — regrouper `Étape N : texte`, badge décoratif. | patch |
| 10 | medium | Session absente (écran connexion) : reprise peut afficher guide + écran suivi sans session — garde `tokenRef` avant toute reprise. | patch |
| 11 | medium | Redémarrage silencieux via `demarrer()` exécute `request*` → pop-up système possible au retour premier plan sans action coureur (interdit par Never) — démarrer sans nouvelle demande quand la permission est déjà accordée. | patch |
| 12 | low | Échec du redémarrage silencieux → état 'inactif' avec optIn actif (écran menteur) — conserver l'état précédent plutôt que prétendre. | patch |
| 13 | low | `erreurOptin` persiste désormais d'un retour à l'autre (delta vs ancien chemin) — remettre à null dans la reprise. | patch |
| 14 | low | Échec `Linking.openSettings` + sélection contenu iOS/Android non testés : exige un harnais de rendu RN absent du dépôt par conception. | différé |
