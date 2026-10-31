---
title: 'Sprint Change Proposal — Aucune donnée personnelle des coureurs côté volontaires'
date: '2026-10-30'
status: 'approved'
approved: '2026-10-30'
mode: 'batch'
trigger: 'Revue de code story 3.4 — décision D1 (portée de l''annuaire nominatif), 2026-10-29'
scope: 'minor'
---

# Sprint Change Proposal — Aucune donnée personnelle des coureurs côté volontaires

## 1. Résumé du problème

**Déclencheur.** Revue de code de la story 3.4 (passe 2, 29/10/2026), décision D1 : `GET /api/volontaires/annuaire` sert l'annuaire **nominatif complet** (dossard, nom, prénom, jeton) à **tout** compte volontaire, et `/volontaires` le pousse à chaque volontaire (`annuaireInitial`, donc aussi dans le HTML et le shell mis en cache).

**Décision du product owner (29/10/2026).** « Les volontaires n'ont pas besoin de voir les données des coureurs. Lorsqu'ils scannent les QR codes, le système prend en compte les données du coureur et les ajoute au tableau de bord (accessible aux organisateurs), mais les volontaires ne voient rien — juste une confirmation que le QR code est scanné. » Complément : le numéro de dossard reste affiché au voyant (il est imprimé sur le dossard physique, ce n'est pas une donnée personnelle).

**Type.** Exigence précisée par le métier (minimisation des données, NFR-7) + écart de portée relevé en revue.

**Constats dans le code (épopées 3 et 4, en `review`).**
- `packages/shared/src/annuaire.ts` : `CoureurAnnuaire = { dossard, nom, prenom, jeton }`, `ANNUAIRE_SCHEMA_VERSION = 2`.
- `modules/missions/store.ts` (`listCoureursAnnuaire`) : `SELECT dossard, last_name AS nom, first_name AS prenom, …`.
- `lib/scan/etats-scan.ts:136` : voyant retrait « ✓ Dossard N — {prénom} · présent au départ » — **seul** affichage d'identité au volontaire. Le voyant checkpoint (4.4) n'affiche déjà que le dossard.
- La validation hors-ligne (succès / déjà passé / inconnu) n'a besoin que de l'index `jeton → dossard` : les noms ne servent à rien sur l'appareil.

## 2. Analyse d'impact

### Checklist

| # | Item | Statut | Note |
|---|------|--------|------|
| 1.1 | Story déclencheuse | [x] | 3.4, revue passe 2, D1 |
| 1.2 | Problème | [x] | Données nominatives répliquées sur tous les téléphones volontaires sans besoin fonctionnel |
| 1.3 | Preuves | [x] | Fichiers et lignes ci-dessus |
| 2.1 | Épopée 3 réalisable | [x] | Oui, 3.4 ajustée (contenu + portée) |
| 2.2 | Changement d'épopée | [x] | AC de 3.4 modifiés ; aucune story ajoutée/supprimée |
| 2.3 | Épopées suivantes | [!] | Épopée 4 : libellé voyant retrait (4.3), mention 4.2 ; épopée 5 inchangée (PC avec noms via serveur) |
| 2.4 | Épopées obsolètes / nouvelles | [N/A] | — |
| 2.5 | Ordre / priorité | [N/A] | — |
| 3.1 | PRD | [!] | Glossaire « Annuaire des coureurs » + FR-12 (« identité, photo éventuelle ») |
| 3.2 | Architecture | [x] | AD-8 inchangé (jeton résolu via l'annuaire) ; seule la version du contrat `shared` change |
| 3.3 | UX | [!] | EXPERIENCE.md, ligne « Voyant scan » : règle « jamais d'identité coureur » + libellé retrait |
| 3.4 | Autres artefacts | [!] | Specs 3.4 (intention figée), 4.2, 4.3 ; epic-3-context ; recettes épopées 3 et 4 |

### Impact technique

- **Contrat `shared`** : `CoureurAnnuaire = { dossard, jeton }`, `ANNUAIRE_SCHEMA_VERSION = 3`. Une réplique v2 en cache (avec noms) devient invalide → elle doit être **supprimée** de l'appareil, pas seulement ignorée.
- **Serveur** : `listCoureursAnnuaire` ne lit plus `first_name`/`last_name` ; `GET /api/volontaires/annuaire` réservé aux volontaires affectés (édition courante) à une mission `scan_checkpoint` ou `distribution_dossards` — 403 `volontaires.annuaire_reserve` sinon.
- **PWA** : pas d'`annuaireInitial` ni de section annuaire pour un volontaire sans mission de scan ; 403 → purge de la réplique locale (volontaire désaffecté).
- **Scan** : voyant retrait sans prénom. Aucune autre surface volontaire n'affiche d'identité coureur.
- **Inchangé** : e-dossard du coureur (son propre téléphone, nom affiché), tableau de bord PC (noms résolus côté serveur depuis le jeton), sync par lots (payloads déjà sans nom).
- **Migration SQL** : aucune.

## 3. Approche recommandée

**Ajustement direct** dans le plan existant. Pas de rollback : le mécanisme (réplique IndexedDB, index par jeton, trois états) est conservé, seul son contenu est réduit et sa diffusion restreinte.

- Effort : faible (≈ 10 fichiers de code + tests, 8 documents).
- Risque : faible — le scan ne lisait le prénom qu'à un seul endroit ; la montée de version du contrat est déjà le mécanisme prévu (AD-8).
- Planning : aucun impact. Les 15 corrections de la revue 3.4 s'appliquent ensuite, par-dessus.

## 4. Propositions de modification détaillées

### 4.1 PRD — `prds/prd-Azzel-2026-10-19/prd.md`

**Glossaire (l. 58)**

OLD :
> **Annuaire des coureurs** — Copie locale des coureurs de l'édition (dossard, identité), préchargée sur les appareils des scanneurs avant le départ ; sert à la validation hors-ligne des scans.

NEW :
> **Annuaire des coureurs** — Copie locale des dossards de l'édition (jeton e-dossard + numéro de dossard, **aucune donnée d'identité**), préchargée sur les appareils des volontaires affectés à une mission de scan avant le départ ; sert à la validation hors-ligne des scans.

**FR-12 (l. 129)**

OLD :
> Avant le départ, les appareils des scanneurs téléchargent l'annuaire des coureurs de l'édition (dossards, identité, photo éventuelle) pour validation locale aux scans.
> - Le scan d'un coureur inconnu affiche un voyant rouge explicite.

NEW :
> Avant le départ, les appareils des volontaires affectés à une mission de scan (checkpoint ou distribution des dossards) téléchargent l'annuaire de l'édition (jeton e-dossard + numéro de dossard) pour validation locale aux scans.
> - Le volontaire ne voit **aucune donnée personnelle** des coureurs (ni nom, ni prénom, ni photo) : le scan ne renvoie qu'une confirmation (succès / déjà passé / inconnu) avec le numéro de dossard. Les données du coureur sont rattachées côté serveur et visibles des seuls organisateurs (tableau de bord PC).
> - Le scan d'un coureur inconnu affiche un voyant rouge explicite.

Justification : minimisation (NFR-7) — décision PO du 29/10.

### 4.2 Épopées — `epics.md`

**Inventaire FR-12 (l. 38)**

OLD : `FR-12: Préchargement de l'annuaire des coureurs de l'édition dans les appareils scanneurs ; scan d'un coureur inconnu = voyant rouge explicite.`

NEW : `FR-12: Préchargement de l'annuaire de l'édition (jeton + dossard, aucune identité) dans les appareils des volontaires affectés au scan ; aucun nom/prénom/photo côté volontaire ; scan d'un coureur inconnu = voyant rouge explicite.`

**Story 3.4 — Acceptance Criteria**

OLD :
> **Then** l'annuaire de l'édition (dossards, identité) est répliqué en IndexedDB, versionné via `shared` (FR-12, AD-8)

NEW :
> **Then** l'annuaire de l'édition (jeton e-dossard + numéro de dossard — **aucun nom, prénom ni photo**) est répliqué en IndexedDB, versionné via `shared` (FR-12, AD-8, NFR-7)
> **And** seuls les volontaires affectés à une mission `scan_checkpoint` ou `distribution_dossards` de l'édition reçoivent l'annuaire ; les autres n'en voient ni la section ni les données (403 sur l'API)

(les deux `And` existants sont conservés)

**Story 4.3 — Acceptance Criteria** (ajout après le `Then`)

NEW :
> **And** le voyant succès affiche « ✓ Dossard N · retrait enregistré » — jamais le nom ni le prénom du coureur (FR-12)

### 4.3 UX — `ux-designs/ux-Azzel-2026-10-20/EXPERIENCE.md`, ligne « Voyant scan » (l. 79)

Ajout en fin de cellule :
> Le voyant n'affiche **jamais d'identité coureur** (ni nom, ni prénom, ni photo) : numéro de dossard + état + heure. Retrait au guichet : « ✓ Dossard N · retrait enregistré ».

### 4.4 Spec 3.4 — `implementation-artifacts/spec-3-4-préchargement-de-l-annuaire-des-coureurs.md` (intention figée, renégociée par le PO)

- **Always** : ajouter « Annuaire servi uniquement aux volontaires affectés, dans l'édition courante, à une mission `scan_checkpoint` ou `distribution_dossards` (403 `volontaires.annuaire_reserve` sinon) ; pas d'`annuaireInitial` ni de section annuaire pour les autres ; 403 en ligne → purge de la réplique locale. »
- **Never** : « aucune photo/identité au-delà de dossard + nom + prénom » → « **aucune donnée d'identité** (ni nom, ni prénom, ni photo) : la réplique ne porte que `{ dossard, jeton }` (NFR-7, décision PO 29/10) ».
- **Matrice** : ligne « Annuaire (API) » → payload `coureurs:[{dossard,jeton}]` ; nouvelle ligne « Volontaire sans mission de scan » → 403, aucune section, réplique locale purgée.
- **Review Findings** : la décision D1 est cochée et résolue ainsi.

### 4.5 Specs 4.2 et 4.3

- `spec-4-2-…md` l. 46 : « ✓ Dossard N — {prénom} » + heure → « ✓ Dossard N » + heure.
- `spec-4-3-…md` l. 30 et 45 : « ✓ Dossard N — {prénom} · présent au départ » → « ✓ Dossard N · retrait enregistré ».

### 4.6 Contexte et recettes

- `epic-3-context.md` l. 21 : « réplique locale de toute l'édition (dossards, identité) » → « réplique locale des dossards de l'édition (jeton + dossard, aucune identité), réservée aux volontaires affectés au scan ».
- `scenarios-recette-epic-3.md`, module S4 : ajout d'étapes « volontaire sans mission de scan → pas de section annuaire, `/api/volontaires/annuaire` → 403 » et « IndexedDB `annuaire` : aucun champ nom/prénom ».
- `scenarios-recette-epic-4.md` étape 3.2 : « ✓ Dossard N — {prénom} · présent au départ » → « ✓ Dossard N · retrait enregistré ».

### 4.7 Code (story 3.4 rouverte, avec impact 4.3)

1. `packages/shared/src/annuaire.ts` (+ tests) : `CoureurAnnuaire = { dossard, jeton }`, `ANNUAIRE_SCHEMA_VERSION = 3`, garde de forme sans noms ; toute réplique v2 (nominative) est rejetée par la garde de version.
2. `modules/missions/store.ts` : `listCoureursAnnuaire` → `SELECT dossard, jeton` ; nouvelle requête `aMissionScan(organisationId, editionId, accountId)`.
3. `api/volontaires/annuaire/route.ts` (+ tests) : 403 `volontaires.annuaire_reserve` sans mission de scan ; message propre.
4. `app/volontaires/page.tsx` + `volontaires-pwa.tsx` : `annuaireInitial` et section annuaire seulement si mission de scan ; 403 → `purgerAnnuaire()`.
5. `lib/idb-volontaires.ts` (+ tests) : `lireAnnuaire` qui trouve une réplique invalide (v2 nominative) la **supprime** avant de retourner `null`.
6. `lib/scan/etats-scan.ts` (+ tests) : libellé retrait « ✓ Dossard N · retrait enregistré ».
7. Tests d'intégration : annuaire sans noms, 403 sans mission de scan, 200 avec `scan_checkpoint` et avec `distribution_dossards`.

## 5. Passage de relais

- **Portée : mineure** — implémentation directe par l'agent développeur (bmad-build), sur `main` comme convenu pour ce cycle, sans push.
- **Ordre** : (1) documents 4.1–4.6 ; (2) code 4.7 ; (3) les 15 corrections de la revue 3.4 par-dessus ; (4) vérification complète.
- **Critères de succès** :
  - aucune occurrence de `nom`/`prenom`/`first_name`/`last_name` dans la chaîne annuaire → IndexedDB → scan ;
  - volontaire sans mission de scan : 403 sur l'API, aucune section, réplique purgée ;
  - réplique v2 déjà en cache : supprimée à la première lecture ;
  - voyants : checkpoint inchangé, retrait « ✓ Dossard N · retrait enregistré » ;
  - typecheck, tests (dont base active), build et budget verts.
- **Suivi de sprint** : 3.4 reste `review` jusqu'à la fin des corrections, puis `done` ; 4.3 reste `review`.
