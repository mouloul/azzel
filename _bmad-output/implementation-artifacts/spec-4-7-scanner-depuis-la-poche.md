---
title: 'Story 4.7 — Scanner depuis la poche quand la base est muette'
type: 'feature'
created: '2026-11-07'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '534452c'
baseline_commit: '534452c615bbe71222b836b6611a4c2718342045'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
  - {project-root}/_bmad-output/implementation-artifacts/spec-4-6-resolution-non-ambigue-du-checkpoint.md
  - {project-root}/_bmad-output/implementation-artifacts/spec-4-3-scan-de-retrait-du-dossard.md
  - {project-root}/_bmad-output/implementation-artifacts/spec-4-4-scan-de-passage-aux-checkpoints.md
warnings:
  - "Dépend du correctif de marqueur de shell de la branche fix/revue-epic-3-4-groupe-1 (même fichier scan-client.tsx) : à fusionner dans main AVANT de coder cette story."
  - "Dépend de la story 4.6 (résolution non ambiguë du checkpoint) : le repli poche réutilise la résolution qu'elle pose. 4.6 passe en premier."
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/volontaires/scan` refuse de rendre le scanner quand la base ne répond pas — alors que le scan est 100 % local (annuaire, boîte d'envoi et jeton d'appareil vivent en IndexedDB). Hors-ligne total, le service worker sauve la mise en resservant la page déjà visitée ; mais **réseau présent et base muette**, le serveur répond, le SW laisse passer, et la carte « Connexion indisponible » prend la place du scanner. Au guichet un jour de course — ~700 retraits, base sous charge — plus un seul scan n'est possible, en contradiction avec NFR-8 (« offline-first radical : aucune fonction critique ne dépend du réseau ») et avec les matrices 4.3/4.4 (« hors-ligne total → retraits/passages enregistrés en local »).

**Approach:** Le checkpoint n'est pas une décision calculée au scan : c'est l'**affectation** posée par l'organisateur (« Scan checkpoint 1 »), et son identifiant part avec chaque passage (clé naturelle édition + coureur + checkpoint). Cette affectation est déjà dans la poche : l'état volontaire stocké en IndexedDB embarque `mesMissions`. Quand le serveur ne peut pas la résoudre, `ScanClient` la relit depuis la poche avec la **même fonction pure** que le serveur (`missionScanEnCours` / `missionRetraitEnCours`), et le scanner se rend, surmonté d'un bandeau de fraîcheur qui dit d'où vient le checkpoint. Aucune règle nouvelle : on déplace une résolution déjà écrite et déjà testée du serveur vers le client, dans le seul cas où le serveur est muet.

## Boundaries & Constraints

**Always:**
- Le serveur reste la source **préférée** : tant que `getMissionsVolontaireState` répond, rien ne change — mission, libellé et `checkpointId` viennent de lui, aucun bandeau.
- Repli poche **uniquement** quand la base est indisponible (`guard.status === 'db-unavailable'`) ou que la lecture d'état échoue. Jamais pour contourner une absence réelle de mission : un volontaire sans affectation reste redirigé vers sa fiche avec son message dédié (gating 4.3/4.4 intact).
- La résolution client utilise **exactement** les helpers du serveur (`missionScanEnCours`, `missionRetraitEnCours`) sur `mesMissions` de la poche — y compris leur repli « première mission du type hors fenêtre ». Le comportement hors-ligne ne doit jamais être plus strict que le comportement en ligne.
- Bandeau de fraîcheur `role="status"` dès que la mission vient de la poche : libellé nommant la mission ET la date de l'état repris (« Checkpoint repris de ta fiche du 16/05 à 06:12 »), plus un bouton d'assistance PC — le volontaire doit pouvoir appeler s'il a été réaffecté.
- Impasse conservée dans un seul cas : **aucune** mission du type en poche. Enregistrer un passage sans savoir à quel checkpoint le rattacher est pire que ne rien enregistrer (le chronométrage est auditable, une erreur d'attribution fausse un classement).
- Le mode retrait suit le même chemin, en plus simple : il ne porte pas de checkpoint, il lui suffit qu'une mission `distribution_dossards` existe en poche.
- Les passages et retraits enregistrés par ce chemin sont **indistinguables** des autres dans l'outbox : même clé d'idempotence, même contrat `shared`. Le repli change l'origine du `checkpointId`, jamais la forme de l'événement.

**Never:**
- Pas de borne horaire supplémentaire côté client. Le serveur accepte déjà le repli hors fenêtre (`missionTypeEnCours` : `courante ?? missionsDuType[0]`) ; ajouter une fenêtre stricte côté poche rendrait le scanner **plus** restrictif quand la base tombe, pour la même question.
- Pas de nouvel âge maximal de la poche, pas de purge, pas de nouveau store IndexedDB : on lit l'état déjà écrit par la fiche (3.3).
- Pas de résolution client quand le serveur a répondu : deux réponses concurrentes pour la même question n'ont pas lieu d'être.
- Pas de nouvelle route, pas de nouveau mode de scan, aucun changement du format QR ni de la clé naturelle du Passage.
- Pas de modification du service worker : son précache et sa garde de marqueur restent tels quels.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Sortie attendue | Gestion d'erreur |
|----------|--------------|-----------------|------------------|
| Nominal en ligne | base OK, mission scan affectée | Scanner rendu, `checkpointId` du serveur, **aucun** bandeau de fraîcheur | — |
| Base muette, poche garnie | `db-unavailable`, état en poche avec une mission `scan_checkpoint` | Scanner rendu, `checkpointId` de la poche, bandeau « Checkpoint repris de ta fiche du JJ/MM à HH:MM » + assistance | — |
| Base muette, mode retrait | `db-unavailable`, mission `distribution_dossards` en poche | Scanner retrait rendu, bandeau de fraîcheur | — |
| Base muette, poche vide | `db-unavailable`, aucun état en poche | Carte « Connexion indisponible », **enrichie** : assistance PC + retour fiche (manquants aujourd'hui) | — |
| Base muette, poche sans mission du type | `db-unavailable`, état présent mais aucune mission `scan_checkpoint` | Carte dédiée « Aucune mission scan dans ta fiche » + assistance | jamais de scan à l'aveugle |
| Lecture d'état en échec | `getMissionsVolontaireState` lève | Même chemin que `db-unavailable` | — |
| Plusieurs missions scan | poche avec 2 missions `scan_checkpoint` | La fenêtre courante gagne, sinon la première — **identique au serveur** | — |
| IndexedDB refuse | `db-unavailable` + lecture poche en erreur | Carte « Connexion indisponible » + assistance, jamais d'écran blanc | erreur avalée, pas de rejet |
| Hors-ligne total | SW ressert la page en cache | Inchangé : le `checkpointId` est déjà dans le HTML caché | — |
| Réaffectation non vue | poche antérieure à une réaffectation PC | Scan sur l'ancien checkpoint, **signalé** par le bandeau (date de l'état) | parade humaine : appeler le PC |
| Sync au retour du réseau | événements produits via le repli | Acceptés comme les autres (même clé d'idempotence) | arbitrage serveur inchangé |

</frozen-after-approval>

## Code Map

| Fichier | Rôle dans la story |
|---------|--------------------|
| `apps/web/src/app/volontaires/scan/page.tsx` | Ne retourne plus une impasse sur `db-unavailable` : rend `ScanClient` en mode « repli poche » (sans `checkpointId` ni `missionLabel`). Garde le gating inchangé quand la base répond. |
| `apps/web/src/app/volontaires/scan/scan-client.tsx` | `checkpointId` et `missionLabel` deviennent facultatifs ; nouvelle phase de résolution depuis la poche avant `'chargement'` ; rend le bandeau de fraîcheur. |
| `apps/web/src/lib/scan/mission-scan.ts` | Inchangé — réutilisé tel quel côté client (c'est l'intérêt de la story). |
| `apps/web/src/lib/idb-volontaires.ts` | Lecture de l'état déjà existante (`lireEtatVolontaires`) ; aucun nouveau store. |
| `apps/web/src/lib/scan/repli-poche.ts` *(nouveau)* | Fonction **pure** : (état en poche, famille, maintenant) → `resolue` / `bloquee` / `absente`. Délègue à `resoudreMissionDeFamille` (4.6) : aucune règle n'est réécrite ici. |
| `apps/web/src/app/volontaires/scan/page.test.tsx` | Nouveaux cas serveur : `db-unavailable` rend bien `ScanClient` en mode repli. |
| `apps/web/src/lib/scan/repli-poche.test.ts` *(nouveau)* | Tous les cas de la matrice, en pur — dont une table comparative client/serveur qui exige le MÊME verdict. |
| `apps/web/src/app/volontaires/scan/ecran-mission-ambigue.tsx` *(nouveau)* | Écran de blocage extrait de la page serveur (4.6) pour être partagé avec le client : un seul libellé, deux surfaces. |

## Tasks & Acceptance

| ID | Critère |
|----|---------|
| AC1 | Base indisponible + mission `scan_checkpoint` en poche → le scanner se rend et enregistre les passages sur le `checkpointId` de cette mission. |
| AC2 | Base indisponible + mission `distribution_dossards` en poche → le scanner de retrait se rend. |
| AC3 | La mission retenue depuis la poche est **la même** que celle qu'aurait retenue le serveur sur les mêmes données et le même instant, repli hors fenêtre compris (test comparatif explicite). |
| AC4 | Un bandeau `role="status"` nomme la mission et la date de l'état repris, et propose l'assistance PC. Absent quand la mission vient du serveur. |
| AC5 | Base indisponible + aucune mission du type en poche → aucun scan possible ; carte explicite + assistance, jamais d'enregistrement à l'aveugle. |
| AC6 | Base indisponible + poche vide ou IndexedDB en erreur → carte « Connexion indisponible » enrichie (assistance + retour fiche), jamais d'écran blanc ni de promesse rejetée. |
| AC7 | Base disponible : comportement strictement inchangé — gating 4.3/4.4, redirections douces et messages dédiés identiques (non-régression). |
| AC8 | Les événements produits via le repli portent la même clé d'idempotence et le même format que les autres ; la sync 4.5 ne les distingue pas. |
| AC9 | Aucune borne horaire ni âge maximal ajoutés : le repli poche accepte exactement ce que le serveur accepte. |
| AC10 | `repli-poche.ts` est pur et testé sans DOM ; `scan-client.tsx` ne contient que le câblage. |

## Plan de tests

**Unitaires purs** (`lib/scan/repli-poche.test.ts`) : toute la matrice — poche garnie, poche vide, poche sans mission du type, plusieurs missions (fenêtre courante et repli), les deux modes. Plus **AC3** : une table de cas où l'on applique `missionScanEnCours` côté « serveur » et `repliPoche` côté « client » sur les mêmes données, et où l'on exige le même identifiant.

**Serveur** (`scan/page.test.tsx`) : `db-unavailable` rend `ScanClient` sans `checkpointId` ; base OK rend `ScanClient` avec ; les redirections douces et leurs messages ne bougent pas.

**Rendu** (SSR, pattern maison) : présence et absence du bandeau de fraîcheur selon l'origine de la mission ; carte enrichie quand la poche ne donne rien.

**Non couvert sans harnais DOM** : la résolution effective au montage de `ScanClient` (lecture IndexedDB puis bascule de phase). Le câblage sera épinglé par lecture de source, comme `bandeau-sync.test.tsx` — et consigné au registre des différés, cohérent avec la dette d'outillage déjà connue.

## Design Notes

**Pourquoi pas de borne horaire.** La première version de cette story en prévoyait une : n'accepter la mission de la poche que si sa fenêtre couvre l'instant. C'était une erreur — `missionTypeEnCours` retombe déjà sur `missionsDuType[0]` hors fenêtre côté serveur. Une borne côté client aurait rendu le scanner plus restrictif quand la base tombe que quand elle répond, pour la même question. Deux comportements selon l'état du réseau, c'est exactement ce que l'offline-first cherche à éviter.

**Pourquoi ce n'est pas une seconde source de vérité.** Le client ne décide rien : il relit la même affectation, avec la même fonction pure, sur les mêmes données. Le serveur ne fait ici aucun calcul que le client ne puisse refaire à l'identique. Le seul écart possible est la **fraîcheur** de la copie — d'où le bandeau, qui en fait une information visible plutôt qu'un angle mort.

**Le risque résiduel, nommé.** Si l'organisateur réaffecte un volontaire pendant la course et que son téléphone n'a pas rafraîchi, les scans partent sur l'ancien checkpoint. Ce risque existe déjà hors-ligne (le HTML en cache fige le checkpoint de la dernière visite) : la story l'étend au cas « base muette », elle ne le crée pas. La parade est humaine — le bandeau date l'information, le bouton d'assistance permet d'appeler le PC. Une parade technique (invalider la poche sur réaffectation) demanderait un canal de notification que le produit n'a pas.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm build` verts.
- Recette : ajouter un module à `scenarios-recette-epic-4.md` — couper la base (`docker stop azzel-postgres`) avec le réseau actif, vérifier que le scanner se rend avec son bandeau, scanner un e-dossard, relancer la base, vérifier que le passage remonte au bon checkpoint.
