# Déploiement de l'environnement de recette — mode opératoire

**Produit :** Azzel · **Épopée 8** (environnement de recette hébergé) · **Date :** 2026-11-02
**Objet :** refaire, depuis zéro, le déploiement de `apps/web` sur Vercel avec base
Postgres hébergée, stockage objet des preuves et envoi d'emails réel.

Ce document consigne un déploiement **réellement effectué**, pas un plan. Tout ce qui
y figure a été constaté. Les six pièges de la section 6 ont coûté plusieurs heures :
ils sont écrits avec leur **message d'erreur littéral**, pour qu'on les retrouve en
cherchant le texte affiché à l'écran plutôt qu'en devinant la cause.

> **Aucune donnée réelle de coureur sur cet environnement.** C'est la seule protection
> qui compte, et toute la posture ci-dessous (pas de protection d'hébergeur, URL non
> publiée) n'est tenable que grâce à elle. Si cette règle tombe, la décision
> d'hébergement est à rouvrir entièrement.

---

## 1. État constaté de l'environnement

| Élément | Valeur |
| --- | --- |
| Projet Supabase | `dhxuqnikxivagvlhhrmp`, région `eu-west-1` |
| Pooler | `aws-0-eu-west-1.pooler.supabase.com` |
| Migrations appliquées | 35 |
| Bucket de preuves | `preuves`, **privé** |
| Déploiement Vercel | servi sur `azzel-moulouls-projects.vercel.app` |
| Branche déployée | `main`, répertoire racine `apps/web` |

**Vérifié en production :**

- vitrine et résultats servis depuis la base hébergée ;
- connexion par code à six chiffres opérante ;
- promotion organisateur effective (`AZZEL_ADMIN_EMAILS`) ;
- **isolation multi-organisation constatée sur la base hébergée** : sans le GUC
  `app.organisation_id`, zéro ligne ; avec, 50 coureurs, 22 validés, 6 refusés ;
- 38 preuves présentes dans le bucket, empreintes SHA-256 conformes à ce que la table
  `preuve` déclare ;
- aucun email du jeu de données fictif n'est expédiable (domaine `seed.azzel.invalid`,
  lignes `email_outbox` en statut `cancelled`).

**Non résolu à ce jour :** le téléchargement d'une preuve depuis l'écran
d'administration rend **HTTP 500 `admin.internal_error`**. Diagnostic complet et ordre
de reprise : `deferred-work.md`, section « Point d'arrêt : preuves illisibles depuis
l'application déployée (2026-11-02) ». **L'épopée 8 n'est pas close.**

---

## 2. Base de données hébergée

1. Créer le projet Supabase (free tier : Postgres 500 Mo, storage 1 Go).
2. Récupérer **deux** chaînes de connexion distinctes, depuis l'onglet de connexion du
   projet :
   - **pooler, mode transaction, port 6543** — pour l'application (`DATABASE_URL`) ;
   - **pooler, mode session, port 5432** — pour les migrations (`DATABASE_OWNER_URL`,
     rôle propriétaire).
   Ne pas utiliser l'hôte `db.<ref>.supabase.co` : voir piège 2.
3. Créer le rôle applicatif `azzel_app` (migration 0008) et poser son mot de passe de
   façon cohérente avec `DATABASE_URL`.
4. Appliquer les migrations avec le rôle propriétaire, depuis un poste :

   ```bash
   DATABASE_OWNER_URL='postgres://postgres.<ref>:<mdp>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
     pnpm -F @azzel/web db:migrate
   ```

5. Peupler le jeu de données fictif (story 8.3), sous le **rôle applicatif** :

   ```bash
   DATABASE_URL='…6543…' PROOF_STORAGE_DRIVER=objet PROOF_STORAGE_URL=… PROOF_STORAGE_KEY=… \
     pnpm -F @azzel/web seed
   ```

   Le seed est idempotent : une seconde exécution ne crée rien.

**Réinitialisation** (le comité va casser des choses) :

```bash
AZZEL_SEED_RESET=1 DATABASE_OWNER_URL='…5432…' pnpm -F @azzel/web seed:reset
```

Elle **exige le rôle propriétaire** : `azzel_app` n'a ni `UPDATE` ni `DELETE` sur les
tables append-only du chrono (`terrain_evenement`, `abandon`, `annulation`,
`position`), c'est structurel et voulu (AD-8). Sans `AZZEL_SEED_RESET=1`, la commande
refuse et nomme la variable. Ce n'est **pas** une action exposée dans l'application, et
ne doit pas le devenir. `scripts/dev-db.sh reset` ne tient pas ce rôle : il détruit un
conteneur Docker qui n'existe pas ici.

---

## 3. Stockage des preuves

1. Créer le bucket `preuves`, **privé**. Les preuves sont des données personnelles : elles
   transitent par le backend, jamais par une URL publique ni signée.
2. Récupérer la **clé secrète** du projet (pas la clé publiable — voir piège 6).
3. Poser les quatre `PROOF_STORAGE_*` (section 4).

---

## 4. Réglages Vercel

**Project Settings :**

| Réglage | Valeur |
| --- | --- |
| Root Directory | `apps/web` |
| Production Branch | `main` |
| Deployment Protection → Vercel Authentication | **Disabled** (voir piège 4) |

> **`apps/web/vercel.json` ne porte que le cron** (section 5 bis) : Vercel ne sait
> déclarer un cron que dans ce fichier. Tous les autres réglages vivent dans le tableau
> de bord, et n'en sortent pas — un fichier qui les reprendrait créerait deux sources de
> vérité qui divergeront.

**Variables d'environnement — à poser sur Production ET Preview :**

| Variable | Contenu | Remarque |
| --- | --- | --- |
| `DATABASE_URL` | rôle `azzel_app`, pooler **6543**, `sslmode=require` | jamais le rôle `postgres` |
| `SMTP_URL` | `smtp://utilisateur:motdepasse@hote:port` | expéditeur qui délivre réellement (Mailjet) |
| `APP_EMAIL_FROM` | l'adresse **validée chez le fournisseur** | sans quoi **rien ne part**, y compris les codes de connexion |
| `AZZEL_ADMIN_EMAILS` | adresses du comité, séparées par des virgules | elles arrivent organisateurs dès la première connexion |
| `APP_URL` | l'URL de recette | les liens des emails doivent y mener, pas vers `localhost` |
| `PROOF_STORAGE_DRIVER` | `objet` | toute autre valeur est refusée au démarrage |
| `PROOF_STORAGE_URL` | `https://<ref>.supabase.co/storage/v1` | l'URL du projet seule suffit, le suffixe est ajouté |
| `PROOF_STORAGE_KEY` | la clé **secrète** du projet | ⚠️ jamais commitée, jamais exposée au navigateur |
| `PROOF_STORAGE_BUCKET` | `preuves` | défaut si absente |
| `CRON_SECRET` | `openssl rand -hex 32` (32 caractères minimum) | ⚠️ secret ; garde de la route de balayage des échéances (section 5 bis) |

**Poser sur Preview autant que sur Production.** Vercel sert le dernier build réussi :
une variable posée sur un seul environnement produit une panne qui semble aléatoire
selon l'URL consultée.

**À ne surtout PAS poser sur Vercel :**

| Variable | Pourquoi |
| --- | --- |
| `DATABASE_OWNER_URL` | le rôle propriétaire a `BYPASSRLS` et n'a **aucun usage à l'exécution** ; il ne sert qu'aux migrations et à `seed:reset`, lancés depuis un poste |
| `AZZEL_APP_PASSWORD` | ne sert qu'à la création du rôle, en local |

> Une `DATABASE_URL` utilisant le rôle `postgres` **briserait l'isolation
> multi-organisation**, ce rôle ayant `BYPASSRLS`. C'est la panne la plus grave que ce
> déploiement puisse produire.
>
> Elle ne se manifesterait pas partout de la même façon, et c'est ce qui la rend
> traître. Six stores — `inscriptions`, `iam`, `sponsors`, `contenus`,
> `retour-images`, `outbox` — portent la garde de rôle applicatif et **refusent de
> servir** en production quand la connexion n'est pas `azzel_app` : on verrait une
> erreur franche. Mais `missions`, `chrono`, `rapports` et `tracking` n'ont pas cette
> garde — écart constaté et consigné dans `deferred-work.md` — et serviraient donc
> leurs données **sans cloisonnement et sans le moindre signal**.
>
> Autrement dit : l'application aurait l'air à moitié cassée, et c'est la moitié qui
> fonctionne encore qu'il faudrait craindre.

---

## 5. Emails

L'expéditeur doit **délivrer réellement** : un collecteur type Mailpit ne convient pas
ici — il sert au testeur qui vérifie qu'un message est parti, pas au membre du comité
qui doit le recevoir.

- `APP_EMAIL_FROM` porte l'adresse **validée chez le fournisseur d'envoi**. Les
  fournisseurs refusent un expéditeur qu'ils n'ont pas validé, et les codes à six
  chiffres sont l'unique porte d'entrée de l'application.
- Alignement SPF/DKIM sur le domaine du projet, `Reply-To` vers la boîte humaine de
  l'événement, `_dmarc` en `p=none` au départ.
- **Un seul enregistrement SPF TXT** sur le domaine : deux enregistrements font échouer
  les deux. Si l'hébergeur DNS en pose un via un forfait mail, il faut **fusionner**,
  pas empiler.
- **Délivrabilité à éprouver adresse par adresse** avant d'annoncer l'URL : un membre
  qui ne reçoit pas son code ne prend rien en main.
- Les emails sortants (validation, refus, rappel J-7) partent pour de vrai : ils portent
  la mention « environnement de démonstration — données fictives » pour qu'un message
  égaré ne soit jamais pris pour une communication officielle.

---

## 5 bis. Échéances de preuve : balayage automatique

Un dossier sans preuve de paiement reçoit un rappel la veille de son échéance, puis
**expire** à l'échéance, ce qui rend sa place. Rien de cela n'arrive si personne ne
lance le balayage. En production, la crontab du VPS lance `inscriptions:echeances`
(voir `README.md`). La recette n'a pas de crontab : le balayage y est exposé par la
route `GET /api/cron/echeances`, que deux déclencheurs appellent.

| Déclencheur | Fréquence | Rôle |
| --- | --- | --- |
| GitHub Actions — `.github/workflows/echeances.yml` | toutes les heures, à hh:17 | déclencheur principal |
| Cron Vercel — `apps/web/vercel.json` | une fois par jour, 06:00 UTC (07:00 à Alger) | filet de sécurité ; le plan Hobby ne permet pas plus d'un passage par jour |

Le balayage est **idempotent** : que les deux déclencheurs se chevauchent ou qu'on
relance à la main, un second passage ne rappelle ni n'expire rien de plus.

C'est aussi, en recette, le **seul chemin de reprise automatique de la file d'emails** :
un email en échec au moment de l'événement (validation, refus…) n'est renvoyé que par
ce balayage — ou par `emails:send` lancé à la main depuis un poste. Chaque appel envoie
au plus **30 emails** (limite de durée de la fonction) ; le reste part au passage
suivant.

**Accès.** La route exige `Authorization: Bearer <CRON_SECRET>`, l'en-tête qu'envoie
Vercel Cron dès que la variable `CRON_SECRET` est posée sur le projet. Le workflow
envoie le même. Le schéma `Bearer` est lu sans égard à la casse, et les blancs
autour du secret (retour à la ligne collé avec la valeur) sont ignorés des deux côtés.

| Réponse | Sens |
| --- | --- |
| `200` + bilan | balayage fait, tous les emails tentés sont partis |
| `401 cron.unauthorized` | en-tête absent ou secret faux ; rien n'est fait |
| `502 cron.emails_failed` | balayage fait (bilan joint), mais au moins un email n'est pas parti : il reste dans la file, repris plus tard. Vérifier `SMTP_URL` et `APP_EMAIL_FROM` |
| `503 cron.not_configured` | `CRON_SECRET` absente, vide ou de moins de 32 caractères sur Vercel ; rien n'est fait, la route ne s'ouvre jamais sans secret |
| `503 cron.db_not_configured` | `DATABASE_URL` absente sur Vercel ; rien n'est fait. Panne de configuration : relancer ne sert à rien, il faut poser la variable et redéployer |
| `503 cron.db_unavailable` | base injoignable ; relancer, sans risque |
| `503 cron.db_misconfigured` | `DATABASE_URL` ne pointe pas sur le rôle `azzel_app` |
| `503 cron.outbox_unavailable` | rappels et expirations faits (bilan joint), mais la file d'emails n'a pas pu être lue, en tout (« aucun email n'est parti ») ou en partie (« partiellement injoignable ») ; le passage suivant enverra |
| `500 cron.internal_error` | erreur inattendue ; consulter les journaux de la fonction sur Vercel, puis relancer |

### Mise en place

1. Générer le secret : `openssl rand -hex 32` (64 caractères ; la route refuse un secret
   de moins de 32).
2. **Vercel** → Settings → Environment Variables : poser `CRON_SECRET` sur Production
   ET Preview (section 4), puis **redéployer** : une variable n'est lue que par les
   déploiements construits après sa pose.
3. **GitHub** → Settings → Secrets and variables → Actions :
   - onglet **Secrets** → New repository secret : `CRON_SECRET`, la **même** valeur ;
   - onglet **Variables** → New repository variable (une **variable**, pas un secret :
     l'URL n'a rien de confidentiel et reste ainsi lisible dans les journaux) :
     `AZZEL_ECHEANCES_URL`, l'URL complète de la route sur le déploiement servi,
     `https://azzel-moulouls-projects.vercel.app/api/cron/echeances`.
4. **Vercel** → Settings → Cron Jobs : le cron `/api/cron/echeances` apparaît après le
   premier déploiement de production qui porte `apps/web/vercel.json`.

### Test manuel par `curl`

```bash
read -rs CRON_SECRET && export CRON_SECRET   # saisi sans écho, absent de l'historique
URL=https://azzel-moulouls-projects.vercel.app/api/cron/echeances

curl -sS -i -H "Authorization: Bearer $CRON_SECRET" "$URL"   # attendu : HTTP 200 + bilan
curl -sS -i -H "Authorization: Bearer $CRON_SECRET" "$URL"   # relancé aussitôt : rappels, expirées, enfilés à zéro
curl -sS -i "$URL"                                           # attendu : HTTP 401 cron.unauthorized
```

Bilan rendu par un passage (ici : 1 rappel, 4 dossiers expirés dont 2 déjà avisés,
2 emails qui attendaient déjà dans la file) :

```json
{"ok":true,"bilan":{"rappels":1,"expirees":4,"emailsEnfiles":3,"emailsEnvoyes":5,"emailsEnEchec":0}}
```

- `rappels` : emails de rappel enfilés (échéance dans les 24 heures) ;
- `expirees` : dossiers passés en « expirée », autant de places rendues ;
- `emailsEnfiles` : emails enfilés par ce passage (rappels + avis d'expiration) ;
- `emailsEnvoyes`, `emailsEnEchec` : passage de la file d'envoi. Il traite **toute** la
  file en attente (30 au plus), pas seulement ce passage ; un email en échec reste dans
  la file et sera repris.

Relancé aussitôt, seuls `rappels`, `expirees` et `emailsEnfiles` retombent à zéro.
`emailsEnvoyes` et `emailsEnEchec` reflètent l'état de la file à cet instant : ils
peuvent rester non nuls (reliquat au-delà de 30, email arrivé entre-temps, ligne en
échec sortie de son délai d'attente).

### Test par « Run workflow »

GitHub → Actions → **Échéances de preuve (recette)** → Run workflow, sur `main`.

- **Vert** : l'étape « Appel de la route de balayage » imprime le bilan JSON puis
  `Balayage fait (HTTP 200).`
- **Rouge** : l'étape imprime l'enveloppe d'erreur (code `cron.*`, tableau ci-dessus)
  et `Réponse HTTP <statut> : balayage non fait.` Le message « Secret de dépôt
  CRON_SECRET et variable de dépôt AZZEL_ECHEANCES_URL requis » signale un réglage de
  dépôt manquant. Une réponse `3xx` est aussi en rouge : c'est le signe d'une
  protection de déploiement réactivée (piège 4). Un `502 cron.emails_failed` met le
  workflow en rouge alors que le balayage est fait : c'est l'envoi d'emails qui est
  cassé.

Contrôle en base, après un passage vert — plus aucun dossier échu sans preuve :

```sql
BEGIN;
  SELECT set_config('app.organisation_id', '<id org>', true);
  SELECT count(*) FROM coureur AS c
  WHERE c.status = 'en constitution'
    AND c.preuve_due_at < now()
    AND NOT EXISTS (SELECT 1 FROM preuve AS p WHERE p.coureur_id = c.id AND p.status = 'active');
  -- attendu : 0
ROLLBACK;
```

### À savoir

- Le bouton « Run workflow » et la planification horaire n'existent qu'une fois le
  workflow **sur la branche par défaut** (`main`) : GitHub ne planifie que depuis elle.
- GitHub **retarde** les exécutions planifiées quand ses runners sont chargés, parfois
  de plusieurs dizaines de minutes ; le cron Vercel quotidien rattrape un trou.
- Le cron Vercel du plan Hobby part à une minute **quelconque** de l'heure prévue
  (06:00–06:59 UTC), et seulement sur le déploiement de production.
- Dépôt privé : chaque exécution décompte au moins une minute du quota GitHub Actions,
  soit environ 720 minutes par mois pour 24 passages par jour.
- Changer le secret : le modifier aux **deux** endroits (Vercel et le secret de dépôt
  GitHub), puis redéployer Vercel.

---

## 6. Les six pièges, avec leur symptôme exact

### Piège 1 — Auteur de commit non rattaché au compte GitHub

> **Symptôme :** le build est refusé avec
> `commit author did not have contributing access`.

**Cause :** le plan Hobby n'autorise pas la collaboration sur un dépôt privé. Si
l'adresse email de l'auteur du commit n'est pas déclarée sur le compte GitHub
propriétaire, Vercel considère le commit comme venant d'un tiers.

**Correctif :** déclarer l'adresse sur GitHub, **ou** committer avec l'adresse
`noreply` du compte.

### Piège 2 — Connexion directe Supabase en IPv6 seul

> **Symptôme :** `db.<ref>.supabase.co` ne résout aucune adresse IPv4 ; la connexion
> échoue depuis un réseau sans IPv6.

**Cause :** la connexion directe n'est publiée qu'en IPv6.

**Correctif :** passer par le **pooler** — `aws-0-eu-west-1.pooler.supabase.com` —
en mode **transaction (6543)** pour l'application et en mode **session (5432)** pour
les migrations.

### Piège 3 — TLS obligatoire

> **Symptôme :** build en échec au prérendu avec
> `(ESSLREQUIRED) SSL connection is required for user: azzel_app`.

**Cause :** la base hébergée refuse les connexions en clair ; aucun `sslmode` n'était
imposé côté code.

**Correctif — livré en code :** `exigeTls` (`apps/web/src/db/client.ts`) pose
`ssl: 'require'` dès que l'hôte n'est pas local (`localhost`, `127.0.0.1`, `::1`,
`0.0.0.0`), et chiffre aussi quand l'URL est illisible : le repli sûr n'est jamais le
clair. On ne s'en remet ni au serveur, ni à un paramètre d'URL que quelqu'un doit
penser à écrire. Garder tout de même `sslmode=require` dans `DATABASE_URL`, les deux
ne se contredisent pas.

### Piège 4 — Protection de déploiement Vercel

> **Symptôme :** toute URL du déploiement redirige vers `vercel.com/sso-api`.

**Cause :** la protection de déploiement est active par défaut. Le comité aurait eu
besoin d'un compte Vercel — et aurait contourné exactement le parcours d'authentification
qu'il doit éprouver.

**Correctif :** Settings → Deployment Protection → Vercel Authentication → **Disabled**.
Tenable **uniquement** parce qu'aucune donnée réelle n'est en jeu : la confidentialité
repose alors sur le code à six chiffres et sur une URL non publiée, partagée
nominativement.

### Piège 5 — En-tête `apikey` requis par l'API Storage

> **Symptôme :** `Invalid Compact JWS`. Dépôt, relecture et suppression échouent toutes.

**Cause :** le jeton porteur seul ne suffit pas. La passerelle refuse la requête avant
même d'atteindre le stockage, parce qu'elle tente de lire la clé comme un JWT ; c'est
l'en-tête `apikey` qui l'identifie comme une clé de projet.

**Correctif — livré en code :** `ObjetProofStore.enTetes()`
(`apps/web/src/modules/inscriptions/proof-store-objet.ts`) envoie
`authorization: Bearer <clé>` **et** `apikey: <clé>` sur chaque appel. Constaté contre
l'API réelle le 2026-11-02.

### Piège 6 — Clé publiable au lieu de la clé secrète

> **Symptôme :** le stockage répond **« objet introuvable »**, et non « accès refusé ».
> Les preuves semblent avoir disparu.

**Cause :** une clé publiable (préfixe `sb_publishable_`, ou JWT portant le rôle `anon`)
n'a aucun droit sur un bucket privé — mais le stockage refuse de révéler le contenu
d'un bucket privé, et répond donc par une absence. **Toute panne de droits se présente
comme une disparition de données.** C'est ce qui a fait chercher au mauvais endroit
pendant des heures.

**Correctif — livré en code :** `estClePubliable`
(`apps/web/src/modules/inscriptions/proof-store-objet.ts`) refuse la **forme** de la clé
à la construction, là où elle est encore lisible, et lève
`ObjetProofStoreConfigError` en nommant `PROOF_STORAGE_KEY` :
« clé publiable fournie — elle est destinée au navigateur et ne peut pas lire un bucket
privé ; utilisez la clé secrète du projet ».

### Piège de méthode, hors liste — le déploiement servi n'est pas celui qu'on croit

Plusieurs builds ont échoué pendant la session, et **Vercel continue de servir le
dernier build réussi**. On a donc diagnostiqué du code périmé pendant des heures en
croyant éprouver le correctif qu'on venait de pousser. Avant toute conclusion :
vérifier que le déploiement servi porte bien le commit attendu.

---

## 7. Vérification de bout en bout

À dérouler dans cet ordre, avant d'annoncer l'URL au comité.

1. **Le déploiement servi porte le commit attendu** (section 6, piège de méthode).
2. **La vitrine répond** et affiche des contenus venant de la base.
3. **Le rôle applicatif est bien celui qui sert** — l'isolation tient :

   ```sql
   SELECT count(*) FROM coureur;                       -- attendu : 0 (pas de GUC)
   BEGIN;
     SELECT set_config('app.organisation_id', '<id org>', true);
     SELECT count(*) FROM coureur;                     -- attendu : 50
   ROLLBACK;
   ```

4. **Connexion par code** sur une adresse réelle du comité : réception en moins d'une
   minute, hors dossier indésirables.
5. **Promotion organisateur** : l'adresse de `AZZEL_ADMIN_EMAILS` voit « Administration ».
6. **Stockage des preuves** : dépôt, relecture, suppression, suppression répétée, puis
   **relecture après redéploiement** — c'est ce dernier point qui distingue le stockage
   objet du disque local.
7. **Délivrabilité adresse par adresse**, pour chaque membre du comité.
8. **Plafonds du free tier** : Postgres 500 Mo, storage 1 Go. Une preuve pèse au plus
   300 Ko ; le jeu de données en dépose 38.
9. **Balayage des échéances** : « Run workflow » au vert, puis relancé aussitôt avec
   `rappels`, `expirees` et `emailsEnfiles` à zéro (section 5 bis).

---

## 8. Limites connues à la date de ce document

- **Téléchargement d'une preuve : HTTP 500 `admin.internal_error`.** Ouvert.
  Voir `deferred-work.md`, section « Point d'arrêt : preuves illisibles depuis
  l'application déployée (2026-11-02) » — ce qui est déjà prouvé et à ne pas refaire,
  les trois hypothèses restantes, et l'ordre de reprise.
- **L'épopée 8 n'est pas close** tant que ce défaut tient : la validation de dossier est
  l'un des parcours que le comité doit éprouver.

## Références

- `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md` — décisions d'architecture.
- `_bmad-output/implementation-artifacts/scenarios-recette-epic-8.md` — scénarios de recette pour le comité.
- `_bmad-output/implementation-artifacts/deferred-work.md` — point d'arrêt sur les preuves.
- `.env.example` — description de chaque variable.
