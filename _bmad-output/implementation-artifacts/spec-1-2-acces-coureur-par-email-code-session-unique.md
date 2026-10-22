---
title: 'Story 1.2 — Accès coureur par email + code, session unique'
type: 'feature'
created: '2026-10-20'
status: 'done'
review_loop_iteration: 0
baseline_revision: '91d7f7c'
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Personne ne peut encore entrer dans Azzel : le coureur n'a aucun accès, et l'invariant AD-5 (session interactive unique par compte, tous rôles) n'existe pas.

**Approach:** Module `iam` dans apps/web : parcours connexion email → code à 6 chiffres (expiration 10 min, limitation de rythme), compte créé seulement à la vérification réussie, sessions maison en base révoquées à chaque nouvelle connexion (cookie httpOnly). SMTP configurable ; sans SMTP configuré, le code est journalisé côté serveur (dev).

## Boundaries & Constraints

**Always:**
- Code à 6 chiffres, hashé (SHA-256) en base, usage unique, expiration 10 min, max 5 tentatives ; renvoi limité (3 demandes / 10 min par email) + compte à rebours 60 s côté UI.
- Aucun compte créé tant que le code n'est pas vérifié avec succès ; réponse identique que l'email soit connu ou non (anti-énumération).
- Toute connexion réussie révoque toutes les sessions interactives actives du compte avant d'en créer une nouvelle (AD-5) ; cookie httpOnly sameSite=lax, 30 j.
- Saisie UX-DR-19 : champ unique `inputmode="numeric"` + `autocomplete="one-time-code"`, collage autorisé, validité affichée (« valable 10 minutes »).
- Erreurs via enveloppe d'erreur `shared` (message + action, jamais de code brut) ; UI française, tokens Vert Djurdjura, accessible (focus, aria-live sur erreurs).
- Tables porteuses de `organisation_id` (ER : ORGANISATION → COMPTE) ; horodatages ISO 8601 UTC stockés.

**Never:**
- Pas de Supabase Auth (convention : code généré en interne) ; pas de JWT côté client.
- Pas de rôles/admin ni invitations volontaires (stories suivantes) ; pas de jeton d'appareil (AD-5 aval, module sync).
- Pas d'envoi réel de mail sans SMTP configuré ; jamais le code dans une réponse HTTP.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Premier accès | Email valide + code correct | Compte créé, session cookie posée, redirigé vers l'espace coureur | No error expected |
| Code erroné | Email + code faux (< 5 tentatives) | Message « code erroné ou expiré » + action renvoyer ; aucun compte créé | 400 enveloppe |
| Code erroné ×5 | 5 tentatives échouées | Code invalidé, nouveau code requis | 400 enveloppe |
| Code expiré | Vérification après 10 min | Refus, aucun compte créé | 400 enveloppe |
| Renvoi trop rapide | 4e demande < 10 min | Refus côté serveur (429) + compte à rebours UI | 429 enveloppe |
| Session unique | Connexion réussie sur 2e appareil | 1re session révoquée : requête authentifiée suivante → 401 | 401 enveloppe |
| DB indisponible | DATABASE_URL absente/injoignable | 503 « connexion indisponible » + action | 503 enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/app/layout.tsx`, `src/lib/theme.ts`, `src/components/theme-toggle.tsx` — réutiliser : header, tokens CSS, bascule sombre ; NE PAS dupliquer.
- `packages/shared/src/error-envelope.ts` — enveloppe d'erreur v1 à employer telle quelle.
- `packages/shared/src/tokens.ts` — source unique des styles (bouton action pill, cartes).
- `vitest.config.ts` — inclut shared + apps/web/src ; y ajouter les futurs tests iam.
- `pnpm-lock.yaml` — React 19.3.x unique (overrides) : toute nouvelle dépendance doit s'y conformer.
- Contexte épopée : `_bmad-output/implementation-artifacts/epic-1-context.md` (conventions auth, séquence).
- Environnement : Docker dispo (conteneur postgres:17 existant NE PAS TOUCHER ; créer un conteneur dédié `azzel-postgres` port 54329) ; aucun `.env` à ce jour.

## Tasks & Acceptance

**Execution:**
- `scripts/dev-db.sh` + `.env.example` -- démarrer/arrêter un Postgres 17 dédié (docker, port 54329, volume nommé) + documenter DATABASE_URL/SMTP_URL ; créer `.env` local (gitignoré).
- `apps/web/src/modules/iam/migrations/0001_iam.sql` + `apps/web/src/modules/iam/migrate.ts` -- tables `organisation` (seed slug `ait-aissi`), `account`, `login_code` (sans FK compte, colonne email), `session` + table `schema_migrations` ; runner idempotent exposable via `pnpm -F @azzel/web db:migrate`.
- `apps/web/src/modules/iam/store.ts` -- accès données : demandes de code (rate limit), consommation (atomique : tentative, expiration, invalidation), comptes (find-or-create à la vérification), sessions (création, révocation massive, lookup par token_hash).
- `apps/web/src/modules/iam/service.ts` + `email.ts` -- orchestration : génération 6 chiffres crypto, SHA-256, envoi (nodemailer si SMTP_URL, sinon journal serveur), vérification → révoquer sessions puis créer ; transport French (« Ton code Azzel : 123456 — valable 10 minutes. »).
- `apps/web/src/app/api/auth/code/route.ts`, `verify/route.ts`, `logout/route.ts`, `session/route.ts` -- routes POST/GET minimates, cookies, enveloppes d'erreur (400/401/429/503).
- `apps/web/src/app/connexion/page.tsx` + `src/app/espace-coureur/page.tsx` -- parcours 2 étapes (email → code, renvoi 60 s, collage autorisé) ; espace coureur : email connecté, déconnexion, mention session unique.
- `apps/web/src/modules/iam/*.test.ts` + `vitest.config.ts` -- tests unitaires (génération/hachage/normalisation email) + intégration contre Postgres réel (base `azzel_test` recréée, migrations appliquées) couvrant chaque ligne de la matrice ; skip propre si DATABASE_URL absente.
- `package.json` (web) -- deps `postgres`, `nodemailer`, `@types/nodemailer`.

**Acceptance Criteria:**
- Given un email jamais utilisé, when je demande un code puis le saisis correctement, then un compte existe en base, un cookie session httpOnly est posé et l'espace coureur affiche l'email.
- Given une session active, when le même email se connecte depuis ailleurs, then la première session est révoquée (requête suivante 401) et la nouvelle fonctionne.
- Given un code erroné ou expiré, when je tente de vérifier, then aucun compte n'est créé et le message affiche l'action à faire.
- Given 3 codes déjà demandés en moins de 10 minutes, when je demande un 4e, then le serveur refuse (429) et l'UI affiche le compte à rebours.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Module `iam` complet dans apps/web : parcours email → code 6 chiffres (expiration 10 min, 5 tentatives max, rate-limit 3/10 min par email + plafond global horaire, advisory lock anti-TOCTOU), compte créé uniquement à la vérification réussie, sessions maison en Postgres révoquées à chaque nouvelle connexion (AD-5), cookie httpOnly 30 j, 4 routes API, page /connexion (UX-DR-19 : inputmode numeric, one-time-code, collage, validité dérivée de CODE_TTL_MINUTES, compte à rebours lisant Retry-After), /espace-coureur gardé par requireSession() avec état « indisponible » propre, migrations idempotentes, conteneur Postgres 17 dédié (scripts/dev-db.sh), SMTP nodemailer avec repli journal serveur.

### Fichiers (principaux)
- `apps/web/src/modules/iam/` — store transactionnel, service, email, erreurs→enveloppes, migrations, session guard, env loader (14 fichiers + tests)
- `apps/web/src/app/api/auth/` — code, verify, session, logout (+ tests routes avec service stubbé)
- `apps/web/src/app/connexion/page.tsx`, `espace-coureur/page.tsx`, `components/logout-button.tsx`, `globals.css`
- `scripts/dev-db.sh`, `.env.example`, racine : script `test:db`, `vitest.config.ts` (alias `@`)

### Revue
4 couches (blind hunter, edge cases, verification gap, intent alignment) — 33 constats → 14 entrées patch (11 medium, 3 low) toutes corrigées et re-vérifiées ; 7 rejets tracés dans le triage log (2 false documentés). Rien de différé en plus de l'existant (tests de composant UI — déjà dans deferred-work.md depuis la 1.1).

**Recommandation de re-revue : true** — 11 entrées medium patchées ; risques résiduels nommés : (1) routes testées avec service stubbé — aucun test HTTP vivant bout-en-bout (cookie réel posé/navigateur), (2) branche SMTP testée uniquement en chemin d'échec (aucun envoi réel vérifié — nécessite SMTP de test), (3) surfaces UX (composant connexion) sans test.

### Vérification
- `bash scripts/dev-db.sh up` ✓ ; `pnpm -F @azzel/web db:migrate` ×2 idempotent ✓
- `pnpm test` : 51 tests verts / 9 fichiers (intégration Postgres incluse : TOCTOU parallèle, AD-5, anti-énumération, plafonds)
- `pnpm build` ✓ (connexion statique, espace-coureur dynamique) ; `pnpm typecheck` ✓
- E2E manuel du subagent sur build de prod (port 3123) : chaque ligne de matrice observée

### Risques résiduels
- `MAX_CODE_REQUESTS_PER_HOUR = 1000` non testé en intégration (logique identique au plafond par email, testé) — à ajuster si le jour J exige.
- Compte à rebours UI lit Retry-After mais l'envoi d'un nouveau code reste possible côté API après expiration locale du cooldown serveur — comportement conforme (429 informatif).
- Volume : aucune purge de login_code/session (rejeté low — volumes triviaux V1).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 33 findings — high 0, medium 14, low 12, false 3, maybe-false 0 (regroupés en 14 entrées patch, 7 rejets, 2 false supplémentaires comptés low-rejet)
- findings:
  - `[medium]` `[patch]` G1 — Durées dupliquées : fenêtre 10 min codée en dur dans le SQL de getCodeRequestStats vs CODE_REQUEST_WINDOW_MS ; « 10 minutes » recopié dans email/page/log vs CODE_TTL_MINUTES — l'UI/le SQL mentent à la première modification. Regroupe BH3+BH4.
  - `[medium]` `[patch]` G2 — TOCTOU rate-limit : count et insert hors transaction commune, des requêtes parallèles dépassent 3/10 min. Regroupe BH5+EC1.
  - `[medium]` `[patch]` G3 — Aucun plafond global : l'endpoint public permet de déclencher des envois SMTP en rafale sur des adresses distinctes (BH6) — plafond horaire global ajouté.
  - `[medium]` `[patch]` G4 — DROP DATABASE azzel_test sans garde d'hôte : garde localhost/127.0.0.1 avant toute opération destructive (moitié BH7).
  - `[medium]` `[patch]` G5 — Cooldown UI : Retry-After (jusqu'à 600 s) ignoré au profit de 60 s fixes, et à l'étape email aucun compte à rebours n'est affiché (submit actif) — regroupe BH9+EC4+EC10.
  - `[medium]` `[patch]` G6 — Aucune route API testée : contrat Set-Cookie (httpOnly, maxAge, Path), Retry-After, 401 session, logout — le AC central peut régresser tests verts. Regroupe BH15+VG1+VG2 (pré-vérifié).
  - `[medium]` `[patch]` G7 — Branche SMTP jamais exécutée par aucun test : test déterministe SMTP_URL=smtp://127.0.0.1:1 → EmailSendError + assertion 503 dans toApiError (VG4, pré-vérifié).
  - `[medium]` `[patch]` G8 — Suite d'intégration silencieusement skippée sans DATABASE_URL : avertissement sonore + script `test:db` documenté (VG3 + moitié skip de BH7, pré-vérifié).
  - `[medium]` `[patch]` G9 — espace-coureur : getSession qui lève (DB down) → 500 framework au lieu d'un état indisponible (EC2).
  - `[low]` `[patch]` G10 — Hygiène env loader : précédence .env inversée (le plus lointain écrase le plus proche), commentaires inline non gérés, appel superflu dans next.config.ts — regroupe BH10+EC5+BH11.
  - `[low]` `[patch]` G11 — Runner migrations : splitStatements cassera toute future migration avec ';' en chaîne ; main() sans try/catch — exécution fichier entier + gestion d'erreur propre. Regroupe BH13+EC7+EC8.
  - `[low]` `[patch]` G12 — Pas de garde d'auth réutilisable : helper requireSession() pour les pages protégées à venir (BH18).
  - `[low]` `[patch]` G13 — logout-button : fetch sans try/catch → rejet non géré (EC3).
  - `[low]` `[patch]` G14 — Email sans borne de longueur : cap 254 caractères dans isValidEmail (BH17).
  - `[false]` `[reject]` BH1 — « vitest introuvable dans apps/web » : les tests tournent depuis la config racine (45 verts vérifiés), vitest est devDep racine par conception depuis la 1.1.
  - `[false]` `[reject]` BH2 — « allowBuilds invalide » : réglage pnpm valide (confirmé doc pnpm + tsx/esbuild fonctionne — migrations exécutées).
  - `[low]` `[reject]` BH8 — Comparaison hash non constant-time : espace 10^6, 5 tentatives, 10 min — la faveur temporelle ne révèle rien d'exploitable ; complexité non justifiée.
  - `[low]` `[reject]` BH12+EC9 — Purge login_code/session : volumes triviaux (~1000 coureurs, 500 Mo free tier) — housekeeping ops ultérieur.
  - `[low]` `[reject]` BH14 — Slug seed dupliqué + schema_migrations en double : toute divergence échoue bruyamment (« Organisation absente »), jamais silencieusement.
  - `[false]` `[reject]` BH16 — « code non reçu reste vérifiable » : orphelin inerte (personne ne le connaît, 5 tentatives, expiration 10 min) — aucun tort démontrable.
  - `[low]` `[reject]` EC6 — Store indisponible caché à vie : scénario non joignable en flux normal (readEnv lit .env/process.env au premier appel ; redémarrage = remède standard).

## Design Notes

Compte différé à la vérification : `login_code` porte l'email (pas de FK) — c'est ce qui rend l'AC « aucun compte créé » structurelle. SHA-256 seul (pas de bcrypt) : codes 6 chiffres à vie 10 min usage unique + tokens de session 256 bits aléatoires — la longueur porte la sécurité, pas la lenteur du hachage. Sessions en table (id, token_hash unique, expires_at, revoked_at) : la révocation AD-5 devient un simple UPDATE. UI 2 étapes en un seul composant client ; erreurs en `aria-live="assertive"`.

## Verification

**Commands:**
- `bash scripts/dev-db.sh up` -- expected: conteneur azzel-postgres sain sur 54329.
- `pnpm -F @azzel/web db:migrate` -- expected: migrations appliquées, idempotent au re-run.
- `pnpm test` -- expected: tests iam verts (intégration incluses avec DATABASE_URL).
- `pnpm build && pnpm typecheck` -- expected: tout vert, React unique.

**Manual checks (if no CLI):**
- `pnpm dev:web` → /connexion : parcourir email → code (lu dans les logs serveur sans SMTP), vérifier collage, renvoi 60 s, mode sombre, déconnexion.

## Revue de code

**2026-10-22 — revue d'épopée (3 lentilles : adverse, chemins limites, trous de vérification) sur le diff complet des stories 1.1 à 1.9.**

### Constats retenus

1. **Déni de service trivial de l'authentification.** Le compteur horaire de `insertLoginCode` (`MAX_CODE_REQUESTS_PER_HOUR = 1000`) était **global** : aucun filtre `organisation_id`, et aucune limite par IP sur `POST /api/auth/code`. Mille requêtes avec des adresses différentes bloquaient la connexion de tous les utilisateurs pendant une heure — scénario d'autant plus probable le jour de l'ouverture des inscriptions.
2. **Codes de connexion non isolés entre organisations.** L'UPDATE d'invalidation (`WHERE email = … AND consumed_at IS NULL`) opérait toutes organisations confondues. Volet base traité en story 1.9.

### Modifications apportées

- `apps/web/src/modules/iam/store.ts` — le compteur horaire **et** le compteur par email sont filtrés sur `organisation_id` ; filtres `organisation_id` explicites ajoutés sur l'UPDATE d'invalidation, la relecture `FOR UPDATE` du code et les deux UPDATE de révocation de session (défense en profondeur, en plus du RLS).
- `apps/web/src/modules/iam/store.ts` + `constants.ts` — nouveau quota **par IP** en fenêtre glissante : `recordCodeRequestIp` (table `login_code_ip_request`, verrou consultatif, purge au fil de l'eau), `MAX_CODE_REQUESTS_PER_IP = 20` sur `CODE_REQUEST_IP_WINDOW_MS = 1 h`. Appelé par `requestLoginCode` **avant** toute écriture liée à l'email.
- `apps/web/src/app/api/auth/code/route.ts` — extraction de l'IP (`x-forwarded-for` première adresse, repli `x-real-ip`). L'IP n'est jamais stockée en clair : empreinte salée (`hashClientIp`, sel `AZZEL_IP_HASH_SALT`).

### Décisions et limites assumées

- **Sans en-tête d'IP** (appel direct, développement), le quota IP ne s'applique pas : seule la limite par email joue. Documenté dans le code. En production, l'application doit être derrière un proxy qui pose `x-forwarded-for`.
- `AZZEL_IP_HASH_SALT` doit être posée en production : avec le sel de repli, les IPv4 restent énumérables par force brute.
- La **pré-sélection** du code dans `verifyCodeAndStartSession` reste hors GUC — voir les limites détaillées en story 1.9.

### Vérification

Tests ajoutés dans `iam.test.ts` (hachage d'IP : stabilité et sensibilité au sel ; ordre quota-IP avant écriture ; refus sans code créé ni envoyé ; absence d'IP ; seuils), `auth.test.ts` (transmission de l'IP par la route, 3 cas) et `iam.integration.test.ts` (limitation par email comptée par organisation ; quota IP au-delà du seuil, y compris en parallèle). Suite complète avec base : 558 passés, 0 échec.

### Constats non traités dans cette passe

L'attribut `Secure` du cookie de session n'est toujours asserté par aucun test (le passer à `false` resterait indolore pour la suite) ; `/api/auth/code` et `/api/auth/verify` n'ont pas le garde `content-length` présent sur les autres routes ; retirer une adresse de `AZZEL_ADMIN_EMAILS` ne redescend jamais le rôle `organisateur` déjà accordé ; un échec SMTP après insertion du code consomme le quota sans que l'utilisateur reçoive rien.
