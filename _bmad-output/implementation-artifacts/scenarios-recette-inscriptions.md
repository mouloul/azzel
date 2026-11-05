# Scénarios de recette — Inscriptions : contingent, expiration, genre, hébergement

**Produit :** Azzel · **Périmètre :** lots 1 → 5 de `spec-inscriptions-contingent-hebergement.md` · **Date :** 2026-11-05
**Durée estimée :** 75–100 min (module par module, arrêt/reprise possible)

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts dans la colonne Observations du tableau final.

Plusieurs modules demandent de **modifier des réglages** (capacité, contingent d'hébergement) pour provoquer les cas limites. Le module I1 explique où. Remettez les valeurs d'origine à la fin : **600 dossards, seuil 200, 200 hébergements, 2000 DA, 1500 DA, 2 jours**.

---

## 0. Préparation de l'environnement (5 min)

```bash
bash scripts/dev-db.sh up         # Postgres 54329
bash scripts/dev-mail.sh up       # faux SMTP — UI http://localhost:8026
pnpm -F @azzel/web db:migrate     # jusqu'à 0038_reglages_journal.sql
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
| 5.4 | Ouvrir Mailpit (http://localhost:8026) | Un email « Azzel — ton inscription a expiré », qui dit que la place a été rendue et invite à se réinscrire |
| 5.5 | Relancer la **même** commande | « Expirations : **0** » — rien n'est fait deux fois |
| 5.6 | Vérifier Mailpit | **Toujours un seul** email d'expiration, pas deux |
| 5.7 | Sur `/admin/inscriptions` | « Dossards pris » a **diminué de 1** : la place est rendue |
| 5.8 | **Cas à ne pas casser :** reprendre un coureur en constitution, lui faire **déposer une preuve** sur `/preuve`, puis forcer son échéance dans le passé et relancer la commande | « Expirations : **0** ». Un dossier déposé à temps **ne doit jamais expirer**, même s'il n'a pas encore été validé par l'équipe |
| 5.9 | **Rappel de la veille :** forcer `preuve_due_at` à `now() + interval '20 hours'` sur un coureur sans preuve, lancer la commande | « Rappels de preuve : 1 ». Un email « ta place t'attend encore jusqu'à demain » dans Mailpit |
| 5.10 | Relancer la commande trois fois | Toujours **un seul** email de rappel — un cron horaire ne doit pas en envoyer vingt-quatre |

- [ ] I5 conforme — Observations : …………

---

## I6 — Hébergement optionnel (lot 4)

**Précondition :** coureur connecté pouvant modifier son inscription ; accès admin pour régler le contingent.

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

**Points qui demandent une décision plutôt qu'une correction, à signaler s'ils gênent :**

- Le compteur public peut avoir jusqu'à **60 secondes de retard** (page en cache). Un visiteur peut lire « 3 places » alors qu'il n'y en a plus ; il part alors en liste d'attente sans que rien ne soit perdu.
- Les places libérées par expiration **ne sont attribuées à personne automatiquement** : c'est un choix d'organisation. Quelqu'un doit ouvrir l'écran d'administration et les donner.
- Abaisser le contingent d'hébergement **retire son lit** à un coureur qui renvoie son formulaire ensuite (étape 6.9). Le contingent fait autorité à chaque enregistrement.
- Les deux prix sont **provisoires**. Les changer après les premières inscriptions créera deux populations ayant versé des montants différents.
