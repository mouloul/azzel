---
title: 'Story 4.6 — Résolution non ambiguë du checkpoint'
type: 'fix'
created: '2026-11-07'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '534452c'
baseline_commit: '534452c615bbe71222b836b6611a4c2718342045'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
  - {project-root}/_bmad-output/implementation-artifacts/spec-4-4-scan-de-passage-aux-checkpoints.md
warnings:
  - "Prérequis de la story 4.7 (scanner depuis la poche), qui réutilise cette résolution."
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le checkpoint d'un passage vient de la mission affectée au volontaire, et `missionTypeEnCours` la choisit ainsi : la première mission du type dont la fenêtre `[debutLe, finLe]` contient l'instant, **sinon la première de la liste**. Ce repli était sûr tant qu'un volontaire ne tenait qu'une mission de scan. Dès qu'il en tient deux — checkpoint 1 de 9h à 12h, checkpoint 4 de 14h à 18h — il devient faux :

- **Creux** : à 13h, aucune fenêtre ne couvre l'instant → repli sur le checkpoint 1. Un coureur scanné au checkpoint 4 est enregistré comme passé au checkpoint 1.
- **Chevauchement** : l'avertissement de chevauchement à l'affectation est **non bloquant** (décision 3.2). Deux missions peuvent donc couvrir 10h30 ; `find` prend la première de la liste.

Dans les deux cas l'erreur est **silencieuse** : le voyant affiche « ✓ Passage enregistré », le bip part, l'événement entre dans l'outbox avec la clé naturelle (édition, coureur, **mauvais checkpoint**) et le serveur l'accepte — rien ne cloche de son point de vue. Les temps intermédiaires, les alertes hors-délais du PC (5.2) et les classements (7.1) en héritent.

**Approach:** Remplacer le repli aveugle par une résolution qui **refuse de deviner**. Une seule mission de scan → comportement actuel conservé (aucune ambiguïté possible, le repli sert la préparation avant la course). Plusieurs missions → la fenêtre exacte décide ; à défaut une tolérance de débordement bornée et **symétrique** (±30 min) rattrape le dernier coureur et l'arrivée en avance ; et dès que deux missions restent candidates, ou qu'aucune ne l'est, le scanner **bloque** avec un écran qui dit quoi faire : appeler le PC. L'organisateur corrige l'affectation, le volontaire recharge.

## Boundaries & Constraints

**Always:**
- Volontaire avec **une seule** mission du type : résolution inchangée — cette mission, à toute heure, fenêtre ou pas. C'est le cas majoritaire et il ne porte aucune ambiguïté.
- Volontaire avec **plusieurs** missions du type, par ordre de priorité :
  1. les missions dont `[debutLe, finLe]` contient l'instant ;
  2. à défaut, celles dont la fenêtre est à moins de `TOLERANCE_CRENEAU_MS` (30 min) avant `debutLe` ou après `finLe` ;
  3. à défaut, aucune.
- Exactement **une** candidate → c'est elle. **Deux ou plus** → blocage « chevauchement ». **Zéro** → blocage « hors créneau ». Jamais de choix par ordre de liste.
- La résolution raisonne **par famille de mission** : deux `scan_checkpoint` qui se chevauchent bloquent ; une mission guichet et une mission checkpoint qui se chevauchent ne bloquent pas — ce sont deux scanners distincts, chacun sait quoi faire.
- Écrans de blocage distincts et explicites, chacun avec le bouton d'appel PC et le retour fiche : « Deux missions se chevauchent sur ce créneau » / « Aucune mission de scan en cours ». Le libellé nomme les missions concernées et leurs horaires — l'organisateur doit savoir quoi corriger sans deviner.
- `TOLERANCE_CRENEAU_MS` est une constante nommée et exportée, modifiable en une ligne après la recette.
- La résolution reste une **fonction pure**, partagée par la page scanner et la fiche volontaire — une seule source, comme aujourd'hui.

**Never:**
- Pas de choix par ordre de liste, ni par identifiant, ni par date de création : si la machine ne peut pas trancher, elle refuse.
- Pas de blocage de l'affectation côté admin : l'avertissement de chevauchement reste informatif (3.2). Le coup d'arrêt tombe là où l'ambiguïté ferait des dégâts — au moment d'écrire un passage.
- Pas de sélecteur de checkpoint dans le scanner : le volontaire ne choisit pas son point de contrôle, l'organisateur l'affecte. Un sélecteur rouvrirait exactement l'erreur qu'on ferme.
- Pas de changement de la clé naturelle du Passage, du format QR, ni du contrat `shared`.
- Pas de tolérance pour le volontaire à mission unique : il n'en a pas besoin, et en ajouter une changerait un comportement qui marche.

## I/O & Edge-Case Matrix

| Scénario | Missions du type | Instant | Résultat attendu |
|----------|------------------|---------|------------------|
| Mission unique, en fenêtre | CP1 9h–12h | 10h30 | CP1 |
| Mission unique, hors fenêtre | CP1 9h–12h | 7h00 | CP1 (préparation — inchangé) |
| Mission unique, bien après | CP1 9h–12h | 20h00 | CP1 (inchangé) |
| Deux missions, une en fenêtre | CP1 9h–12h, CP4 14h–18h | 10h30 | CP1 |
| Deux missions, l'autre en fenêtre | idem | 15h00 | CP4 |
| Débordement toléré | idem | 12h20 | CP1 (≤ 30 min après `finLe`) |
| Arrivée en avance tolérée | idem | 13h45 | CP4 (≤ 30 min avant `debutLe`) |
| Creux franc | idem (écart de 2 h) | 12h31 → 13h29 | **Blocage** « aucune mission en cours » sur toute la plage |
| Après la dernière, hors tolérance | idem | 19h30 | **Blocage** « aucune mission en cours » |
| Chevauchement réel | CP1 9h–12h, CP4 11h–14h | 11h30 | **Blocage** « chevauchement », les deux missions nommées |
| Tolérances qui se recouvrent | CP1 9h–12h, CP4 12h–16h | 12h00 | **Blocage** « chevauchement » (deux candidates) |
| Familles différentes | guichet 8h–10h, CP1 9h–12h | 9h30 | Aucun blocage : guichet pour le retrait, CP1 pour les passages |
| Aucune mission du type | — | — | Redirection douce vers la fiche (gating 4.3/4.4 inchangé) |
| Bornes incluses | CP1 9h–12h | 9h00 et 12h00 | CP1 (fenêtre fermée des deux côtés, comme aujourd'hui) |

</frozen-after-approval>

## Code Map

| Fichier | Rôle dans la story |
|---------|--------------------|
| `apps/web/src/modules/missions/domain.ts` | `FAMILLE_SCAN: Record<MissionType, 'chrono' \| 'retrait' \| null>` — le regroupement des six types, posé une fois. Les deux helpers en dérivent au lieu de tester l'égalité chacun de leur côté. |
| `apps/web/src/lib/scan/mission-scan.ts` | `missionTypeEnCours` renvoie désormais un résultat **discriminé** : `{ ok: true, mission }`, `{ ok: false, raison: 'chevauchement', missions }`, `{ ok: false, raison: 'hors-creneau', missions }`, ou `null` (aucune mission du type). `TOLERANCE_CRENEAU_MS` y vit. |
| `apps/web/src/app/volontaires/scan/page.tsx` | Traduit le résultat : mission → `ScanClient` ; blocage → écran dédié ; `null` → redirection douce existante. |
| `apps/web/src/app/volontaires/volontaires-pwa.tsx` | L'entrée « Démarrer le scan » de la fiche consomme le même résultat : visible et active quand une mission est résolue, visible et explicative en cas de blocage. |
| `apps/web/src/lib/scan/mission-scan.test.ts` | Toute la matrice, en pur. |
| `apps/web/src/app/volontaires/scan/page.test.tsx` | Les deux écrans de blocage, leur contenu et leurs cibles. |

## Tasks & Acceptance

| ID | Critère |
|----|---------|
| AC1 | Volontaire à **une seule** mission du type : résolution identique à aujourd'hui, à toute heure (non-régression explicite, fenêtre et hors fenêtre). |
| AC2 | Plusieurs missions, une seule en fenêtre : c'est elle, quel que soit son rang dans la liste. |
| AC3 | Plusieurs missions, aucune en fenêtre, **une seule** dans la tolérance de ±`TOLERANCE_CRENEAU_MS` : c'est elle (débordement et avance en amont tous deux couverts). |
| AC4 | Plusieurs missions, **deux ou plus** candidates (en fenêtre ou en tolérance) : blocage « chevauchement », aucune mission retournée, les missions concernées et leurs horaires nommés à l'écran. |
| AC5 | Plusieurs missions, **aucune** candidate : blocage « hors créneau », avec les horaires des missions pour que le volontaire sache quand revenir. |
| AC11 | La tolérance est assez courte pour laisser un vrai creux : sur CP1 9h–12h puis CP4 14h–18h, la plage 12h31 → 13h29 bloque. Une tolérance qui refermerait le creux ferait basculer les scans sur le checkpoint suivant pendant que le volontaire finit le précédent. |
| AC6 | Aucun blocage ne dépend de l'ordre de la liste : une même situation donne le même résultat quel que soit l'ordre des missions en entrée (test avec la liste inversée). |
| AC7 | Les deux écrans de blocage portent le bouton d'appel PC et le retour fiche, cibles ≥ 44 px, texte intégral — jamais la couleur seule. |
| AC8 | Le blocage s'apprécie **par famille** : une mission guichet et une mission checkpoint qui se chevauchent ne bloquent ni l'un ni l'autre scanner. |
| AC9 | `FAMILLE_SCAN` couvre les six types ; ajouter un type sans le classer casse la compilation (exhaustivité `Record<MissionType, …>`). |
| AC10 | Aucune mission du type : la redirection douce de 4.3/4.4 et son message dédié sont inchangés. |

## Plan de tests

**Unitaires purs** (`lib/scan/mission-scan.test.ts`) : toute la matrice ci-dessus, dans les deux familles. Plus **AC6** : chaque cas rejoué avec la liste des missions inversée, en exigeant le même résultat — c'est le test qui empêche le retour du « premier de la liste ».

**Domaine** (`modules/missions/missions.test.ts`) : `FAMILLE_SCAN` exhaustive, et les deux helpers dérivés qui ne sélectionnent que leur famille.

**Serveur et rendu** (`scan/page.test.tsx`, SSR) : chaque écran de blocage, son contenu, ses cibles ; non-régression des redirections douces.

**Non couvert sans harnais DOM** : rien de nouveau — toute la décision vit dans des fonctions pures, c'est le but.

## Design Notes

**Pourquoi refuser plutôt que choisir.** Une attribution fausse est pire qu'un scan manqué : elle est silencieuse, elle entre dans l'outbox avec une clé valide, le serveur l'accepte, et elle ressort dans un classement. Un refus, lui, est visible immédiatement et se corrige en trente secondes côté admin. Le produit a déjà ce réflexe ailleurs — un secteur portant des missions refuse d'être supprimé plutôt que de cascader en silence.

**Pourquoi une tolérance symétrique.** Le besoin terrain est asymétrique en apparence (le dernier coureur passe après l'heure), mais le volontaire arrive aussi en avance à son poste suivant. Une tolérance des deux côtés traite les deux cas avec une seule règle, et réduit le creux à la zone où personne — pas même le volontaire — ne peut trancher honnêtement.

**Pourquoi 30 minutes et pas 60.** La première version tolérait une heure. Les tests ont montré la conséquence : avec deux créneaux espacés de 2 h, les tolérances se touchaient et il n'existait plus aucun instant sans candidate — un scan à 13h01 partait sur le checkpoint suivant alors que le volontaire finissait peut-être le précédent. La tolérance refermait le creux au lieu de le border. À 30 minutes, elle rattrape le dernier coureur de 12h20 et laisse la plage 12h31 → 13h29 sans réponse, donc au PC. Une tolérance doit couvrir un débordement, pas remplacer une décision d'organisation.

**Pourquoi pas de sélecteur.** Laisser le volontaire choisir son checkpoint rouvrirait l'erreur par un autre chemin : un doigt qui dérape sur une liste vaut un `missionsDuType[0]`. Le checkpoint est une décision d'organisation, elle se corrige côté organisation.

**Ce que cette story ne corrige pas.** L'avertissement de chevauchement reste non bloquant à l'affectation : un organisateur peut toujours créer la situation, il la découvrira quand le scanner bloquera. Rendre l'affectation bloquante est une autre décision (3.2), à prendre séparément si la recette montre que le cas se produit souvent.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm build` verts.
- Recette : module à ajouter dans `scenarios-recette-epic-4.md` — affecter un volontaire à deux checkpoints avec un creux, ouvrir le scanner pendant le creux (blocage attendu), étendre un horaire côté admin, recharger (scanner accessible) ; puis créer un chevauchement en ignorant l'avertissement et vérifier le second écran de blocage.
