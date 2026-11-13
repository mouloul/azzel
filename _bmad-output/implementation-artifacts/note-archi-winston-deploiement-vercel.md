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

---

## 7. Ce que le déploiement réel a appris (2026-11-02, story 8.4)

Cette section **corrige** la note là où la mise en ligne l'a contredite, et la précise
là où elle était silencieuse. Le mode opératoire complet, avec les messages d'erreur
littéraux, vit dans `deploiement-recette.md` ; ce qui suit n'en retient que ce qui
touche aux décisions d'architecture.

### 7.1 Les migrations ne passent pas par la connexion directe — elles ne le peuvent pas

La note affirmait (§2 V1, §5) que les migrations tournent sur la **connexion directe**
(port 5432), « pas sur le pooler ». **C'est inapplicable en l'état :**
`db.<ref>.supabase.co` ne résout **aucune adresse IPv4**, et la connexion échoue depuis
un réseau sans IPv6.

Forme réellement retenue : **tout passe par le pooler**, en distinguant les modes —
**transaction (6543)** pour l'application, **session (5432)** pour les migrations et
pour `seed:reset`. Le mode session rétablit ce que les migrations exigent (requêtes
préparées, objets de session) ; l'intention de la note est donc préservée, c'est
l'hôte qui change, pas la règle.

### 7.2 `DATABASE_OWNER_URL` ne doit pas être posée sur l'hébergeur

Le §5 la listait parmi les variables du câblage Vercel, et le §4 demandait qu'elle
reste « disponible à l'opérateur ». À préciser : **disponible depuis un poste**, jamais
posée dans les variables du déploiement. Le rôle propriétaire a `BYPASSRLS` et n'a
**aucun usage à l'exécution** ; une `DATABASE_URL` utilisant le rôle `postgres`
désactiverait l'isolation multi-organisation **en silence**, sans erreur ni symptôme.
C'est la seule panne possible de ce déploiement qui ne se voit pas. `AZZEL_APP_PASSWORD`
est dans le même cas.

Inversement, deux variables manquaient à la liste du §5 : **`APP_EMAIL_FROM`** (voir
7.5) et les quatre **`PROOF_STORAGE_*`**.

### 7.3 Le TLS ne peut pas être laissé à la configuration

Non anticipé par la note : la base hébergée refuse les connexions en clair — `build` en
échec au prérendu sur `SSL connection is required for user: azzel_app`. Un `sslmode` dans
l'URL n'est pas une garantie : il dépend de quelqu'un qui pense à l'écrire, et d'autres
hébergeurs acceptent le clair **en silence**, ce qui est pire.

Décision prise en conséquence : `exigeTls` (`apps/web/src/db/client.ts`) impose
`ssl: 'require'` dès que l'hôte n'est pas local, et chiffre aussi lorsque l'URL est
illisible. Le repli sûr n'est jamais le clair, et la règle ne se contourne pas par
configuration.

### 7.4 L'API Storage exige l'en-tête `apikey`, en plus du porteur

Le §2 V2 décrivait trois routes « authentifiées en `Bearer` ». **Insuffisant :** le jeton
porteur seul donne `Invalid Compact JWS` — la passerelle tente de lire la clé comme un
JWT et refuse avant d'atteindre le stockage. L'en-tête `apikey` est ce qui l'identifie
comme une clé de projet. Dépôt, relecture et suppression échouaient toutes.

**Et le choix de la clé est un point d'architecture, pas un réglage.** Une clé publiable
n'a aucun droit sur un bucket privé, mais le stockage ne répond pas « accès refusé » : il
répond « objet introuvable », pour ne pas révéler le contenu du bucket. **Toute panne de
droits se présente donc comme une disparition de données**, et c'est ce qui a fait
chercher au mauvais endroit pendant des heures. D'où la garde `estClePubliable`, qui
refuse la **forme** de la clé à la construction, là où elle est encore lisible.

### 7.5 L'expéditeur validé est un prérequis au même titre que le domaine

Le §3 traitait l'alignement SPF/DKIM. Il manquait le point en amont : les fournisseurs
d'envoi **refusent un expéditeur qu'ils n'ont pas validé**. Sur un environnement dont le
domaine n'est pas le nôtre, il faut poser dans `APP_EMAIL_FROM` l'adresse effectivement
validée chez le fournisseur — **sans quoi rien ne part, y compris les codes de connexion,
seule porte d'entrée de l'application**.

### 7.6 L'absence de protection d'hébergeur est un réglage à désactiver, pas un défaut

Le §1 posait « pas de protection au niveau de l'hébergeur » comme une décision. En
pratique la protection est **active par défaut** : toute URL redirigeait vers
`vercel.com/sso-api`. Elle se retire explicitement (Settings → Deployment Protection →
Vercel Authentication → Disabled). À reconduire sur tout nouveau projet, et à ne pas
confondre avec un oubli de configuration.

Dans le même registre, non anticipé : sur un dépôt privé en plan Hobby, un commit dont
l'auteur n'est pas rattaché au compte fait **refuser le build**
(`commit author did not have contributing access`).

### 7.7 Pas de `vercel.json`

Les réglages (répertoire racine, branche, protection, variables) vivent dans le tableau
de bord. Y ajouter un fichier au dépôt créerait **deux sources de vérité** qui
divergeront. Décision prise à la mise en ligne, à tenir.

> **Amendement du 13/11/2026 (décision PO : cron quotidien de recette).**
> `apps/web/vercel.json` existe désormais et ne porte **que** la clé `crons` — le cron
> quotidien de `/api/cron/echeances`, que Vercel ne sait déclarer que dans ce fichier.
> Tous les autres réglages restent dans le tableau de bord. Voir
> `deploiement-recette.md`, section 5 bis.

### 7.8 Piège de méthode : le déploiement servi n'est pas forcément le dernier commit

Plusieurs builds ont échoué pendant la session, et l'hébergeur **continue de servir le
dernier build réussi**. On a donc diagnostiqué du code périmé en croyant éprouver un
correctif qu'on venait de pousser. Toute observation sur l'environnement hébergé doit
commencer par vérifier le commit réellement servi.

### 7.9 État à la clôture de la story 8.4 — l'épopée reste ouverte

Vérifié en production : vitrine et résultats servis depuis la base ; connexion par code ;
promotion organisateur ; **isolation multi-organisation constatée sur la base hébergée**
(sans GUC : zéro ligne ; avec : 50 coureurs, 22 validés, 6 refusés) ; 38 preuves dans le
bucket avec empreintes SHA-256 conformes ; aucun email du seed expédiable.

**Non résolu :** le téléchargement d'une preuve depuis l'administration rend
`admin.internal_error` (HTTP 500). Le reste à faire du §2 V2 — point 3, « vérifier contre
le stockage réel » — n'est donc **pas** soldé pour la relecture par l'application.
Diagnostic et ordre de reprise : `deferred-work.md`, section « Point d'arrêt : preuves
illisibles depuis l'application déployée (2026-11-02) ». **L'épopée 8 n'est pas close.**
