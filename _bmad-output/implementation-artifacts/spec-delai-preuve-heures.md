---
title: 'Délai de dépôt de la preuve en heures, réglable par l’admin'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'dispatch'
baseline_commit: '413982d6b6a8807e8b67caf12ab9f1aec4294a9d'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le délai de dépôt de la preuve vaut « J+N jours à 23h59, heure d'Alger » : la réservation dure entre 48 et 72 h selon l'heure d'inscription, et il est impossible de tester une expiration en local sans manipuler la base.

**Approach:** Décisions PO (13/11/2026) : le délai devient une **durée glissante en heures** (48 h par défaut) qui part du moment où le **dossier est rempli** — formulaire envoyé ET décharge et règlement acceptés, réglable par l'admin dans `/admin/inscriptions`. En local, une variable d'environnement en minutes (ignorée en production) permet par exemple un délai de 4 minutes.

## Boundaries & Constraints

**Always:**
- Échéance posée à l'entrée en « en constitution » (envoi du formulaire, reprise après refus/expiration, attribution depuis la liste d'attente) = cet instant + délai, puis **redémarrée** à la validation des acceptations = cet instant + délai (décision PO 13/11/2026 : sans acceptations dans le délai, le dossier expire et la place repart). Si les acceptations sont déjà faites à l'entrée en constitution, l'échéance part de cette entrée. Plus d'arrondi à 23h59.
- Le redémarrage n'a lieu qu'en « en constitution » ; aucune échéance en liste d'attente (inchangé).
- Migration `0045` : colonne `edition.delai_preuve_heures` (entier, défaut 48, 1 ≤ h ≤ 720) remplie depuis `delai_preuve_jours × 24`, puis suppression de `delai_preuve_jours`. Rejouable. Les `preuve_due_at` déjà posés ne bougent pas.
- Réglage admin `delaiPreuveHeures`, libellé « Délai de dépôt de la preuve (heures) », bornes 1 à 720 avec erreur nommée. Les lignes du journal portant l'ancien champ `delaiPreuveJours` restent lisibles (libellé dédié, valeurs non converties).
- Surcharge de développement `AZZEL_DELAI_PREUVE_MINUTES` (entier > 0) : prise en compte seulement si `NODE_ENV !== 'production'` ; valeur invalide ignorée. Quand elle est active, `/admin/inscriptions` l'affiche à côté du réglage (« forcé à N min en développement »).
- `.env.example` documente la variable ; la recette (module I5) décrit le test à 4 minutes.

**Never:**
- Pas de changement de la fenêtre du rappel (moins de 24 h restantes), ni des emails et affichages (ils donnent déjà date et heure à Alger).
- Aucune planification de l'expiration ici (story séparée).

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu |
|---|---|---|
| Formulaire envoyé, délai 48 h | formulaire le 13/11 à 10:05 Alger | échéance provisoire 15/11 à 10:05 |
| Acceptations validées | formulaire 10:05, acceptations 10:09 le 13/11 | échéance 15/11 à 10:09 |
| Jamais d'acceptations | formulaire 13/11 10:05, rien ensuite | expirée après le 15/11 10:05, place rendue |
| Attribution depuis la liste d'attente | délai 48 h, attribuée à T, acceptations déjà faites | échéance T + 48 h |
| Attribution sans acceptations | attribuée à T, acceptations à T' | échéance T + 48 h, puis T' + 48 h |
| Reprise après refus/expiration | délai 48 h, enregistrée à T (acceptations conservées) | échéance T + 48 h |
| Surcharge dev | `AZZEL_DELAI_PREUVE_MINUTES=4`, NODE_ENV=development | échéance T + 4 min |
| Surcharge en production | même variable, NODE_ENV=production | ignorée : délai en heures |
| Surcharge invalide | `abc`, `0`, `-3` | ignorée |
| Réglage admin hors bornes | 0 ou 721 | refus nommé, rien ne change |
| Migration | édition à 2 jours | `delai_preuve_heures = 48`, colonne jours supprimée ; rejouable |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/domain.ts` -- `limitePreuve` (l.245, à réécrire en durée), docstring l.234 ; `CHAMPS_REGLAGES`/`LIBELLES_REGLAGES` (l.302-325) ; bornes des réglages (validation existante des réglages).
- `apps/web/src/modules/inscriptions/store.ts` -- lecture/écriture des réglages (l.692-726, l.1000-1075), attribution depuis la liste d'attente (l.1142-1162), `upsertCoureur` (l.1280-1354), `acceptDocuments` (redémarrage de l'échéance).
- `apps/web/src/modules/inscriptions/service.ts` -- réglages exposés à l'admin (l.491, l.515), libellé du journal (l.526).
- `apps/web/src/modules/iam/env.ts` -- `readEnv` : patron de lecture des variables.
- `apps/web/src/app/admin/inscriptions/inscriptions-manager.tsx` -- champ (l.18, l.31) et mention de la surcharge.
- `apps/web/src/modules/inscriptions/migrations/0035_contingent_places.sql` -- création de `delai_preuve_jours` et son CHECK (l.28, l.40).
- Tests : `echeance.test.ts`, `reglages.test.ts`, `contingent.test.ts`, `inscriptions.integration.test.ts`, `cycle-de-vie.integration.test.ts`, page admin.
- `.env.example` (racine) ; `_bmad-output/implementation-artifacts/scenarios-recette-inscriptions.md` (I1, I5).

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0045_delai_preuve_heures.sql` -- colonne heures, reprise des données, suppression de la colonne jours, rejouable.
- [x] `domain.ts` -- `limitePreuve(debut, delaiHeures, surchargeMinutes?)` en durée ; fonction pure de lecture de la surcharge (environnement, NODE_ENV) testée ; réglage et libellés (dont l'ancien champ du journal).
- [x] `store.ts`, `service.ts` -- délai en heures partout, surcharge appliquée aux trois points d'entrée en constitution et au redémarrage à l'acceptation, surcharge active exposée à l'admin.
- [x] `inscriptions-manager.tsx` -- champ en heures, mention de la surcharge active.
- [x] Tests de la matrice ; `.env.example` ; recette I1/I5.

**Acceptance Criteria:**
- Given `AZZEL_DELAI_PREUVE_MINUTES=4` en local, when un coureur s'inscrit puis que `inscriptions:echeances` tourne 4 minutes plus tard, then le dossier est expiré et l'email d'expiration part.

## Implementation Notes

- **Redémarrage à l'acceptation : une seule fois.** `acceptDocuments` ne repousse l'échéance que si les acceptations étaient INCOMPLÈTES avant l'appel (passage à « dossier rempli »). Une ré-acceptation (l'écran la permet : « Accepter à nouveau met à jour l'horodatage et la version ») ne bouge rien — sinon un coureur garderait sa place indéfiniment en ré-acceptant toutes les 47 h. C'est la lecture de « si les acceptations sont déjà faites à l'entrée en constitution, l'échéance part de cette entrée ».
- **Base de calcul du redémarrage :** l'horodatage d'acceptation enregistré (`decharge_accepted_at`, `now()` de la transaction), pour que l'échéance se recoupe exactement avec l'acceptation.
- **Redémarrage seulement si l'échéance court encore** (`preuve_due_at >= now()`, lu sous verrou) : une acceptation arrivée après l'échéance provisoire, avant le passage du balayage, ne la ressuscite pas — le balayage expire le dossier (« sans acceptations dans le délai, le dossier expire »).
- **Dossier sans échéance** (antérieur à 0036, ou coureurs fictifs du seed) : l'acceptation ne lui en crée pas — « redémarrer » suppose une échéance posée ; un tel dossier n'expire toujours pas.
- **Délai abaissé entre l'entrée et l'acceptation :** le redémarrage applique le délai courant (lecture littérale « cet instant + délai »), même s'il donne une échéance plus proche que la provisoire.
- **Migration 0045 :** reprise `LEAST(GREATEST(jours × 24, 1), 720)` pour respecter le CHECK (un délai de 0 jour donnerait 0 h). La contrainte commune `edition_reglages_check` citait `delai_preuve_jours` : PostgreSQL l'aurait supprimée EN ENTIER avec la colonne (perte silencieuse des garde-fous capacité/prix) — elle est recréée sans le délai avant le `DROP COLUMN`. CHECK séparé `edition_delai_preuve_heures_check` (1 à 720).
- **Surcharge :** lue à chaque échéance posée via `readEnv` (`surchargeDelaiPreuveMinutes()` dans `store.ts`, `.env` en cache : relancer le serveur après un changement du fichier), pure dans `lireSurchargeDelaiPreuve` (`domain.ts`). Liste BLANCHE : seulement `NODE_ENV` ∈ {development, test} — un script tsx sans NODE_ENV (seed, seed:reset) l'ignore. Plafonnée à 720 × 60 min (au-delà : date invalide). Posée mais rejetée : un `console.warn` serveur, une fois par valeur. Les suites d'intégration la neutralisent (`vi.stubEnv(…, '')`) pour qu'un `.env` de poste qui la pose ne fasse pas échouer les échéances attendues.
- **Bornes :** `BORNES_REGLAGES` (domaine) sert au service — évaluées AVANT le garde-fou commun, donc -3, 1,5 ou 100 001 reçoivent le même refus nommé « Indique un délai entre 1 et 720 heures (30 jours). » — et au formulaire (`min`/`max`). Libellé dédié de l'historique : `LIBELLES_JOURNAL_REGLAGES.delaiPreuveJours` = « Délai de dépôt de la preuve (jours, ancien réglage) ».
- Recette : I1 (1.3, 1.11–1.17), I4 (4.5), I5 (partie B, 5.11–5.21), I10 (10.15), remise en état et synthèse mis à jour dans `scenarios-recette-inscriptions.md`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | BH, EC, VG | Acceptation après l'échéance provisoire (avant le balayage) → délai complet redonné | medium | Redémarrage sans test `preuve_due_at >= maintenant` | patch |
| 2 | BH, EC, VG | Surcharge appliquée hors développement (scripts tsx sans NODE_ENV, seed vers la recette) ; valeur énorme → Invalid Date → 500 ; rejet silencieux | medium | Seule `production` est exclue ; `Number.isSafeInteger` sans plafond | patch |
| 3 | BH, EC | Commentaire « pas besoin de redémarrer » faux | low | `.env` en cache dans `readEnv` | patch |
| 4 | BH | « Les échéances déjà posées ne bougent pas » inexact ; rappel « jusqu'à demain » sous 25 h non signalé | low | Le redémarrage remplace l'échéance | patch (textes) |
| 5 | BH, EC | Message « 100000 au maximum » / générique au lieu de la borne nommée | low | `REGLAGE_MAX` évalué avant `BORNES_REGLAGES` | patch |
| 6 | BH, EC, VG | Test de migration : bornes 0 j / >30 j non testées ; `try` mal placé | medium | Seul 2 j testé ; colonne de test résiduelle possible | patch |
| 7 | BH, VG | Tests manquants : acceptation sans échéance ; bornes hautes | low | Garde `a_une_echeance` non testée | patch |
| 8 | BH, EC | Mention de surcharge non reliée au champ ; « undefined min » possible | low | `aria-describedby` ; champ optionnel | patch |
| 9 | BH | Recette : durée, 1.15 conditionnelle, 1.16 commande incomplète | low | Document de recette | patch |
| 10 | EC | Suppression de `delai_preuve_jours` : l'ancien code tombe entre migration et déploiement | medium | Pas de séquence expand/contract ; suppression gelée dans la spec | defer |
| 11 | EC | `delai_preuve_jours` > 89 M → dépassement à la multiplication | low | Valeur absurde, jamais saisie | rejeté |
| 12 | BH | Spec absente du diff relu | false | Suivie au commit | rejeté |

## Verification

**Commands:**
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -- expected: aucune erreur
- `bash scripts/dev-db.sh up && AZZEL_REQUIRE_DB=1 node_modules/.bin/vitest run` -- expected: suite complète verte (node : `PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`)
