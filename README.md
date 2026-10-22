# Azzel

Plateforme clé en main de gestion de course de trail, hors-ligne d'abord, portée par son village.
Monorepo pnpm : web (Next.js), application coureurs (Expo, dev build) et contrat partagé (TypeScript).

## Prérequis

- Node.js `^22.13 || ^24.3 || >=26`
- pnpm (activé via `corepack enable`, version indiquée dans `packageManager`)

## Structure

```text
apps/
  web/        # Vitrine, inscriptions, portail volontaires, admin — Next.js 16.4.2
  runners/    # Application coureurs — Expo SDK 58 / RN 0.88 (dev build, pas Expo Go)
packages/
  shared/     # Contrat inter-apps : design tokens, enveloppe d'erreur, horodatages
```

Tout contrat partagé entre les applications vit dans `packages/shared`, nulle part ailleurs
(tokens « Vert Djurdjura », enveloppe d'erreur versionnée, helpers d'horodatage ISO 8601 UTC).

## Commandes

```bash
pnpm install        # installe le workspace (lockfile pnpm-lock.yaml)
pnpm build          # shared (tsc) + runners (tsc) + web (next build)
pnpm typecheck      # zéro erreur TypeScript attendue sur les trois packages
pnpm test           # tests unitaires (vitest) : shared + lib web
pnpm test:db        # dev-db.sh up + pnpm test (intégration Postgres garantie)
pnpm budget         # build + mesure du budget de la page d'accueil (< 300 Ko)
bash scripts/dev-db.sh up    # Postgres 17 dédié (port 54329) + .env
bash scripts/dev-mail.sh up  # faux SMTP Mailpit (SMTP 2525, UI http://localhost:8026) + SMTP_URL
pnpm dev:web        # serveur de développement Next.js
pnpm dev:runners    # Metro pour la dev build coureurs (expo start --dev-client)
```

## Budget page d'accueil (story 2.1)

Le premier chargement de la page d'accueil (HTML + CSS + JS + polices préchargées
+ photo hero en 640) doit rester **< 300 Ko**. La mesure est déterministe :

```bash
pnpm budget                          # build + mesure
bash scripts/check-budget.sh        # mesure seule, sur un build existant
```

Le port du serveur de mesure est configurable par une seule variable, `BUDGET_PORT`
(défaut 3123), utilisée à la fois par le script et par le test d'intégration opt-in
`apps/web/src/app/home.integration.test.ts` (skip si aucun serveur n'écoute, échec
sur une réponse non-OK).

Le script démarre `next start` sur le build frais, mesure le poids « fil » de chaque
ressource locale référencée par le HTML servi (gzip quand le serveur compresse) et
affiche le détail par ressource. Le budget mesure le **chemin mobile** : la photo
hero est servie en 640 via `<picture>` (la variante 1280 n'est choisie qu'au-delà de
700 px ; léger upscale accepté sous le voile sur écrans DPR ≥ 2), et les photos
différées `loading="lazy"` sous la ligne de flottaison ne comptent pas. Le script
vérifie aussi que le HTML servi contient l'égide, le CTA `/connexion` et les
chiffres officiels 2026 ; il échoue (exit 1) si le seuil ou le contenu est en
défaut, ou si une ressource est inaccessible.

## Notifications par email (file d'envoi)

Chaque événement coureur (inscription reçue, dossier validé, dossier refusé) insère un
email dans la table `email_outbox` **dans la même transaction** que l'événement ;
l'envoi est ensuite best effort (un échec SMTP ne bloque jamais le parcours). Les lignes
en échec repassent en file avec un backoff (`attempts × 5 min`, plafond 1 h) ; après
**5 tentatives** une ligne n'est plus reprise : elle reste visible en base
(dead-letter implicite, colonnes `attempts`/`last_error`) et le script la signale.

```bash
pnpm -F @azzel/web emails:send        # traite la file en attente (20 par défaut)
pnpm -F @azzel/web emails:send 100    # limite explicite
```

Rejeu cron VPS (exemple, toutes les 5 minutes) :

```cron
*/5 * * * * cd /srv/azzel && pnpm -F @azzel/web emails:send >>/var/log/azzel-emails.log 2>&1
```

## Conventions

- **Langues** : interface utilisateur en français ; code et identifiants en anglais.
  Les rôles des design tokens font exception : ils reprennent verbatim le frontmatter
  du système visuel (DESIGN.md).
- **Design tokens** : source unique dans `packages/shared/src/tokens.ts`, déclinée en
  variables CSS (`--az-*`) côté web et en thème React Native (`apps/runners/src/theme.ts`).
  Ne jamais copier un hex dans une app : toujours dériver de `shared`.
- **Mode sombre** : défaut = préférence système, choix mémorisé (localStorage), bascule
  visible dans l'en-tête ; script anti-flash avant première peinture.
- **Horodatages** : stockage ISO 8601 UTC, affichage local via `packages/shared/src/datetime.ts`.
- **Erreurs d'API** : enveloppe unique versionnée `packages/shared/src/error-envelope.ts`
  (`{ version, error: { code, message, action } }`) — message humain + action à faire,
  jamais de code brut.
- **React** : version unique 19.3.x sur tout le workspace (overrides pnpm).

## Édition du projet

Les artefacts de planification (specs, épopées, architecture) vivent dans `_bmad-output/`.
