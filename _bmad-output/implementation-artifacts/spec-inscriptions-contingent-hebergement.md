# Spec — Contingent de places, expiration J+2, genre, âge 18+, hébergement

**Statut :** plan soumis à validation — aucun code écrit.
**Demandeur :** Boss (PO). **Rédaction :** Amelia.
**Branche :** `perf/nfr-2-poids-reel` (commits empilés, pas de push).

---

## 1. Décisions prises par le PO

| # | Arbitrage | Décision |
|---|---|---|
| D1 | Consommation d'une place | **Dès l'envoi du formulaire d'inscription** ; compteur = capacité − (en constitution + validés) |
| D2 | Inscription sans preuve à J+2 23h59 | **Statut « expirée »**, place libérée, ligne conservée |
| D3 | Hébergement 1500 DA | **Même versement, même délai** que le dossard (un seul justificatif CCP) |
| D4 | Contingent atteint | **Liste d'attente** (le formulaire reste ouvert) |
| D5 | Affichage du compteur | **Nombre exact, seulement sous un seuil** paramétrable |
| D6 | Relèvement de la capacité | **Écran admin**, par l'organisation, effet immédiat |
| D7 | Attribution d'une place libérée | **Manuelle par l'équipe**, depuis l'admin |
| D8 | Hébergement complet | **Option grisée et expliquée** (« complet »), inscription possible sans |
| D9 | Seuil d'affichage | Course : **200 restantes** (un tiers de 600). Hébergement : **toujours affiché** (200 → 1) |
| D10 | Rappel avant échéance | **Un seul**, la veille (≈ 24 h avant) |
| D11 | Catégorie U20 | **Fusionnée dans Senior**, qui devient 18–39 ans — quatre catégories |
| D12 | Prix du dossard | **2000 DA** (provisoire), modélisé comme le prix d'hébergement |

### Hypothèses posées (à infirmer si besoin)

- **H1 — 18 ans révolus le jour de la course.** Le code calcule déjà l'âge à `race_date` (`deriveAgeAndCategory`), conforme à l'usage fédéral.
- **H2 — Minuit heure d'Alger (UTC+1).** Convention déjà en vigueur : `registration_closes_at` vaut `2027-03-16T22:59:59Z`, soit 23:59:59 locales.
- ~~H3 — prix du dossard absent~~ : **levée** (D12). Dossard 2000 DA + hébergement 1500 DA, tous deux provisoires et réglables en admin. Le total dû est donc calculable et affichable.

---

## 2. Ce qui existe déjà (vérifié dans le code)

- `coureur.birth_date`, `coureur.age`, `coureur.age_category` : **la date de naissance est déjà collectée et validée**. L'âge est dérivé à la date de course. `MIN_AGE_AT_RACE = 10`.
- Statuts : `en constitution`, `validé`, `refusé` (`domain.ts`).
- Parcours : `/inscription` → `/acceptations` → `/preuve` → validation équipe, orchestré par la checklist (`service.ts`, `prochaine-etape.ts`).
- Patron de tâche planifiée **idempotente** : `email_outbox` + CLI `emails:j7`, index unique partiel anti-doublon (`0031_rappel_j7.sql`). L'expiration réutilisera ce patron.
- Admin : 8 sections (`admin-nav.tsx`). Aucune page de réglage d'édition.

### Conséquence sur le chantier « âge »

Le chantier 3 n'est pas « ajouter la date de naissance » mais **relever le minimum de 10 à 18 ans**. Deux effets :

- La contrainte SQL `age BETWEEN 10 AND 100` doit être migrée ; la migration **échouera** s'il existe des lignes < 18 ans. Prévoir un garde-fou (compte préalable, refus explicite avec la liste des dossiers concernés).
- La catégorie `U20` **disparaît** (D11) : `Senior` devient 18–39 ans. La migration doit **remapper les lignes existantes** `U20` → `Senior` AVANT de resserrer la contrainte, sinon elle échoue.

---

## 3. Modèle de données

### Migration `0034_contingent_inscriptions.sql`

```sql
ALTER TABLE edition
  ADD COLUMN capacite integer NOT NULL DEFAULT 600 CHECK (capacite >= 0),
  ADD COLUMN seuil_affichage_places integer NOT NULL DEFAULT 200 CHECK (seuil_affichage_places >= 0),
  ADD COLUMN prix_dossard_da integer NOT NULL DEFAULT 2000 CHECK (prix_dossard_da >= 0),
  ADD COLUMN capacite_hebergement integer NOT NULL DEFAULT 200 CHECK (capacite_hebergement >= 0),
  ADD COLUMN prix_hebergement_da integer NOT NULL DEFAULT 1500 CHECK (prix_hebergement_da >= 0),
  ADD COLUMN delai_preuve_jours integer NOT NULL DEFAULT 2 CHECK (delai_preuve_jours >= 0);

ALTER TABLE coureur
  ADD COLUMN genre text CHECK (genre IN ('F', 'H')),
  ADD COLUMN hebergement boolean NOT NULL DEFAULT false,
  ADD COLUMN preuve_due_at timestamptz,
  ADD COLUMN expired_at timestamptz;
```

- `genre` **nullable** : les inscriptions déjà en base n'en ont pas. Obligatoire pour toute nouvelle saisie, vérifié dans le domaine, pas par la base (sinon la migration casse l'existant).
- `preuve_due_at` : date limite **calculée et figée à l'inscription**, pas recalculée ensuite. Une limite qui bouge parce qu'on a modifié son dossier serait injuste et intestable.
- Nouveaux statuts : `liste d'attente`, `expirée`. La contrainte sur `status` suit.

### Fuseau et calcul de `preuve_due_at`

> Inscription le mercredi 13:00 Alger → limite **vendredi 23:59:59.999 Alger** = `2027-03-26T22:59:59.999Z`.

Fonction pure `limitePreuve(inscritLe: Date, delaiJours: number): Date` dans `domain.ts`, testée sur : passage à l'heure d'été (l'Algérie n'en a pas — mais le test fige le comportement), fin de mois, fin d'année, inscription à 23:59, inscription à 00:00.

---

## 4. Le point dur : la dernière place

Deux coureurs envoient le formulaire à la même seconde alors qu'il reste une place. Un compteur lu puis écrit (`SELECT count(*)` puis `INSERT`) en laisse passer deux.

**Solution retenue :** décision du statut **dans la transaction d'insertion**, sous `SELECT ... FOR UPDATE` sur la ligne `edition`. Le verrou sérialise les candidats à la dernière place ; chacun relit le compte à jour et reçoit `en constitution` ou `liste d'attente`. Même mécanisme pour les 200 hébergements.

Ce point sera couvert par un **test d'intégration concurrent** (N insertions simultanées sur une capacité de 1 → exactement 1 `en constitution`, N−1 en attente). Sans ce test, la correction n'est pas démontrée.

---

## 5. Lots de livraison

Chaque lot est livrable, testé et commité séparément.

### Lot 1 — Genre et âge 18+ *(le plus simple, aucun effet de bord sur les places)*
- Migration : colonne `genre`, contrainte d'âge relevée (avec garde-fou sur l'existant).
- `MIN_AGE_AT_RACE` : 10 → 18. Message d'erreur explicite : « L'épreuve est réservée aux majeurs : tu dois avoir 18 ans le jour de la course. »
- Formulaire : choix du genre (obligatoire), erreur nommée.
- Fusion `U20` → `Senior` (18–39) : remap des lignes existantes, puis contrainte resserrée.

### Lot 2 — Contingent et compteur
- Migration des colonnes d'édition.
- `domain.ts` : `placesRestantes()`, `doitAfficherPlaces(restantes, seuil)` — fonctions pures.
- Attribution du statut sous verrou (§4) + test concurrent.
- Compteur sur l'accueil (près de « Participer ») et en tête du formulaire, **à partir de 200 places restantes** (D9).
- Statut `liste d'attente` : écran et checklist adaptés — un coureur en attente ne doit pas être invité à payer.

### Lot 3 — Expiration J+2
- `preuve_due_at` figée à l'inscription ; date limite affichée au coureur à chaque étape (« Dépose ta preuve avant vendredi 23h59 »).
- Balayage idempotent : CLI `inscriptions:expirer` sur le patron `emails:j7`, rejouable sans effet double.
- Email d'expiration (outbox, type `inscription_expiree`) et **un rappel la veille** (type `rappel_preuve`), tous deux idempotents par index unique partiel.
- La place libérée retourne au pot ; la file d'attente **n'est pas servie automatiquement** (D7).

### Lot 4 — Hébergement
- Case au formulaire, contingentée comme les places (même verrou), grisée avec « complet » quand les 200 sont prises.
- Compteur d'hébergement **toujours affiché** (« il reste 137 places »), sans seuil — contrairement aux dossards (D9).
- Montant dû affiché sur `/preuve` : dossard + 1500 DA, un seul justificatif.
- Décompte hébergement visible côté admin.

### Lot 5 — Admin
- Nouvelle section **« Inscriptions »** dans `admin-nav.tsx` : capacité, seuil d'affichage, contingent et prix d'hébergement, délai de preuve.
- Journal des changements de capacité (qui, quand, de combien à combien) — sinon personne ne saura pourquoi on est passé de 600 à 1000.
- Liste d'attente : vue ordonnée par date d'inscription, action « attribuer une place » (D7), qui bascule le coureur en `en constitution` et lui ouvre un nouveau délai J+2.

### Lot 6 — Recette
- `_bmad-output/implementation-artifacts/scenarios-recette-inscriptions.md` (règle AGENTS.md).

---

## 6. Risques signalés

1. **« Supprimée » devient « expirée ».** Tu as dit supprimée, tu as choisi expirée : la place est bien libérée, mais le coureur verra son inscription marquée expirée plutôt que disparue. C'est ce qui permet de lui répondre s'il conteste.
2. **File d'attente servie à la main.** Chaque expiration demande une action humaine. Avec 600 places et un délai de 48 h, prévoir des rafales d'expirations. Un écran qui liste « places libres / candidats en attente » est indispensable, pas optionnel.
3. **Les deux prix sont provisoires** (2000 et 1500 DA) et affichés aux coureurs. Les changer après les premières inscriptions crée deux populations ayant payé des montants différents : prévoir de figer le montant dû sur la ligne `coureur` à l'inscription.
4. **Fusion `U20` → `Senior`** : si des résultats ou exports citent déjà `U20`, ils changent de catégorie. À vérifier au lot 1.
