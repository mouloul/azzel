---
title: 'Wilaya de provenance et hébergement réservé aux non-Tizi-Ouzou'
type: 'feature'
created: '2026-11-10'
status: 'done'
route: 'dispatch'
baseline_commit: '54b0eae42ddadc6007404d7ca4c9a8b8a84b6f3e'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'organisation a décidé de réserver l'hébergement aux participants venant d'une autre wilaya que Tizi Ouzou, mais le formulaire d'inscription ne demande pas d'où vient le coureur : n'importe qui peut cocher l'option.

**Approach:** Ajouter au formulaire un choix obligatoire de wilaya (liste des wilayas d'Algérie + « Étranger »), un champ pays obligatoire pour « Étranger », et refuser l'hébergement à la wilaya Tizi Ouzou (15), côté client, domaine et base.

**Décisions (PO, 10/11/2026) :**
- **69 wilayas** : les 58 historiques (codes 01-58 inchangés, Tizi Ouzou = 15) + 59 Aflou, 60 El Abiodh Sidi Cheikh, 61 El Aricha, 62 El Kantara, 63 Barika, 64 Bou Saâda, 65 Bir El Ater, 66 Ksar El Boukhari, 67 Ksar Chellala, 68 Aïn Oussara, 69 Messaad.
- **Pays en liste déroulante** : code ISO 3166-1 alpha-2 stocké (`'FR'`), libellé français affiché, Algérie exclue de la liste.

## Boundaries & Constraints

**Always:**
- Wilaya stockée par son **code** administratif à deux chiffres (`'15'` = Tizi Ouzou) ; `'ETR'` pour l'étranger. Le libellé n'est jamais stocké.
- Wilaya obligatoire pour toute **nouvelle saisie** (comme le genre) ; colonnes nullables en base : les dossiers existants n'ont jamais répondu.
- Pays obligatoire si et seulement si wilaya = `ETR` ; effacé sinon.
- Wilaya 15 + hébergement demandé → erreur nommée sur le champ `hebergement`, jamais une correction silencieuse côté serveur.
- Côté formulaire : choisir Tizi Ouzou décoche et désactive la case hébergement, avec une aide qui explique pourquoi.

**Never:**
- Pas de remise en cause automatique des dossiers existants (hébergement déjà demandé, sans wilaya) : ils devront choisir leur wilaya à leur prochaine modification.
- Pas de changement du contingent, du prix ni du verrou d'attribution des lits.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu | Erreur |
|---|---|---|---|
| Hors Tizi + hébergement | wilaya `16`, hébergement oui, lits dispo | inscrit avec hébergement | — |
| Tizi + hébergement | wilaya `15`, hébergement oui | refus 400 | `hebergement` : « L’hébergement est réservé aux participants venant d’une autre wilaya que Tizi Ouzou. » |
| Tizi sans hébergement | wilaya `15`, hébergement non | inscrit | — |
| Étranger sans pays | wilaya `ETR`, pays vide | refus 400 | `pays` : « Indique ton pays de résidence. » |
| Étranger avec pays | wilaya `ETR`, pays `FR` | inscrit, pays `FR` enregistré | — |
| Pays inconnu ou Algérie | wilaya `ETR`, pays `XX` ou `DZ` | refus 400 | `pays` : « Indique ton pays de résidence. » |
| Wilaya absente | wilaya vide | refus 400 | `wilaya` : « Choisis ta wilaya, ou « Étranger ». » |
| Wilaya inconnue | wilaya `70` | refus 400 | `wilaya` : même message |
| Pays envoyé hors étranger | wilaya `16`, pays `FR` | inscrit, pays = NULL | — |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/domain.ts` -- `GENRES`/`GENRE_LABELS` (l.14) = patron à suivre pour `WILAYAS` ; `InscriptionFormInput`, `FIELD_ORDER`, `normalizeInscriptionInput`, `validateInscriptionInput` (l.437-649) à étendre ; `hebergementAccorde` (l.213) inchangé.
- `apps/web/src/modules/inscriptions/migrations/0034_genre_et_majorite.sql` -- patron de colonne nullable + CHECK ; prochain numéro libre : `0044`.
- `apps/web/src/modules/inscriptions/store.ts` -- `CoureurRecord` (l.155), `UpsertCoureurInput` (l.205), `COUREUR_COLUMNS` (l.603), mapping ligne (l.578), INSERT/ON CONFLICT de `upsertCoureur` (l.1278-1305).
- `apps/web/src/modules/inscriptions/service.ts` -- `CoureurSummary` (l.63), `toCoureurSummary` (l.139), `submitInscription` (l.715-730).
- `apps/web/src/app/inscription/inscription-form.tsx` -- `EMPTY_INPUT`, `prefill`, fieldset « Ton identité » / « Hébergement », récapitulatif.
- `apps/web/src/app/admin/dossiers/[id]/page.tsx` -- l.102 : afficher la provenance.
- `apps/web/src/modules/seed/donnees.ts`, `seed.ts` (l.432-444) -- le seed passe par `submitInscription` : sans wilaya il casserait.
- Tests existants : `inscriptions.test.ts`, `hebergement.test.ts`, `inscriptions.integration.test.ts`, `app/inscription/page.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/inscriptions/migrations/0044_wilaya_pays.sql` -- colonnes `wilaya text`, `pays text` nullables ; CHECK format du code, CHECK `NOT (wilaya = '15' AND hebergement)`, CHECK pays ⇔ `ETR` -- la base refuse ce que le domaine refuse.
- [x] `apps/web/src/modules/inscriptions/provenance.ts` (nouveau) -- `WILAYAS` (69 codes + libellés), `PAYS` (codes ISO, libellés `Intl.DisplayNames('fr')`, triés, sans `DZ`), `WILAYA_TIZI_OUZOU`, `WILAYA_ETRANGER`, `libelleProvenance()` -- référentiels isolés de `domain.ts` déjà long.
- [x] `apps/web/src/modules/inscriptions/domain.ts` -- champs `wilaya`/`pays` dans l'input, la normalisation, `FIELD_ORDER` et la validation (matrice) -- règle unique, partagée client/serveur.
- [x] `store.ts`, `service.ts` -- propager `wilaya`/`pays` (lecture, upsert, résumé) ; pays forcé à NULL hors `ETR`.
- [x] `inscription-form.tsx` -- select wilaya après le téléphone, champ pays conditionnel, case hébergement désactivée et décochée pour Tizi Ouzou, provenance au récapitulatif.
- [x] `admin/dossiers/[id]/page.tsx` -- ligne « Provenance : Béjaïa (06) » / « Étranger — France » / « non renseignée ».
- [x] `modules/seed/*` -- wilayas déterministes dans le jeu fictif (dont Tizi Ouzou sans hébergement et un étranger).
- [x] Tests unitaires de la matrice (`inscriptions.test.ts`), intégration upsert + CHECK (`inscriptions.integration.test.ts`), formulaire (`page.test.tsx`).
- [x] `_bmad-output/implementation-artifacts/scenarios-recette-inscriptions.md` -- module « Wilaya et hébergement ».

**Acceptance Criteria:**
- Given un dossier existant sans wilaya, when l'admin l'ouvre, then la provenance affiche « non renseignée » sans erreur.
- Given un coureur existant avec hébergement qui modifie son dossier, when il choisit Tizi Ouzou, then la case se décoche et l'envoi aboutit sans hébergement.
- Given la migration rejouée, when `db:migrate` repasse, then elle est idempotente.

## Implementation Notes

- Base effective : la branche, vide, a été avancée en fast-forward sur `main` (e235fcf, merge de la petite boucle) pendant l'implémentation. Le diff de revue est calculé depuis e235fcf pour ne pas inclure ce commit étranger ; `baseline_commit` conservé tel quel.
- `provenance.ts` : 248 codes ISO écrits en dur (Intl ne sait pas énumérer les régions), libellés via `Intl.DisplayNames('fr')`, `DZ` exclu.
- `choisirWilaya()` (domaine, pur) porte les effets du choix côté formulaire : Tizi Ouzou décoche l'hébergement, quitter « Étranger » efface le pays.
- `FIELD_ORDER` inclut désormais `hebergement` (refusable) : l'ancien test qui l'excluait a été inversé.
- Migration 0044 : CHECK pays ⇔ ETR écrit en `CASE` pour qu'une wilaya NULL exige aussi pays NULL.
- Vérifié : `tsc --noEmit` 0 erreur ; `AZZEL_REQUIRE_DB=1 vitest run` 228 fichiers, 3140 tests verts (8 ignorés préexistants). pnpm absent du shell : binaires `node_modules/.bin` utilisés.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | VG, EC, BH | Libellés PAYS via Intl.DisplayNames côté serveur et client → risque d'hydratation | medium | Module importé par `inscription-form.tsx` (client, rendu SSR) ; libellés ICU variables selon les moteurs | patch |
| 2 | BH | Territoires inhabités (AQ, BV, HM, GS, TF, UM, IO) proposés comme pays de résidence | low | Présents dans `CODES_ISO_PAYS`, aucun filtre | patch |
| 3 | BH | Aucune source citée pour les wilayas 59-69 | low | Commentaire `provenance.ts` sans référence | patch |
| 4 | EC | Détenteur d'un lit, hébergement complet : Tizi Ouzou par erreur puis retour → case décochée et désactivée, lit perdu | medium | `disabled = complet && hebergement !== 'oui'` ; `choisirWilaya` vide `hebergement` ; le serveur exclut pourtant le dossier lui-même du décompte | patch |
| 5 | BH | Règle « pays seulement pour ETR » dupliquée service/store | low | `service.ts` et `store.ts` portent le même ternaire | patch |
| 6 | EC, BH | Recette : 9.20 rangée après 9.16 alors qu'elle doit la précéder ; UPDATE 0 silencieux | medium | Texte de la commande 9.20 « à jouer avant 9.16 » | patch |
| 7 | BH | Recette : 9.13 multi-org, 9.17 compteur non localisé, 9.8 montant figé, en-tête périmètre | low | Lignes 3, 212-216 du document | patch |
| 8 | BH | Dossiers anciens déjà validés jamais régularisés | low | `STATUTS_MODIFIABLES` exclut « validé » ; intention gelée : pas de remise en cause automatique | patch (note de recette) + defer |
| 9 | VG, BH | Câblage `updateWilaya` non testé (aucun outillage DOM) | low | Seuls `choisirWilaya` (pur) et le rendu SSR sont testés ; recette 9.7/9.16 couvre | defer |
| 10 | BH | Provenance absente de la liste admin et des exports CSV | medium | `inscriptions-manager.tsx`, routes `rapports/*` sans wilaya | defer |
| 11 | BH | Restriction non annoncée sur les pages publiques (contenu « hébergement » de /region) | medium | `contenus/domain.ts` porte une section `hebergement` éditable en admin | defer |
| 12 | EC | Seed rejoué sur une base déjà peuplée : wilayas restent NULL | low | Branche « déjà présent » sans écriture ; `seed:reset` suffit | rejeté (low, correctif = nouvelle branche) |
| 13 | BH | Tizi Ouzou en dur malgré le socle multi-organisation | low | Une seule organisation exploitante ; l'intention nomme Tizi Ouzou | rejeté (low, correctif = nouveau réglage) |
| 14 | BH | Spec absente du patch | false | Exclue volontairement du diff de revue ; le fichier existe | rejeté |
| 15 | BH | `role="alert"` double annonce ; focus sur case désactivée | false | `role="alert"` déjà utilisé pour genre/épreuve ; erreur hébergement inatteignable côté client (choisirWilaya décoche) | rejeté |
| 16 | BH | Tests manquants : route 400, libelleProvenance code inconnu, repli Intl | low | Route générique (InvalidFieldsError testée au service) ; repli Intl supprimé par #1 | rejeté |

## Verification

**Commands:**
- `pnpm -F @azzel/web typecheck` -- expected: aucune erreur
- `pnpm test:db` -- expected: suites unitaires et d'intégration vertes
