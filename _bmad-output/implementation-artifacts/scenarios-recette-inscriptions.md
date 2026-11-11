# Scénarios de recette — Inscriptions : contingent, expiration, genre, hébergement, wilaya

**Produit :** Azzel · **Périmètre :** lots 1 → 5 de `spec-inscriptions-contingent-hebergement.md`, module I9 de `spec-inscriptions-wilaya-hebergement.md`, module I10 de `spec-dossier-refuse-modifiable.md` · **Date :** 2026-11-05 (I9 : 2026-11-10, I10 : 2026-11-11)
**Durée estimée :** 100–130 min (module par module, arrêt/reprise possible), + 20 min pour le module I9
**Ajout du 2026-11-10 :** module **I9 — Wilaya et hébergement** (`spec-inscriptions-wilaya-hebergement.md`). Pour retrouver des provenances dans le jeu fictif, relancer le seed après la migration : `pnpm -F @azzel/web seed:reset` puis `pnpm -F @azzel/web seed` (les coureurs fictifs déjà en base n'ont pas de wilaya). Depuis cet ajout, la **wilaya de provenance est obligatoire** dans le formulaire : dans les modules I2 à I7 et I10, choisissez une wilaya **autre que Tizi Ouzou** (par exemple « 16 — Alger ») pour pouvoir cocher l'hébergement.

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts dans la colonne Observations du tableau final.

Plusieurs modules demandent de **modifier des réglages** (capacité, contingent d'hébergement) pour provoquer les cas limites. Le module I1 explique où. Remettez les valeurs d'origine à la fin : **600 dossards, seuil 200, 200 hébergements, 2000 DA, 1500 DA, 2 jours**.

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up         # Postgres 54329
bash scripts/dev-mail.sh up       # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate     # jusqu'à 0044_statut_en_validation.sql (0044_wilaya_pays.sql comprise)
AZZEL_ADMIN_EMAILS=orga@example.dz pnpm dev:web   # http://localhost:3000
```

**Deux pièges de l'environnement de développement, à connaître avant de crier au bug :**

1. **L'accueil est mis en cache 60 secondes.** Après un changement de capacité, le compteur public peut rester sur l'ancienne valeur pendant une minute. Attendez, ou rechargez deux fois à 60 s d'intervalle.
2. **Une page toute neuve peut renvoyer une erreur 500 au premier lancement** si le serveur de développement tournait déjà. Arrêtez-le et relancez-le.

Deux fenêtres sont utiles : une **navigation privée** pour jouer le coureur, une fenêtre normale pour l'administration.

---

## I1 — L'écran d'administration des inscriptions (lot 5)

**Précondition :** connecté en organisateur (adresse listée dans `AZZEL_ADMIN_EMAILS`).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir `/admin`, regarder le menu | Une entrée **« Inscriptions »** entre « Dossiers » et « Volontaires » |
| 1.2 | Ouvrir `/admin/inscriptions` | Titre « Inscriptions — Édition 2027 ». Cinq chiffres en tête : dossards pris, places restantes, hébergements pris, lits restants, en liste d'attente |
| 1.3 | Lire les six réglages | Nombre de dossards **600**, seuil **200**, hébergements **200**, prix dossard **2000**, prix hébergement **1500**, délai **2** jours. Chacun porte une phrase d'explication |
| 1.4 | Saisir `-5` dans « Nombre de dossards », enregistrer | Refus : « Indique un nombre entier positif. » sous le champ. **Aucune valeur n'est modifiée** |
| 1.5 | Saisir `999999999`, enregistrer | Refus : « 100000 au maximum. » |
| 1.6 | Remettre `1000`, enregistrer | « Réglages enregistrés. » Le compteur « places restantes » augmente de 400 |
| 1.7 | Descendre à « Historique des réglages » | Une ligne : « Nombre de dossards : 600 → 1000 », suivie de la date, de l'heure et de **votre adresse email** |
| 1.8 | Réenregistrer sans rien changer | « Réglages enregistrés. » mais **aucune nouvelle ligne** dans l'historique — un réglage inchangé ne laisse pas de trace |
| 1.9 | Modifier **seulement** le seuil (200 → 150), enregistrer | **Une seule** ligne ajoutée, sur le seuil. Rien sur la capacité |
| 1.10 | Remettre capacité `600` et seuil `200` | Deux lignes de plus dans l'historique (c'est normal : ce sont deux vraies décisions) |

- [ ] I1 conforme — Observations : …………

---

## I2 — Genre et majorité obligatoire (lot 1)

**Précondition :** compte coureur connecté, sans inscription (navigation privée).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Ouvrir `/inscription`, parcourir le formulaire | Un champ **Genre** (Femme / Homme) entre la date de naissance et le téléphone, marqué « (obligatoire) » |
| 2.2 | Remplir tout sauf le genre, envoyer | Blocage : « Indique si tu cours en femme ou en homme. » |
| 2.3 | Lire l'aide sous la date de naissance | « Les épreuves sont réservées aux majeurs. Ta catégorie d'âge est calculée à la date de la course. » |
| 2.4 | Saisir une date de naissance donnant **17 ans le jour de la course** : `27/03/2009` (course au 26/03/2027 — il lui manque un jour) | Refus : « Les épreuves sont réservées aux majeurs : tu dois avoir 18 ans révolus le jour de la course. » |
| 2.5 | Saisir `26/03/2009` : **exactement 18 ans le jour de la course** | **Accepté** — la majorité s'apprécie au jour de la course, pas au jour de l'inscription |
| 2.6 | Compléter et envoyer | Inscription enregistrée. Le récapitulatif annonce une catégorie **Senior** |
| 2.7 | Revenir sur `/inscription` | Le genre choisi est présélectionné |

- [ ] I2 conforme — Observations : …………

---

## I3 — Compteur de places et liste d'attente (lot 2)

**Précondition :** accès à `/admin/inscriptions` pour régler la capacité. Notez le nombre de **dossards pris** affiché — appelons-le **N**.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | Capacité = `N + 300`, seuil = `200`. Ouvrir l'accueil (attendre 60 s) | **Aucun compteur** près du bouton « Participer » : il reste plus de places que le seuil |
| 3.2 | Capacité = `N + 150`. Recharger l'accueil (attendre 60 s) | Le compteur apparaît : « **150 places** sur … encore disponibles. » |
| 3.3 | Ouvrir `/inscription` en coureur | Le même compteur figure en tête du formulaire |
| 3.4 | Capacité = `N` (plus aucune place). Recharger l'accueil | « **Complet** — les inscriptions continuent en liste d'attente. » Le bouton « Participer » reste actif |
| 3.5 | Avec un **nouveau** compte coureur, remplir et envoyer l'inscription | Elle est **acceptée**, pas refusée |
| 3.6 | Rester sur `/inscription` | Un encart : « Les dossards sont tous pris : ton inscription est enregistrée en **liste d'attente**… Aucun versement n'est à faire tant qu'une place ne t'a pas été attribuée » |
| 3.7 | Modifier un champ (prénom) et renvoyer | La modification est enregistrée, le statut **reste** liste d'attente |
| 3.8 | Aller sur `/espace-coureur` | Aucune invitation à payer |
| 3.9 | Retour à `/admin/inscriptions` | « En liste d'attente : 1 ». Le coureur apparaît dans le tableau avec son épreuve et son heure d'inscription |

- [ ] I3 conforme — Observations : …………

---

## I4 — Attribution manuelle d'une place (lot 5)

**Précondition :** au moins un coureur en liste d'attente (module I3), capacité au complet.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Sur `/admin/inscriptions`, regarder le bouton « Attribuer une place » | **Désactivé** : il n'y a aucune place libre à donner |
| 4.2 | Relever la capacité de 1, enregistrer | « Places restantes : 1 ». Le bouton devient actif |
| 4.3 | Cliquer « Attribuer une place » sur le premier de la file | « Place attribuée : le coureur a reçu un nouveau délai de dépôt. » Le coureur **disparaît** de la liste d'attente |
| 4.4 | Côté coureur, recharger `/inscription` | L'encart « liste d'attente » a disparu. Un encart annonce la **date limite de dépôt de la preuve** |
| 4.5 | Vérifier cette date | Fin du **surlendemain** (23 h 59), heure d'Algérie |
| 4.6 | Si plusieurs coureurs attendent, vérifier l'ordre du tableau | Du **plus ancien au plus récent** — l'ordre d'arrivée |

- [ ] I4 conforme — Observations : …………

---

## I5 — Délai de preuve et expiration (lot 3)

**Précondition :** un coureur **en constitution** (place prise), sans preuve déposée. Son identifiant de compte est nécessaire pour forcer l'échéance.

> Ce module demande une manipulation en base pour ne pas attendre deux jours. Remplacez `EMAIL` par l'adresse du coureur testé.

```bash
# Forcer l'échéance dans le passé
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "UPDATE coureur SET preuve_due_at = now() - interval '1 minute' \
   WHERE account_id = (SELECT id FROM account WHERE email = 'EMAIL');"
```

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | Avant toute manipulation, ouvrir `/inscription` en coureur | Un encart annonce la date limite : « Dépose ta preuve de paiement avant le … : passé ce délai, l'inscription expire et la place repart » |
| 5.2 | Ouvrir `/preuve` | Un encart « Montant à verser : **2000 DA** — le dossard seul. » |
| 5.3 | Jouer la commande ci-dessus, puis `pnpm -F @azzel/web inscriptions:echeances` | Sortie : « Expirations : **1** inscription(s) expirée(s), 1 email(s) enfilé(s) — autant de places rendues. » |
| 5.4 | Ouvrir Mailpit (http://localhost:8026) | Un email « Azzel — ton inscription a expiré », qui dit que la place a été rendue et invite à cliquer sur « Modifier mon inscription » depuis l'espace coureur |
| 5.5 | Relancer la **même** commande | « Expirations : **0** » — rien n'est fait deux fois |
| 5.6 | Vérifier Mailpit | **Toujours un seul** email d'expiration, pas deux |
| 5.7 | Sur `/admin/inscriptions` | « Dossards pris » a **diminué de 1** : la place est rendue |
| 5.8 | **Cas à ne pas casser :** reprendre un coureur en constitution, lui faire **déposer une preuve** sur `/preuve` (il passe « en validation »), puis forcer son échéance dans le passé et relancer la commande | « Expirations : **0** ». Un dossier déposé à temps **ne doit jamais expirer**, même s'il n'a pas encore été validé par l'équipe |
| 5.9 | **Rappel de la veille :** forcer `preuve_due_at` à `now() + interval '20 hours'` sur un coureur sans preuve, lancer la commande | « Rappels de preuve : 1 ». Un email « ta place t'attend encore jusqu'à demain » dans Mailpit |
| 5.10 | Relancer la commande trois fois | Toujours **un seul** email de rappel — un cron horaire ne doit pas en envoyer vingt-quatre |

- [ ] I5 conforme — Observations : …………

---

## I6 — Hébergement optionnel (lot 4)

**Précondition :** coureur connecté pouvant modifier son inscription, avec une wilaya **autre que Tizi Ouzou** (voir I9) ; accès admin pour régler le contingent.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 6.1 | Ouvrir `/inscription`, descendre au bloc « Hébergement » | Une case « Je souhaite un hébergement (**1500 DA**) » et, dessous, « Il reste **N** places sur 200 » |
| 6.2 | Vérifier que le compteur est visible même quand il reste beaucoup de lits | Oui — contrairement au compteur de dossards, celui-ci s'affiche **toujours** |
| 6.3 | Cocher la case et enregistrer | Enregistré. Le compteur de lits restants diminue de 1 |
| 6.4 | Ouvrir `/preuve` | « Montant à verser : **3500 DA** — dossard 2000 DA et hébergement 1500 DA, **en un seul versement**. » |
| 6.5 | Revenir sur `/inscription`, décocher, enregistrer | Le lit est rendu : le compteur remonte de 1 |
| 6.6 | Sur `/preuve` | Le montant repasse à **2000 DA** |
| 6.7 | Dans l'admin, mettre « Nombre d'hébergements » à `0`, enregistrer | — |
| 6.8 | Côté coureur, recharger `/inscription` | La case est **désactivée mais visible**, avec « Hébergement complet : tous les lits sont pris. Tu peux t'inscrire sans. » |
| 6.9 | **Conséquence à connaître :** reprendre un coureur qui **avait déjà** un hébergement (sa case reste cochée et active), et renvoyer son formulaire alors que le contingent est à `0` | Il **perd son lit** : le contingent fait autorité à chaque enregistrement. À signaler si ce n'est pas le comportement voulu |
| 6.10 | Remettre `200` hébergements | Le compteur revient |

- [ ] I6 conforme — Observations : …………

---

## I7 — Concurrence sur la dernière place (lots 2 et 4)

Ce module vérifie le point le plus délicat : deux personnes qui s'inscrivent **en même temps** sur la dernière place. Il se joue à deux (deux navigateurs, deux comptes) ou se laisse aux tests automatisés, qui le couvrent avec dix inscriptions simultanées.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 7.1 | Régler la capacité pour qu'il reste **exactement 1 place** | « Places restantes : 1 » |
| 7.2 | Deux coureurs différents remplissent le formulaire, **sans envoyer** | — |
| 7.3 | Envoyer les deux le plus simultanément possible | **Un seul** passe « en constitution ». L'autre est en **liste d'attente**. Jamais deux admis |
| 7.4 | Vérifier dans l'admin | « Dossards pris » n'a augmenté que de **1** |
| 7.5 | Même manipulation avec **1 seul lit** d'hébergement | Un seul coureur obtient le lit |

- [ ] I7 conforme — Observations : …………

---

## I8 — Dégradations et cas d'erreur

| # | Action | Résultat attendu |
|---|--------|------------------|
| 8.1 | Arrêter Postgres (`bash scripts/dev-db.sh down`), recharger l'accueil | La page s'affiche **sans le compteur**. Elle ne tombe pas en erreur |
| 8.2 | Ouvrir `/admin/inscriptions` base arrêtée | Un écran « indisponible » lisible, pas une page blanche |
| 8.3 | Relancer la base, recharger | Tout revient |
| 8.4 | Se déconnecter, appeler `/admin/inscriptions` | Redirection vers la connexion — **aucune donnée d'inscription visible** |
| 8.5 | Connecté en **coureur** (pas organisateur), appeler `/admin/inscriptions` | Refusé |

- [ ] I8 conforme — Observations : …………

---

## I9 — Wilaya de provenance et hébergement réservé aux non-Tizi-Ouzou

**Règle testée (décision du 10/11/2026) :** chaque coureur indique sa wilaya (69 wilayas, ou « Étranger » avec un pays). L'hébergement est **réservé aux participants venant d'une autre wilaya que Tizi Ouzou**. Les dossiers déjà saisis avant cette règle ne sont **pas** modifiés automatiquement.

**Préconditions :**
- Environnement de la section 0 démarré, migration `0044_wilaya_pays.sql` appliquée (la sortie de `db:migrate` l'annonce, ou « rien à faire » si elle l'était déjà).
- Contingent d'hébergement non nul (200 par défaut).
- Deux comptes coureurs : **A** neuf (aucune inscription), **B** neuf lui aussi (il servira de « dossier ancien » à l'étape 9.13).
- Un compte organisateur pour `/admin/dossiers`.

| # | Action | Résultat attendu | OK |
|---|--------|------------------|----|
| 9.1 | Coureur A : ouvrir `/inscription`, bloc « Ton identité » | Sous le téléphone, une liste **« Wilaya de provenance (obligatoire) »** avec l'aide « Là où tu résides. Tu vis hors d'Algérie : choisis « Étranger ». » | ☐ |
| 9.2 | Dérouler la liste | « Choisir ta wilaya », puis **69 wilayas** numérotées de « 01 — Adrar » à « 69 — Messaad » (dont « 15 — Tizi Ouzou », « 59 — Aflou »), puis **« Étranger »** en dernier | ☐ |
| 9.3 | Remplir tout le formulaire **sauf** la wilaya, cliquer « Valider et continuer » | Blocage, le curseur va sur la liste : « Choisis ta wilaya, ou « Étranger ». » | ☐ |
| 9.4 | Choisir « 15 — Tizi Ouzou », descendre au bloc « Hébergement » | La case « Je souhaite un hébergement » est **décochée et grisée** ; dessous : « L'hébergement est réservé aux participants venant d'une autre wilaya que Tizi Ouzou. » | ☐ |
| 9.5 | Lire le récapitulatif à droite (ou en bas sur téléphone) | Une ligne « Provenance : Tizi Ouzou (15) » | ☐ |
| 9.6 | Choisir « 06 — Béjaïa » | La case redevient **active** ; l'aide commence par « Réservé aux participants venant d'une autre wilaya que Tizi Ouzou. Il reste N places… » | ☐ |
| 9.7 | Cocher l'hébergement, puis **revenir** sur « 15 — Tizi Ouzou » | La case se **décoche toute seule** et se grise | ☐ |
| 9.8 | Rechoisir « 06 — Béjaïa », cocher l'hébergement, envoyer | Inscription enregistrée. Accepter la décharge et le règlement sur `/acceptations` (la preuve ne s'ouvre qu'ensuite, voir I10), puis sur `/preuve` : montant = **prix du dossard + prix de l'hébergement** (réglages de `/admin/inscriptions`) | ☐ |
| 9.9 | Revenir sur `/inscription` | « 06 — Béjaïa » est présélectionné, la case hébergement cochée | ☐ |
| 9.10 | Choisir « Étranger » | Une nouvelle liste **« Pays de résidence (obligatoire) »** apparaît sous la wilaya. Pas d'« Algérie » dedans ; les pays sont en français et dans l'ordre alphabétique | ☐ |
| 9.11 | Sans choisir de pays, envoyer | Blocage : « Indique ton pays de résidence. » | ☐ |
| 9.12 | Choisir « France », envoyer. Puis revenir sur `/inscription` | Enregistré. « Étranger » et « France » sont présélectionnés, le récapitulatif dit « Provenance : Étranger — France » ; l'hébergement reste possible | ☐ |
| 9.13 | **Dossier ancien.** Coureur B : s'inscrire avec « 16 — Alger » et l'hébergement coché. Puis simuler un dossier saisi avant la règle (commande ci-dessous, en remplaçant l'email) | La commande affiche `UPDATE 1` | ☐ |
| 9.14 | Organisateur : ouvrir `/admin/dossiers`, puis le dossier de B | La fiche s'affiche **sans erreur**, avec « Provenance : non renseignée » | ☐ |
| 9.15 | Coureur B : ouvrir `/inscription` | La liste wilaya est **vide** (« Choisir ta wilaya »), la case hébergement **toujours cochée** : rien n'a été retiré d'office | ☐ |
| 9.16 | **Garde-fou de la base** (commande ci-dessous, B a encore son hébergement) : tenter de donner Tizi Ouzou au dossier de B directement en base | Refus de Postgres : `violates check constraint "coureur_hebergement_hors_tizi_check"`. Rien n'est modifié | ☐ |
| 9.17 | Coureur B : choisir « 15 — Tizi Ouzou » | La case se **décoche** et se grise | ☐ |
| 9.18 | Organisateur : sur `/admin/inscriptions`, **relever** le chiffre « Hébergements pris ». Puis coureur B : enregistrer les modifications. Recharger `/admin/inscriptions` | Enregistré **sans erreur**. « Hébergements pris » a **diminué de 1** (et « lits restants » augmenté de 1). Sur `/preuve` de B (après acceptation de la décharge et du règlement sur `/acceptations` si ce n'est pas déjà fait) : montant = **prix du dossard seul** | ☐ |
| 9.19 | Organisateur : rouvrir la fiche de B | « Provenance : Tizi Ouzou (15) » | ☐ |
| 9.20 | Ouvrir la fiche de A | « Provenance : Étranger — France » | ☐ |

Commande de l'étape 9.13 (dossier « ancien » : on efface sa wilaya, l'hébergement reste) :

```bash
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "UPDATE coureur SET wilaya = NULL, pays = NULL \
   WHERE account_id = (SELECT id FROM account WHERE email = 'email-du-coureur-b@exemple.dz' \
     AND organisation_id = (SELECT id FROM organisation WHERE slug = 'ait-aissi'));"
```

Commande de l'étape 9.16 (même email que pour 9.13 ; une réponse `UPDATE 0` signifie que l'email ne correspond à aucun dossier — le corriger) :

```bash
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "UPDATE coureur SET wilaya = '15', pays = NULL \
   WHERE account_id = (SELECT id FROM account WHERE email = 'email-du-coureur-b@exemple.dz' \
     AND organisation_id = (SELECT id FROM organisation WHERE slug = 'ait-aissi'));"
```

Contrôle facultatif de ce qui est stocké (codes, jamais de libellés) :

```bash
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "SELECT first_name, wilaya, pays, hebergement FROM coureur ORDER BY updated_at DESC LIMIT 5;"
```

Attendu : `06` / `ETR` + `FR` / `15` / vide pour les dossiers anciens — jamais « Béjaïa » ni « France » en toutes lettres.

- [ ] I9 conforme — Observations : …………

---

## I10 — Cycle de vie du dossier : en validation, reprise après refus ou expiration

**Référence :** `spec-dossier-refuse-modifiable.md` (décision PO du 11/11/2026).

```
en constitution (place réservée, 48 h) ── preuve déposée ──▶ en validation
en constitution ── preuve manquante à l'échéance ──▶ expirée (place rendue)
en validation ──▶ validé  |  refusé (place rendue)
refusé / expirée ── « Modifier mon inscription » ──▶ en constitution (nouveau délai) ou liste d'attente
```

**Préconditions :** migrations appliquées jusqu'à `0044_statut_en_validation.sql`, Mailpit démarré, une fenêtre **organisateur** (`/admin/dossiers`) et une fenêtre privée **coureur**. Préparez **deux fichiers images différents** (deux photos de reçu, A et B). Capacité remise à 600.

Commande utile pour lire l'état d'un dossier (remplacer `EMAIL`) :

```bash
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "SELECT c.status, c.refusal_reason, c.preuve_due_at, c.expired_at, \
          (SELECT string_agg(p.status, ', ' ORDER BY p.created_at) FROM preuve p WHERE p.coureur_id = c.id) AS preuves \
   FROM coureur c JOIN account a ON a.id = c.account_id WHERE a.email = 'EMAIL';"
```

### 9.A — Dépôt de preuve et validation

| # | Action | Résultat attendu |
|---|--------|------------------|
| 10.1 | Coureur neuf : s'inscrire sur `/inscription` | `/espace-coureur` affiche le statut **« En attente de justificatif de paiement »**, pastille à **point ambre** (orange foncé) |
| 10.1b | **Sans** accepter les documents, ouvrir `/preuve` | Page **« Accepte d'abord la décharge et le règlement »** avec un bouton vers `/acceptations`. **Aucun** champ de dépôt : la preuve ne se dépose qu'après les acceptations |
| 10.2 | Accepter les documents sur `/acceptations`, puis déposer le fichier **A** sur `/preuve` | Le statut devient **« En attente de validation par l'organisation »**, pastille à **point brun-gris** (le même que « Liste d'attente » : c'est à l'organisation d'agir). En base : `en validation` |
| 10.3 | Ouvrir `/inscription` | Page **« Dossier en cours de validation »** — et **pas** « Dossier déjà validé ». Un bouton « Remplacer ma preuve de paiement » |
| 10.3b | Ouvrir `/acceptations` | Page **« Dossier en cours de validation »**, aucune case à cocher : rien ne change pendant l'examen |
| 10.4 | Ouvrir `/preuve` | Encart « Ta preuve est déposée : ton dossier est en cours de validation… ». Le fil d'étapes montre Paiement « Fait » et Validation en cours. Le dépôt reste possible |
| 10.5 | Déposer le fichier **B** (remplacement) | Accepté. Le statut **reste** « en validation ». En base, preuves : `replaced, active` |
| 10.6 | Organisateur : `/admin/dossiers` | Le compteur **« À examiner (en validation) »** compte ce dossier. « En attente de justificatif » compte les dossiers sans preuve |
| 10.7 | Organisateur : ouvrir un dossier **en constitution** (sans preuve) | **Pas de formulaire de décision** ; message « Aucune décision à prendre : le coureur n'a pas encore déposé sa preuve de paiement. » |
| 10.8 | Organisateur : ouvrir le dossier du coureur (en validation) | Le formulaire Valider / Refuser est proposé |
| 10.9 | Forcer l'échéance du coureur dans le passé (commande du module I5), lancer `pnpm -F @azzel/web inscriptions:echeances` | « Expirations : **0** » : un dossier en validation **n'expire jamais** |

### 9.B — Refus puis reprise

| # | Action | Résultat attendu |
|---|--------|------------------|
| 10.10 | Organisateur : **refuser** le dossier avec le motif « Montant incomplet » | Statut « Refusé ». Dans Mailpit, l'email « ton dossier est refusé » porte le motif et dit de cliquer sur **« Modifier mon inscription »** puis de déposer une **nouvelle** preuve |
| 10.11 | Coureur : ouvrir `/espace-coureur` | Statut « Refusé », motif « Montant incomplet » affiché, et **une seule action** : « Modifier mon inscription ». Aucun lien vers `/preuve` ni `/acceptations` |
| 10.12 | Coureur : ouvrir directement `/preuve` | Page **« Dossier refusé »** avec le motif et un bouton « Modifier mon inscription ». **Aucun** champ de dépôt |
| 10.13 | Organisateur : rouvrir le dossier refusé | Pas de formulaire de décision ; message « Dossier refusé : il repassera en validation si le coureur modifie son inscription… » |
| 10.14 | Coureur : cliquer « Modifier mon inscription » | Le formulaire s'ouvre (pas « Dossier déjà validé »). Un encadré rappelle le motif et explique : place réservée avec un nouveau délai s'il en reste, sinon liste d'attente |
| 10.15 | Enregistrer sans rien changer | Retour à l'espace. Statut **« En attente de justificatif de paiement »**. En base : `en constitution`, `refusal_reason` vide, `preuve_due_at` = **nouvelle** échéance (fin du surlendemain d'aujourd'hui), preuves : `replaced, refusée` |
| 10.16 | Sur `/preuve`, redéposer **le fichier B** (celui qui a été refusé) | Refus : « Cette preuve identique a déjà été refusée — dépose une version différente… ». Le statut reste en constitution |
| 10.17 | Déposer le fichier **A** | Accepté. Statut « en validation ». Le dossier réapparaît dans « À examiner » |
| 10.18 | Organisateur : **valider** | Statut « Validé », dossard attribué |
| 10.19 | Coureur : ouvrir `/inscription` | Page **« Dossier déjà validé »** — c'est le seul statut qui l'affiche |

### 9.C — Expiration puis reprise

| # | Action | Résultat attendu |
|---|--------|------------------|
| 10.20 | Nouveau coureur inscrit, **sans** preuve. Forcer son échéance dans le passé, lancer la commande d'échéances | Statut « Expirée ». Email « ton inscription a expiré » : il invite à cliquer sur « Modifier mon inscription » depuis l'espace coureur |
| 10.21 | Coureur : `/espace-coureur` | Pièce « Dossier validé » : « Inscription expirée faute de preuve dans le délai… » et l'action « Modifier mon inscription », seule |
| 10.22 | Ouvrir `/inscription` | Formulaire ouvert, encart « Ton inscription a expiré… Enregistre de nouveau ton inscription pour la reprendre » ; **aucune** échéance passée annoncée |
| 10.23 | Enregistrer | Statut « En attente de justificatif ». En base : `en constitution`, nouvelle `preuve_due_at`, **`expired_at` conservé** (trace de l'expiration) |
| 10.23b | **Second cycle** — sur ce même coureur, forcer `preuve_due_at` à `now() + interval '20 hours'`, lancer la commande d'échéances | « Rappels de preuve : **1** » — un second email « ta place t'attend encore » dans Mailpit (le premier cycle n'empêche pas le rappel de la nouvelle échéance). Relancer : toujours un seul nouveau rappel |
| 10.23c | Forcer `preuve_due_at` à `now() - interval '1 minute'`, relancer la commande | « Expirations : **1** », et un **second** email « ton inscription a expiré » dans Mailpit |

### 9.D — Reprise sans place disponible

| # | Action | Résultat attendu |
|---|--------|------------------|
| 10.24 | Préparer un coureur refusé (10.10) ou expiré (10.20). Sur `/admin/inscriptions`, régler la capacité au nombre de **dossards pris** | « Places restantes : 0 » |
| 10.25 | Coureur : « Modifier mon inscription », enregistrer | Statut **« Liste d'attente »**, aucune échéance, aucun versement demandé |
| 10.26 | Remettre la capacité à 600 | — |

### 10.E — Migration des données existantes

| # | Action | Résultat attendu |
|---|--------|------------------|
La migration étant déjà appliquée, on **fabrique** la situation qu'elle corrige (un dossier « en constitution » avec une preuve active, comme avant ce changement), puis on la rejoue. Remplacer `EMAIL` par l'adresse d'un coureur **en constitution sans preuve** (module 10.20 avant expiration, ou un coureur neuf).

```bash
# 1. Fabriquer un dossier hérité : preuve active sur un dossier en constitution
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status) \
   SELECT c.organisation_id, c.id, 'recette-heritee.jpg', 'image/jpeg', 1024, md5(random()::text), 'active' \
   FROM coureur c JOIN account a ON a.id = c.account_id \
   WHERE a.email = 'EMAIL' AND c.status = 'en constitution';"

# 2. Oublier la migration 0044 pour pouvoir la rejouer
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "DELETE FROM schema_migrations WHERE name = '0044_statut_en_validation.sql';"

# 3. Compter les dossiers en constitution avec preuve active
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "SELECT count(*) FROM coureur c WHERE c.status = 'en constitution' \
   AND EXISTS (SELECT 1 FROM preuve p WHERE p.coureur_id = c.id AND p.status = 'active');"
```

| # | Action | Résultat attendu |
|---|--------|------------------|
| 10.27 | Jouer les commandes 1 et 2, puis la commande 3 | La commande 3 affiche **1** (au moins) : le dossier hérité |
| 10.28 | Lancer `pnpm -F @azzel/web db:migrate`, puis la commande 3 | « Migration appliquée : 0044_statut_en_validation.sql », puis **0**. Le coureur `EMAIL` est désormais **« en validation »** ; les coureurs sans preuve restent « en constitution » |
| 10.29 | Rejouer les commandes 2 puis `db:migrate` | La migration repasse **sans erreur** (elle est rejouable), la commande 3 affiche toujours **0** |
| 10.30 | Relancer `pnpm -F @azzel/web db:migrate` | « Migrations déjà appliquées : rien à faire. » |

### Remise en état après I10

```bash
# Capacité d'origine (si modifiée en 10.24)
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "UPDATE edition SET capacite = 600;"
# Retirer la preuve fabriquée en 10.E (le fichier n'existe pas sur le disque)
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "DELETE FROM preuve WHERE storage_key = 'recette-heritee.jpg';"
```

Le coureur dont la preuve fabriquée a été retirée reste « en validation » sans preuve : l'organisation ne peut pas le valider (« il manque la preuve de paiement »). Le refuser, ou repartir d'une base propre avec la commande de réinitialisation du seed. Les comptes coureurs créés pendant I10 peuvent rester : ils n'affectent aucun autre module.

- [ ] I10 conforme — Observations : …………

---

## Remise en état après recette

```bash
docker exec -e PGPASSWORD=azzel azzel-postgres psql -U azzel -d azzel -c \
  "UPDATE edition SET capacite = 600, seuil_affichage_places = 200, \
   capacite_hebergement = 200, prix_dossard_da = 2000, \
   prix_hebergement_da = 1500, delai_preuve_jours = 2;"
```

L'historique des réglages conserve la trace de vos manipulations : c'est normal et voulu. Pour repartir d'une base propre, utilisez la commande de réinitialisation du seed.

---

## Synthèse

| Module | Objet | Statut | Observations |
|--------|-------|--------|--------------|
| I1 | Écran d'administration et journal | ☐ Conforme ☐ Écart | |
| I2 | Genre et majorité à 18 ans | ☐ Conforme ☐ Écart | |
| I3 | Compteur de places et liste d'attente | ☐ Conforme ☐ Écart | |
| I4 | Attribution manuelle d'une place | ☐ Conforme ☐ Écart | |
| I5 | Délai de preuve, expiration, rappel | ☐ Conforme ☐ Écart | |
| I6 | Hébergement optionnel contingenté | ☐ Conforme ☐ Écart | |
| I7 | Concurrence sur la dernière place | ☐ Conforme ☐ Écart | |
| I8 | Dégradations et droits d'accès | ☐ Conforme ☐ Écart | |
| I9 | Wilaya de provenance et hébergement hors Tizi Ouzou | ☐ Conforme ☐ Écart | |
| I10 | Cycle de vie du dossier : en validation, reprise après refus ou expiration | ☐ Conforme ☐ Écart | |

**Points qui demandent une décision plutôt qu'une correction, à signaler s'ils gênent :**

- Le compteur public peut avoir jusqu'à **60 secondes de retard** (page en cache). Un visiteur peut lire « 3 places » alors qu'il n'y en a plus ; il part alors en liste d'attente sans que rien ne soit perdu.
- Les places libérées par expiration **ne sont attribuées à personne automatiquement** : c'est un choix d'organisation. Quelqu'un doit ouvrir l'écran d'administration et les donner.
- Abaisser le contingent d'hébergement **retire son lit** à un coureur qui renvoie son formulaire ensuite (étape 6.9). Le contingent fait autorité à chaque enregistrement.
- Les dossiers saisis **avant** la question de la wilaya gardent leur hébergement tant qu'ils ne sont pas modifiés, même s'ils viennent de Tizi Ouzou (étapes 9.13-9.18) : la règle ne s'applique qu'à la prochaine modification. Un dossier déjà **validé** n'est plus modifiable par le coureur : il ne sera **jamais** régularisé automatiquement. Le tri se fait à la main, avec la requête de contrôle ci-dessus (`wilaya` vide et `hebergement` à `t`).
- La preuve ne se dépose **qu'après** l'acceptation de la décharge et du règlement (décision PO du 11/11/2026) : aucune acceptation n'est possible une fois le dossier en validation.
- Les deux prix sont **provisoires**. Les changer après les premières inscriptions créera deux populations ayant versé des montants différents.
