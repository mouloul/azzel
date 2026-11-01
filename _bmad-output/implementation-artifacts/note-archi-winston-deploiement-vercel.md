# Note d'architecture — Environnement de recette pour le comité d'organisation

**Auteur :** Winston (System Architect) · **Date :** 2026-11-01
**Statut :** décision prise, 4 stories à ordonnancer
**Objectif :** mettre `apps/web` en ligne sur une URL stable pour que le comité
d'organisation prenne l'application en main.

**Règle cardinale : aucune donnée réelle de coureur.** Le jeu de données est fictif,
régénérable, et c'est la seule protection qui compte. Les adresses email du comité
sont réelles — elles reçoivent les codes de connexion — mais ce sont les leurs, pas
celles d'inscrits.

**Hors portée :** la production du jour de course, qui reste sur VPS conformément à
`ARCHITECTURE-SPINE.md` §Stack. Les crons, la mise à jour de la spine et l'amendement
des `scenarios-recette-epic-<N>.md` ne font pas partie de ce lot.

---

## 1. Décision

L'environnement de recette est hébergé sur **Vercel**, déployé depuis `main`.

### Pourquoi Vercel plutôt qu'un VPS

Un VPS avec Coolify éviterait deux modifications de code — le disque local fonctionne
tel quel. Mais il les remplace par de l'infrastructure qui n'existe pas encore :
`Dockerfile`, `output: 'standalone'`, composition de conteneurs, domaine, TLS. Aucun
de ces fichiers n'est au dépôt aujourd'hui, et aucun ne resservira si la production
part sur un autre socle.

À l'inverse, les deux modifications exigées par Vercel — base hébergée et stockage des
preuves hors disque local — sont celles dont la production aura besoin de toute façon.
Le travail sert deux fois. C'est le seul argument qui tranche ; la commodité de
déploiement n'est qu'un bonus.

### Pas de protection d'accès au niveau de l'hébergeur

Le comité se connecte lui-même, avec ses propres adresses. Une protection Vercel
(authentification de plateforme ou mot de passe) les obligerait à posséder un compte
chez l'hébergeur et briserait exactement le parcours qu'ils doivent éprouver.

La protection repose donc sur deux choses, et uniquement sur elles :

1. **L'authentification de l'application** — code à 6 chiffres par email, déjà en place.
2. **Une URL non publiée**, partagée nominativement au comité.

Cette posture n'est tenable que parce qu'aucune donnée réelle n'est en jeu. Si cette
règle tombe, la décision d'hébergement est à rouvrir entièrement.

---

## 2. Les deux verrous techniques

### V1 — Base de données hébergée

Il n'existe aujourd'hui aucune base hors Docker local (`scripts/dev-db.sh`). Il faut
provisionner le projet Supabase annoncé par la spine (free tier : Postgres 500 Mo,
storage 1 Go), appliquer les 20 migrations avec le rôle propriétaire, et vérifier que
le RLS multi-organisation (AD-4, migrations 0008/0009) se comporte identiquement en
hébergé.

**Contrainte serverless.** `postgres.js` ouvre des connexions persistantes. La
connexion applicative doit passer par le **pooler Supabase en mode transaction**
(port 6543). Les migrations continuent de tourner avec `DATABASE_OWNER_URL` sur la
**connexion directe** (port 5432), pas sur le pooler.

#### Audit du 2026-11-01 — résultat

**Le contexte RLS est déjà compatible pooler.** `withOrg` (`apps/web/src/db/org-scope.ts`)
pose le GUC par `set_config(..., true)` — portée transaction — *à l'intérieur* de
`sql.begin()`. Aucune retouche nécessaire : AD-4 tient en mode transaction. C'était
l'inconnue du lot, elle est levée.

Deux problèmes réels ont été trouvés à la place.

**(a) Requêtes préparées — bloquant.** Aucun `prepare: false` nulle part. `postgres.js`
prépare par défaut, et PgBouncer en mode transaction ne le supporte pas : des erreurs
`prepared statement already exists` apparaîtront dès qu'une connexion sera recyclée.
Ce n'est pas un risque, c'est une certitude.

**(b) Dix pools indépendants.** Chaque module instancie le sien en `max: 5` —
`inscriptions`, `iam`, `missions`, `chrono`, `rapports`, `sponsors`, `contenus`,
`tracking`, `retour-images`, `outbox`. Soit jusqu'à cinquante connexions par instance
de fonction, multipliées par les instances tenues chaudes. Le free tier n'y survit
pas. Il n'existe aucune fabrique de connexion commune : l'appel `postgres(...)` est
dupliqué dix fois.

**Forme retenue pour la story 1.** Centraliser la fabrique dans
`apps/web/src/db/client.ts` : un pool mémoïsé unique, options pilotées par
l'environnement (`prepare: false` et `max: 1` en serverless, `max: 5` en local), et
faire pointer les dix modules dessus. Le patron existant est conservé — garde de rôle
applicatif `protegerStore`, mémoïsation par `globalThis`. Refactor mécanique sur dix
fichiers, sans reprise de logique métier, et utile indépendamment de Vercel.

**Points mineurs relevés, sans action.** La garde `protegerStore` exécute un
`SELECT current_user` mémoïsé par connexion : en mode transaction le rôle reste
`azzel_app`, le verdict demeure valide. Les lectures hors GUC documentées
(`findOrganisationIdBySlug`, `listOrganisationIds`) sont de simples SELECT, sans
incidence sur le pooler. La mémoïsation module de `slug → id` se reconstruit à chaque
instance froide : perte d'efficacité marginale, pas un défaut.

### V2 — Stockage des preuves de paiement

`LocalDiskProofStore` écrit sur le disque local (`STORAGE_DIR`, défaut
`./data/preuves`). Le système de fichiers d'une fonction Vercel est éphémère et en
lecture seule hors `/tmp` : les preuves CCP déposées disparaîtraient entre deux
invocations, et la validation de dossier — un des parcours que le comité doit
justement éprouver — serait cassée.

L'interface `ProofStore` (`put` / `read` / `remove`) existe déjà et isole correctement
le disque. Il faut une implémentation `SupabaseProofStore` derrière cette même
interface, sélectionnée par configuration, conservant la vérification de cohérence
format/contenu (`detectProofFormat`) et les clés de stockage opaques.

#### Story 8.2 livrée (2026-11-01) — forme retenue et reste-à-faire

`ObjetProofStore` (`apps/web/src/modules/inscriptions/proof-store-objet.ts`) parle à
l'API Storage par `fetch`, sans SDK : trois routes suffisent — `POST` / `GET` /
`DELETE` sur `{base}/object/{bucket}/{clé}`, authentifiées en `Bearer` (routes
confirmées sur la spécification OpenAPI officielle du service, le 2026-11-01).
Ajouter `@supabase/supabase-js` pour trois appels HTTP contredirait le principe de
technologie ennuyeuse de la spine.

Le point de bascule est unique : `getProofStore()`. Aucun appelant n'a été modifié.
**`LocalDiskProofStore` reste le défaut** — `PROOF_STORAGE_DRIVER` absent ou `disque`
— et un dépôt cloné ne demande aucune clé. Variables documentées dans `.env.example` :
`PROOF_STORAGE_DRIVER`, `PROOF_STORAGE_URL`, `PROOF_STORAGE_KEY` (secrète),
`PROOF_STORAGE_BUCKET` (défaut `preuves`). Une valeur de sélecteur inconnue, ou une
configuration incomplète, échoue au démarrage en nommant la variable : pas de repli
silencieux sur un disque qui perdrait les preuves.

**Reste à faire — ce n'est pas un oubli.** Au moment de la livraison, le projet
Supabase existe (`dhxuqnikxivagvlhhrmp`, eu-west-1) mais **aucun bucket n'est créé et
aucune clé de stockage n'est configurée**. L'implémentation et ses tests ont donc été
éprouvés contre une doublure du transport HTTP. Avant la mise en ligne (story 8.4) :

1. créer le bucket `preuves`, **privé** — les preuves sont des données personnelles de
   coureurs, elles transitent par le backend, jamais par une URL publique ni signée ;
2. poser `PROOF_STORAGE_DRIVER=objet`, `PROOF_STORAGE_URL`, `PROOF_STORAGE_KEY` et, si
   le bucket porte un autre nom, `PROOF_STORAGE_BUCKET` dans les variables du
   déploiement ;
3. **vérifier contre le stockage réel** : dépôt, relecture, suppression, suppression
   répétée, et persistance d'une preuve après redémarrage — c'est ce dernier point qui
   distingue ce stockage du disque local ;
4. surveiller le plafond du free tier (storage 1 Go) : une preuve pèse au plus 300 Ko,
   le jeu de données fictif de la story 8.3 en dépose plusieurs dizaines.

---

## 3. Envoi des emails

Le comité reçoit ses codes de connexion dans ses vraies boîtes. Il faut donc un
**expéditeur SMTP qui délivre réellement** — Mailjet, compte créé — configuré via
`SMTP_URL`. Un collecteur type Mailpit ne convient pas : il sert au testeur qui
vérifie qu'un message est parti, pas à l'utilisateur qui doit le recevoir.

**Le domaine `azzel.org` est un prérequis, pas une commodité.** Mailjet sait valider
une adresse seule sans toucher au DNS, mais il ne peut aligner ni SPF ni DKIM sur un
domaine qui n'est pas le nôtre. Expédier depuis l'adresse Gmail de l'événement
reviendrait à envoyer non authentifié pour le compte de Gmail : plusieurs récepteurs
rejettent ou réécrivent l'en-tête `From` dans ce cas, et des fournisseurs d'envoi
l'interdisent. Vérification faite le 2026-11-01, `_dmarc.gmail.com` annonce `p=none` —
ce n'est donc pas la politique DMARC de Gmail qui bloque, mais l'impossibilité
d'alignement. Pour des codes à six chiffres qui constituent l'unique porte d'entrée de
l'application, le risque n'est pas acceptable.

Montage retenu : `azzel.org` acquis chez IONOS — même fournisseur que le VPS, DNS
accessible. Expéditeur `contact@azzel.org` signé par Mailjet (CNAME DKIM + TXT SPF),
`Reply-To` pointant sur l'adresse Gmail de l'événement, qui reste la boîte humaine.
`_dmarc` en `p=none` au départ : passer en `p=reject` avant d'avoir lu le moindre
rapport reviendrait à se couper soi-même. Attention à n'avoir **qu'un seul**
enregistrement SPF TXT sur le domaine — si IONOS en pose un via un forfait mail, il
faut fusionner, pas empiler, sous peine de faire échouer les deux.

Le `.dz` passe par le NIC DZ (CERIST) : justificatifs et délais. Il peut être acquis
plus tard, en parallèle ; noter que `.env.example` référence déjà `runners.azzel.dz`.

Conséquence pratique restante :

- **Délivrabilité à éprouver sur chaque adresse du comité** avant d'annoncer l'URL. Un
  membre qui ne reçoit pas son code ne prend rien en main.
- **Mentionner le caractère fictif.** Les emails sortants (validation, refus, rappel
  J-7) partiront pour de vrai. Le gabarit de recette gagne une mention explicite
  « environnement de démonstration — données fictives » pour qu'un message égaré ne
  soit jamais pris pour une communication officielle.

---

## 4. Jeu de données fictif

Un script de seed, régénérable et idempotent, produit une **édition complète et
réaliste** pour que le comité arrive sur une application vivante plutôt que sur un
écran vide :

- une organisation et une édition datée, avec plusieurs épreuves ;
- une cinquantaine de coureurs répartis sur tous les stades du dossier — en attente,
  en cours de validation, validé, refusé — avec preuves de paiement déposées pour
  qu'il y ait réellement matière à valider ;
- le découpage en secteurs et les missions associées, avec des volontaires assignés ;
- de quoi exercer le chrono et les rapports.

Noms, adresses et numéros manifestement inventés — aucune ressemblance avec des
personnes réelles, et aucune adresse email sortante autre que celles de l'équipe.

Le script doit pouvoir **réinitialiser** l'environnement : le comité va expérimenter,
casser des choses, et devra pouvoir repartir d'un état propre sans intervention.

### Fait d'architecture découvert à la story 8.3 — la réinitialisation exige le rôle propriétaire

Le seed, lui, tourne sous le rôle applicatif (`DATABASE_URL`, GUC
`app.organisation_id` posé par `withOrg`) : AD-4 reste intact de bout en bout.

**La purge, non.** Les tables append-only du chrono et du tracking —
`terrain_evenement` (0025), `abandon` (0028), `annulation` (0029), `position`
(0030) — ont `UPDATE` et `DELETE` explicitement **révoqués** pour `azzel_app` ;
`resultats_visite` (0034) perd `DELETE`. C'est voulu et structurel : AD-8 (une
erreur s'annule, elle ne se réécrit pas) tient parce que le rôle applicatif ne
peut pas réécrire l'histoire. Conséquence directe : **aucune commande de
réinitialisation ne peut s'exécuter sous le rôle applicatif**, et
`pnpm -F @azzel/web seed:reset` tourne donc sous `DATABASE_OWNER_URL` — la
connexion directe, celle des migrations, jamais le pooler.

Deux conséquences pour le déploiement (story 8.4) :

1. `DATABASE_OWNER_URL` doit rester disponible à l'opérateur de la recette, pas
   seulement au moment des migrations.
2. La réinitialisation n'est pas, et ne doit pas devenir, une action exposée
   dans l'application : elle n'a pas le rôle pour, et ne doit pas l'avoir.
   Elle reste une commande, gardée par une autorisation explicite
   (`AZZEL_SEED_RESET=1`) — l'inspection du contenu de la base a été écartée,
   elle bloquerait une recette légitimement salie par le comité, précisément le
   moment où la réinitialisation sert.

`scripts/dev-db.sh reset` ne tient pas ce rôle : il supprime le conteneur et le
volume Docker, n'existe pas sur une base hébergée, et effacerait le schéma.

---

## 5. Séquencement

| # | Story | Dépend de |
| --- | --- | --- |
| 1 | Fabrique de connexion unique (`db/client.ts`, `prepare: false`, `max` par environnement) + bascule des dix modules ; provisionner Supabase, rôles, migrations, pooler transaction | — |
| 2 | `SupabaseProofStore` derrière l'interface `ProofStore`, sélection par configuration, tests | 1 |
| 3 | Script de seed « édition complète », régénérable et réinitialisable | 1 |
| 4 | Câblage Vercel : répertoire racine `apps/web`, variables d'environnement, `APP_URL` (`recette.azzel.org`), `AZZEL_ADMIN_EMAILS` (emails du comité), `SMTP_URL` Mailjet, vérification de délivrabilité | 1, 2, 3 |

Travaux hors dépôt, à mener en parallèle : acquisition d'`azzel.org` chez IONOS,
création du projet Supabase, pose des enregistrements DKIM/SPF Mailjet.

Les stories 1 et 2 ne sont pas du jetable : elles lèvent une dette annoncée depuis la
story 1.5 et resserviront en production quel que soit le socle retenu.

---

## 6. Ce qui reste ouvert

- **Le passage de la production sur Vercel** : à réexaminer après le premier dry-run,
  sur mesures réelles de latence et de disponibilité, pas sur principe. Le point dur
  reste le repli local du PC course le jour J (AD-2 : le serveur est source de vérité).
- **Si un flux SSE apparaît** pour la vitrine live, il devra rester en polling côté
  Vercel — le plafond de durée des fonctions le rend hostile aux connexions longues.
  Aucun SSE n'existe dans le code à ce jour.
- **La localisation des données** : sans objet tant que tout est fictif, à trancher
  avant toute donnée réelle.
