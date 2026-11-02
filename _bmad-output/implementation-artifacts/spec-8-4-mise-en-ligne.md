---
title: 'Story 8.4 — Mise en ligne de la recette et remise au comité'
type: 'chore'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c94f577932ce524b9f99b8b12671e0ba738aac46'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** l'environnement de recette a été déployé à la main, au fil d'une session de dépannage de plusieurs heures. Il fonctionne, mais rien n'est écrit : ni les réglages, ni les variables, ni les six impasses traversées. Personne — y compris celui qui l'a fait — ne saura refaire la manœuvre dans trois mois, et le comité n'a reçu aucune consigne de test.

**Approche :** consigner le déploiement sous forme de mode opératoire reproductible, documenter chaque piège avec son symptôme exact, et produire le document de recette que le comité déroulera. Aucun code n'est modifié : cette story écrit ce qui existe déjà.

## Boundaries & Constraints

**Always :**
- **Écrire pour quelqu'un qui n'a pas vécu la session.** Un symptôme sans sa cause ne sert à rien ; une cause sans son symptôme ne se retrouve pas quand on la rencontre.
- **Énoncer ce qui est cassé, en tête des limites connues.** Le téléchargement d'une preuve rend HTTP 500. La validation de dossier est l'un des parcours que le comité doit éprouver : le taire ferait remonter comme bogue un défaut déjà connu, et perdre la confiance du comité sur le reste.
- **Le document de recette suit la convention du projet** (`AGENTS.md`) : un module par story, préconditions, étapes numérotées concrètes, résultat attendu par étape, cases à cocher, tableau de synthèse final. Rédigé pour un testeur sans aucune connaissance du code. `scenarios-recette-epic-1.md` sert de gabarit de forme.

**Never :**
- Ne pas modifier de code applicatif. Cette story est documentaire.
- Ne pas prétendre clore l'épopée 8.
- Ne pas inventer un réglage ou une valeur : tout ce qui est écrit doit venir des faits consignés ci-dessous ou être vérifié dans le dépôt.
- Ne pas introduire de `vercel.json` : les réglages vivent dans le tableau de bord, et un fichier concurrent créerait deux sources de vérité.

## Faits établis — à reprendre, pas à redécouvrir

**Environnement.** Projet Supabase `dhxuqnikxivagvlhhrmp`, région `eu-west-1`. Pooler `aws-0-eu-west-1.pooler.supabase.com`. 35 migrations appliquées. Bucket `preuves`, privé. Projet Vercel servi sur `azzel-moulouls-projects.vercel.app`.

**Vérifié en production :** vitrine et résultats servis depuis la base ; connexion par code à six chiffres opérante ; promotion organisateur effective ; isolation multi-organisation constatée sur la base hébergée (sans le GUC `app.organisation_id` : zéro ligne ; avec : 50 coureurs, 22 validés, 6 refusés) ; 38 preuves dans le bucket, empreintes SHA-256 conformes à ce que la table `preuve` déclare ; aucun email du seed expédiable.

**Les six pièges, avec leur symptôme exact :**

1. **Auteur de commit non rattaché au compte GitHub** — build refusé, « commit author did not have contributing access ». Le plan Hobby n'autorise pas la collaboration sur dépôt privé. Correctif : déclarer l'adresse sur GitHub, ou committer avec l'adresse `noreply` du compte.
2. **Connexion directe Supabase en IPv6 seul** — `db.<ref>.supabase.co` ne résout aucune adresse IPv4. Correctif : passer par le pooler, transaction (6543) pour l'application, session (5432) pour les migrations.
3. **TLS obligatoire** — build en échec au prérendu : `(ESSLREQUIRED) SSL connection is required for user: azzel_app`. Correctif livré en code (`exigeTls`) : toute base non locale est jointe en TLS.
4. **Protection de déploiement Vercel** — toute URL redirige vers `vercel.com/sso-api`. Le comité aurait eu besoin d'un compte Vercel. Correctif : Settings → Deployment Protection → Vercel Authentication → Disabled. Tenable uniquement parce qu'aucune donnée réelle n'est en jeu.
5. **En-tête `apikey` requis par l'API Storage** — le jeton porteur seul donne `Invalid Compact JWS` ; dépôt, relecture et suppression échouent. Correctif livré en code.
6. **Clé publiable au lieu de la clé secrète** — le stockage répond « objet introuvable » et non « accès refusé », pour ne pas révéler le contenu d'un bucket privé. Toute panne de droits se présente donc comme une disparition de données. Correctif livré en code : la forme de la clé est refusée à la construction.

**Variables à poser sur Vercel** (Production ET Preview) : `DATABASE_URL` (rôle `azzel_app`, pooler 6543, `sslmode=require`), `SMTP_URL`, `APP_EMAIL_FROM` (l'adresse validée chez le fournisseur, sans quoi rien ne part), `AZZEL_ADMIN_EMAILS`, `APP_URL`, et les quatre `PROOF_STORAGE_*`.

**À ne surtout PAS poser sur Vercel** : `DATABASE_OWNER_URL` et `AZZEL_APP_PASSWORD` — le rôle propriétaire a `BYPASSRLS` et n'a aucun usage à l'exécution ; une `DATABASE_URL` utilisant le rôle `postgres` désactiverait l'isolation multi-organisation en silence.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|----------|--------------|----------------------|------------------|
| Reprise du mode opératoire | Quelqu'un redéploie depuis zéro | Chaque réglage et chaque variable sont nommés, aucun détour à réinventer | N/A |
| Rencontre d'un piège connu | Un symptôme des six se présente | Il se retrouve par son message d'erreur littéral | N/A |
| Recette par le comité | Un testeur sans connaissance du code | Il déroule les scénarios sans aide | N/A |
| Geste cassé | Le testeur ouvre une pièce jointe | La limite est annoncée avant qu'il la rencontre | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/scenarios-recette-epic-1.md` -- **gabarit de forme** du document de recette. Même structure, même ton.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- section « Point d'arrêt : preuves illisibles » : diagnostic et ordre de reprise, à référencer sans le recopier.
- `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md` -- décisions d'architecture de l'épopée ; à compléter, pas à réécrire.
- `.env.example` -- déjà documenté pour `PROOF_STORAGE_*` et `APP_EMAIL_FROM` ; vérifier qu'aucune variable de l'épopée n'y manque.
- `apps/web/src/db/client.ts` -- `exigeTls` ; `apps/web/src/modules/inscriptions/proof-store-objet.ts` -- `estClePubliable`, en-tête `apikey`. Sources des correctifs 3, 5 et 6.
- `AGENTS.md` -- convention du document de recette par épopée.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/deploiement-recette.md` -- mode opératoire reproductible : réglages Vercel, variables et leur environnement, ce qu'il ne faut pas poser, et les six pièges avec symptôme littéral, cause et correctif
- [x] `_bmad-output/implementation-artifacts/scenarios-recette-epic-8.md` -- scénarios de recette pour le comité, selon la convention du projet, limites connues en tête
- [x] `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md` -- compléter avec ce que le déploiement réel a appris et qui contredit ou précise la note
- [x] `.env.example` -- compléter toute variable de l'épopée qui y manquerait

**Acceptance Criteria:**
- Étant donné quelqu'un qui n'a pas vécu la session, quand il suit le mode opératoire, alors il dispose de chaque réglage et de chaque variable sans avoir à deviner.
- Étant donné l'un des six symptômes rencontré, quand on cherche son message d'erreur littéral dans le mode opératoire, alors on trouve sa cause et son correctif.
- Étant donné le document de recette, quand un testeur sans connaissance du code le déroule, alors il sait ce qu'il doit observer à chaque étape et quelles limites sont déjà connues.
- Étant donné l'état réel, quand on lit les documents produits, alors le défaut sur les preuves y figure comme ouvert, et l'épopée n'est pas annoncée close.

## Implementation Notes

**2026-11-02 — livraison documentaire, aucun code touché.**

- `deploiement-recette.md` (nouveau) : état constaté de l'environnement, base hébergée
  (pooler transaction 6543 / session 5432), stockage, réglages Vercel et tableau des
  variables avec leur environnement, tableau de ce qu'il ne faut **pas** poser, emails,
  les six pièges avec leur message littéral, vérification de bout en bout, limites
  connues. Le point d'arrêt sur les preuves est **référencé**, pas recopié.
- `scenarios-recette-epic-8.md` (nouveau) : convention `AGENTS.md` respectée — un module
  par story (S1 8.1 + S1-bis isolation, S2 8.2, S3 8.3, S4 8.4), préconditions, étapes
  numérotées, résultat attendu par étape, cases à cocher, tableau de synthèse. Le défaut
  sur le téléchargement des preuves est annoncé **en tête de document** et répété à
  l'étape 2.5 où le testeur le rencontre, marqué « écart connu, hors comptage ».
- `note-archi-winston-deploiement-vercel.md` : section 7 ajoutée, en correction et
  précision de l'existant (migrations par le pooler en mode session faute d'IPv4,
  `DATABASE_OWNER_URL` hors hébergeur, TLS imposé en code, en-tête `apikey` et forme de
  la clé, expéditeur validé, protection de déploiement à désactiver explicitement, pas
  de `vercel.json`, build servi ≠ dernier commit, état d'ouverture de l'épopée). Les
  sections 1 à 6 n'ont pas été réécrites.
- `.env.example` : aucune variable de l'épopée ne manquait. Ajouts de **comportement**
  non documentés jusqu'ici — TLS imposé par `exigeTls` quel que soit `sslmode`, mode
  session exigé pour les migrations, interdiction de poser `DATABASE_OWNER_URL` et
  `AZZEL_APP_PASSWORD` sur le déploiement, refus d'une clé de stockage publiable.

**Non fait, volontairement :** aucun `vercel.json` ; l'épopée 8 n'est pas déclarée close ;
`sprint-status.yaml` laissé en l'état (`8-4` reste `in-progress`).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm typecheck && AZZEL_REQUIRE_DB=1 pnpm test` -- attendu : inchangés, cette story ne touche pas au code
- `git diff --stat -- 'apps/' 'packages/'` -- attendu : aucune ligne

**Manual checks:**
- Chacun des six symptômes se retrouve dans le mode opératoire par son message d'erreur littéral.
- Le document de recette porte un tableau de synthèse et des cases à cocher, comme `scenarios-recette-epic-1.md`.
