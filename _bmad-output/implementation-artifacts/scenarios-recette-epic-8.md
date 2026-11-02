# Scénarios de recette — Épopée 8 : Environnement de recette hébergé

**Produit :** Azzel · **Périmètre :** stories 8-1 → 8-4 · **Date :** 2026-11-02
**Durée estimée :** 45–75 min (module par module, arrêt/reprise possible)
**Où :** sur l'environnement **hébergé**, pas en local — c'est l'objet même de cette épopée.

Chaque module se teste indépendamment : cochez au fur et à mesure et notez les écarts
dans la colonne Observations du tableau final.

---

## ⚠️ À lire avant de commencer

**1. Un défaut est déjà connu, ne le remontez pas comme nouveau.**

> **Télécharger une preuve de paiement depuis l'écran d'administration renvoie une
> erreur (HTTP 500).** C'est connu, ouvert, en cours d'investigation. Tout le reste de
> l'écran de validation de dossier fonctionne : la liste, la recherche, la fiche du
> coureur, la validation et le refus. Seule **l'ouverture du fichier joint** échoue.
> Détail : `deferred-work.md`, section « Point d'arrêt : preuves illisibles ».

**L'épopée 8 n'est donc pas close.** Ce document sert à éprouver tout le reste.

**2. Les données sont entièrement fictives.** Les cinquante coureurs, les volontaires,
les dossards, les passages : tout est inventé. Aucune donnée réelle de coureur n'est ni
ne doit être saisie ici. Les seules adresses réelles sont **les vôtres**, pour recevoir
vos codes de connexion.

**3. Les emails partent pour de vrai.** Validation, refus, rappel : ce sont de véritables
messages. Ils portent la mention « environnement de démonstration — données fictives » ;
si vous en recevez un, ce n'est pas une communication officielle.

**4. Vous pouvez casser des choses.** C'est le but. L'environnement se réinitialise par
une commande de l'équipe technique (`seed:reset`) ; signalez simplement quand vous
souhaitez repartir d'un état propre.

---

## 0. Préparation (5 min)

**Ce qu'il vous faut :**

- [ ] L'**URL de recette**, communiquée nominativement — actuellement
      `https://azzel-moulouls-projects.vercel.app`. **Ne la publiez pas** : avec votre
      code à six chiffres, elle est la seule protection de cet environnement.
- [ ] Votre **adresse email**, celle qui a été déclarée au comité (elle vous donne les
      droits d'organisateur dès votre première connexion).
- [ ] Un navigateur à jour, et idéalement un téléphone pour le module mobile.

**Vérifications préalables :**

- [ ] L'URL s'ouvre **directement** sur la page d'accueil d'Azzel — aucune demande de
      compte, aucune redirection vers une page de connexion d'un hébergeur. Si on vous
      demande de vous connecter à un service tiers : **arrêtez et signalez-le**.
- [ ] La page d'accueil n'est pas vide : logo, titres, contenus de la vitrine.

**Pour l'équipe technique uniquement** (prérequis déjà posés, à vérifier en cas de
panne) : migrations appliquées, `seed` exécuté, variables `DATABASE_URL`,
`SMTP_URL`, `APP_EMAIL_FROM`, `AZZEL_ADMIN_EMAILS`, `APP_URL` et les quatre
`PROOF_STORAGE_*` posées sur **Production et Preview**. Mode opératoire complet :
`deploiement-recette.md`.

---

## S1 — Base hébergée et accès (story 8-1)

**Ce qu'on éprouve :** l'application lit et écrit réellement dans la base en ligne, et
la connexion par code fonctionne depuis Internet.

**Précondition :** navigation privée, pour partir d'un état propre.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir l'URL de recette | Page d'accueil complète : contenus de la vitrine, pas de page d'erreur |
| 1.2 | Ouvrir la page **Résultats** | Des résultats s'affichent — ils viennent de la base en ligne, pas d'un fichier |
| 1.3 | Recharger la page deux ou trois fois de suite, rapidement | Toujours la même page, **aucune erreur intermittente** (ni « erreur serveur », ni page blanche) |
| 1.4 | Aller sur `/connexion`, saisir **votre** adresse, valider | Étape code : champ 6 chiffres, mention de validité, bouton de renvoi |
| 1.5 | Relever le code **dans votre vraie boîte mail** | Reçu en **moins d'une minute**, et **pas** dans les indésirables |
| 1.6 | Saisir un code erroné (ex. `000000`) | Refus explicite « Code erroné ou expiré » — aucun compte créé |
| 1.7 | Saisir le bon code | Connexion : votre espace s'affiche, votre adresse est visible |
| 1.8 | Le lien contenu dans l'email reçu | Il pointe sur l'**URL de recette**, jamais sur `localhost` |
| 1.9 | Votre adresse étant déclarée au comité : regarder l'en-tête | Lien « **Administration** » présent |

- [ ] S1 conforme — Observations : …………

### S1-bis — Isolation multi-organisation (recette technique, équipe uniquement)

Une organisation ne doit **jamais** voir les données d'une autre. La vérification se
fait en psql, sous le rôle applicatif, **sur la base hébergée**.

| # | Action (psql, rôle `azzel_app`) | Résultat attendu |
|---|--------|------------------|
| 1.10 | `SELECT current_user;` | `azzel_app` — **jamais** `postgres` : le rôle propriétaire contourne le RLS |
| 1.11 | `SELECT count(*) FROM coureur;` | **0** — aucun contexte d'organisation posé |
| 1.12 | `BEGIN; SELECT set_config('app.organisation_id','<id org>',true); SELECT count(*) FROM coureur; ROLLBACK;` | **50** |
| 1.13 | Même transaction : `SELECT status, count(*) FROM coureur GROUP BY status;` | **22** validés, **6** refusés, le reste en constitution |

- [ ] S1-bis conforme — Observations : …………

---

## S2 — Preuves de paiement hors disque local (story 8-2)

**Ce qu'on éprouve :** une preuve déposée **survit** à un redémarrage de l'application.
C'est ce qui distingue ce stockage de l'ancien, qui perdait les fichiers.

> **Rappel du défaut connu :** l'étape 2.5 (ouverture du fichier depuis l'administration)
> **échoue aujourd'hui** par une erreur serveur. Cochez « Écart connu », ne remontez pas.

**Précondition :** connecté avec votre adresse ; droits d'organisateur (S1.9).

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Depuis votre espace coureur, déposer une **photo quelconque** (JPEG ou PNG, ou un PDF) comme preuve de paiement | Dépôt accepté, prévisualisation ou confirmation affichée |
| 2.2 | Déposer un fichier `.txt` | **Rejet avant envoi**, formats acceptés listés |
| 2.3 | Déposer une **seconde** image | Nouvelle preuve active ; la précédente est remplacée, pas dupliquée |
| 2.4 | Attendre 10 minutes (ou demander un redéploiement à l'équipe), revenir sur la page | La preuve est **toujours là** — c'est le cœur de cette story |
| 2.5 | Aller dans **Administration → Dossiers**, ouvrir un dossier, cliquer sur la preuve | ⚠️ **Écart connu** : erreur serveur. Le fichier ne s'ouvre pas |
| 2.6 | Sur le même dossier, **refuser** avec le motif « Reçu illisible » | Le refus passe : statut refusé, traçabilité « Décidé par … le … » |
| 2.7 | Puis **valider** un autre dossier complet | Le dossier passe validé, « Décidé par » renseigné |

- [ ] S2 conforme hors écart connu — Observations : …………

---

## S3 — Jeu de données fictif « édition complète » (story 8-3)

**Ce qu'on éprouve :** le comité arrive sur une application **vivante**, et chaque écran
a de la matière.

**Précondition :** connecté, droits d'organisateur.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | **Administration → Dossiers** | Une liste d'une **cinquantaine** de coureurs, noms manifestement inventés |
| 3.2 | Filtrer / parcourir par statut | Les quatre stades sont représentés : en constitution, dossier complet, **validé** (22), **refusé** (6) |
| 3.3 | Ouvrir un dossier **refusé** | Le **motif** du refus est affiché |
| 3.4 | Rechercher un nom (ex. « Yani », « Kahina ») | La recherche trouve le coureur |
| 3.5 | **Administration → Volontaires** | Une douzaine de volontaires fictifs, avec téléphones d'exemple |
| 3.6 | **Administration → Missions** | **4 secteurs** (Départ, Checkpoint 1, Checkpoint 2, Arrivée) et **8 missions** couvrant les différents types, avec horaires |
| 3.7 | Ouvrir une mission | Consignes lisibles, volontaires assignés |
| 3.8 | Page **Résultats** (publique) | Des dossards et des passages existent : la page n'est pas vide |
| 3.9 | **Administration → Rapports** | Des chiffres cohérents avec ce que vous avez vu |
| 3.10 | Regarder n'importe quelle adresse email de coureur fictif | Elle finit par **`@seed.azzel.invalid`** — ce domaine n'existe pas, aucun message ne peut partir vers ces adresses |

- [ ] S3 conforme — Observations : …………

---

## S4 — Mise en ligne et remise au comité (story 8-4)

**Ce qu'on éprouve :** chaque membre du comité peut réellement entrer, et les emails
arrivent.

**À dérouler une fois par membre du comité**, pas une seule fois pour tous : un membre
qui ne reçoit pas son code ne prend rien en main.

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Membre du comité : ouvrir l'URL sur **son** poste | La page s'ouvre directement, sans compte d'hébergeur |
| 4.2 | Demander un code avec **son** adresse | Email reçu en **moins d'une minute**, **hors indésirables** |
| 4.3 | Regarder l'expéditeur du message | Adresse de l'événement, affichage correct (pas de « via … », pas d'avertissement du client mail) |
| 4.4 | Répondre à l'email | La réponse part vers la **boîte humaine** de l'événement (`Reply-To`) |
| 4.5 | Se connecter avec le code | Accès à l'espace, lien « Administration » présent |
| 4.6 | Depuis l'administration, **refuser** un dossier fictif puis consulter la boîte de réception | Aucun message n'arrive — les coureurs fictifs sont sur un domaine inexistant ; **c'est le comportement attendu** |
| 4.7 | Sur un email réellement reçu par vous (code de connexion) | Il porte la mention **« environnement de démonstration — données fictives »** |
| 4.8 | Ouvrir l'URL sur **téléphone** (360 px) | Aucune barre de défilement horizontal, boutons atteignables au pouce |
| 4.9 | Se déconnecter puis tenter d'ouvrir une page d'administration directement | Refusé — redirection vers la connexion |

- [ ] S4 conforme — Observations : …………

---

## Transverse (tous modules)

- [ ] Aucune page n'affiche d'erreur technique brute (trace, nom de table, message anglais)
- [ ] Aucune URL de l'environnement n'a été partagée hors du comité
- [ ] Aucune donnée réelle de coureur n'a été saisie
- [ ] Navigation clavier : anneau de focus visible sur liens et boutons

---

## Tableau de synthèse

| Module | Statut (OK / Écart) | Observations |
|--------|--------------------|--------------|
| S1 Base hébergée & accès | | |
| S1-bis Isolation multi-organisation | | |
| S2 Preuves hors disque local | | |
| S3 Jeu de données fictif | | |
| S4 Mise en ligne & délivrabilité | | |

**Écart déjà connu, hors comptage :** téléchargement d'une preuve depuis
l'administration — erreur serveur (étape 2.5). Ouvert, suivi dans `deferred-work.md`.

**Comment remonter un écart :** le numéro de l'étape (ex. « 3.6 »), ce que vous avez vu,
l'heure, et la page concernée. Une capture d'écran vaut dix lignes de description.
