# Epic 12 Context: Exploitation de production

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Épopée technique, sans fonctionnalité produit. Avant que la production (VPS + Coolify) reçoive les vraies données des coureurs de l'édition du 26/03/2027, le développeur, seul à maintenir Azzel, doit apprendre qu'elle tombe, qu'un cron s'est arrêté ou qu'une erreur se répète avant qu'un coureur ou le comité le lui signale. Il doit aussi pouvoir la reconstruire après une erreur de manipulation, une panne ou la perte du projet Supabase. Règle cardinale : **aucune donnée personnelle ne sort du VPS par le canal d'observabilité, et aucune sauvegarde ne sort non chiffrée.** Aucun service supplémentaire ne tourne sur le VPS applicatif, et tous les outils restent dans leur offre gratuite.

## Stories

- Story 12.1 : Observabilité de production
- Story 12.2 : Sauvegardes de la base et des preuves

## Requirements & Constraints

- **Vie privée (RGPD).** Jamais d'email, de téléphone, de nom, de position GPS, de clé de preuve ni de jeton (`azzel_session`, jeton d'appareil, jeton e-dossard) dans un événement d'erreur ou une ligne de journal. On diagnostique avec un identifiant opaque (id du compte et rôle), jamais avec l'identité du coureur. Sentry et Better Stack sont ajoutés au registre des sous-traitants.
- **Désactivation silencieuse.** Toutes les variables d'observabilité sont facultatives (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` au build seulement, `HEARTBEAT_URL_*`). Leur absence désactive la brique concernée sans erreur, et le développement local, les tests et la CI restent inchangés.
- **L'observabilité ne casse jamais le métier.** Une panne du moniteur (délai dépassé, réponse 500, URL absente) ne doit jamais faire échouer un cron.
- **Route de santé.** Elle répond 200 `{"ok":true}` si la base répond et 503 sinon, en `no-store`, sans aucun détail d'infrastructure.
- **Quota Sentry** : 5 000 erreurs par mois, au-delà les événements sont perdus. Il faut donc pas de tracing (`tracesSampleRate: 0`), pas de replay, la spike protection et un `ignoreErrors` pour le bruit connu (coupures réseau des scanneurs hors ligne, requêtes abandonnées). En cas de besoin, on peut prendre un mois d'offre Team autour du jour J.
- **Budget bundle.** Brancher le SDK navigateur dépend d'une mesure avec `pnpm budget`, qu'on ne présume pas d'avance. Les surfaces prioritaires seraient la PWA scanneuse et le formulaire d'inscription. La décision est consignée avec la mesure.
- **Sauvegardes.** Le free tier Supabase n'en fait aucune. Il faut sauvegarder la base et le bucket des preuves dans le même lot, car une base sans ses preuves rend la validation des dossiers impossible. Les sauvegardes sont chiffrées avant de quitter le VPS, avec une clé que Boss garde hors du VPS. Elles sont stockées dans l'UE, chez un fournisseur distinct du VPS et de Supabase. La rétention est bornée (proposition : 7 quotidiennes et 4 hebdomadaires), alignée sur la politique de conservation de l'édition.
- **Fréquence.** Quotidienne en temps normal, resserrée pendant la fenêtre de course (perte maximale visée : 1 h le jour J), plus un dump manuel juste avant le départ et un autre juste après l'arrivée.
- **Restauration éprouvée.** Elle se fait dans une base locale (`scripts/dev-db.sh`), puis on vérifie les comptages (dossiers, preuves, passages) et que le RLS multi-organisation est intact. La procédure est écrite pas à pas, rejouée une fois avant la clôture des inscriptions, puis au dry-run.
- **Comparaison de coût.** Comparer avec un mois de Supabase Pro autour du jour J et consigner la décision. Cette option ne remplace pas la sauvegarde hors Supabase, qui protège aussi contre la perte du projet lui-même.

## Technical Decisions

- **Erreurs : Sentry SaaS, offre Developer, organisation créée directement en région UE** (`de.sentry.io`), car la région ne se change plus ensuite. Comme GlitchTip parle le protocole Sentry, en sortir ne demande qu'un changement de DSN, sans toucher au code. On écarte PostHog (analytics d'abord, autocapture contraire à la règle cardinale) et tout auto-hébergement sur le VPS, qui tomberait avec ce qu'il surveille.
- **Web (Next 16).** `instrumentation.ts` initialise Sentry côté Node, et l'erreur est remontée par le hook natif `onRequestError`. Réglages : `sendDefaultPii: false`, ni corps de requête ni en-têtes `Cookie`/`Authorization`. L'`environment` vient de `SENTRY_ENVIRONMENT` (`production`, `recette`) : la recette Vercel peut alimenter le même projet pour roder la chaîne. Les source maps passent par `withSentryConfig`, seulement si `SENTRY_AUTH_TOKEN` est présent.
- **Masquage commun.** Un `beforeSend` unique dans `packages/shared`, couvert par des tests unitaires, est partagé par le web et par Expo. L'app coureurs utilise `@sentry/react-native` avec son plugin Expo (dev build). Le masquage y retire en plus les positions GPS des breadcrumbs, le DSN est fourni par une variable EAS et les source maps sont envoyées par EAS Build.
- **Journal.** `apps/web/src/lib/journal.ts` écrit une ligne JSON par événement sur stdout : `ts` (ISO 8601 UTC), `niveau`, `module`, `organisationId` facultatif, `message` et les champs. Il refuse lui-même les clés personnelles connues au lieu de compter sur la discipline de chaque appelant. Les `console.error`/`console.warn` serveur (environ 71) passent par lui. Les logs côté client sont hors lot, et le journal sync du chrono reste inchangé. Coolify conserve stdout ; aucune plateforme de logs n'est prévue tant qu'un besoin ne l'exige pas.
- **Disponibilité et crons : moniteur externe au VPS, Better Stack Uptime en offre gratuite** (10 moniteurs et 10 battements). Il surveille l'accueil et `/api/sante` (un `select 1` borné, sur le patron de `lib/lecture-bornee.ts`) et alerte Boss seul, par email. Les CGU sont à relire à l'inscription. Si l'usage commercial est exclu, on se replie sur Healthchecks.io (crons) et UptimeRobot (HTTP).
- **Battements de cœur.** `apps/web/src/lib/battement.ts` expose `battement(nom, issue)` avec un délai court. Il appelle `HEARTBEAT_URL_<NOM>` en cas de succès et l'URL suffixée `/fail` en cas d'échec, ce qui déclenche une alerte immédiate. Il ne lève jamais d'erreur. Les noms sont `EMAILS` (`emails:send`), `ECHEANCES` (`inscriptions:echeances`), `J7` (`emails:j7`), `KEEPALIVE` (keep-alive Supabase) et `SAUVEGARDE`. Les crons sont ceux de la crontab VPS documentée dans le README. La recette Vercel n'a pas de crontab : le balayage des échéances y passe par une route HTTP.
- **Connexions à la base.** Le dump se fait avec `DATABASE_OWNER_URL` (rôle propriétaire, `BYPASSRLS`), jamais avec le rôle applicatif ni en mode transaction. Ce rôle n'a aucun usage à l'exécution et ne doit pas être posé dans les variables de l'application. L'épopée prescrit la connexion directe sur le port 5432. Or l'hôte direct `db.<ref>.supabase.co` ne résout aucune adresse IPv4 : sans IPv6 sur le VPS, il faut passer par le pooler en **mode session (5432)**, comme les migrations et `seed:reset`. Le TLS est imposé dès que l'hôte n'est pas local. En recette, `DATABASE_URL` est aussi passée en mode session (5432) depuis le 10/11, car postgres.js bloque en mode transaction (6543) dès 4 requêtes simultanées.
- **Preuves.** Elles sont stockées dans le bucket Supabase Storage privé `preuves`, et l'API Storage est appelée par `fetch` sans SDK. La copie exige la clé secrète du projet avec à la fois l'en-tête `apikey` et le porteur `Bearer`. Une clé publiable ne renvoie pas « accès refusé » mais « objet introuvable » : une panne de droits ressemble donc à une perte de données.
- **Métriques machine et base** : Coolify Sentinel et le tableau de bord Supabase, déjà en place.
- **Hors portée** : l'observabilité métier du jour J (retard de synchro, passages, file d'emails), qui relève du tableau admin live ; les traces distribuées et les métriques applicatives ; l'analytics produit (PostHog serait à rouvrir si un besoin d'usage apparaît).

## Cross-Story Dependencies

- 12.2 dépend de `battement` (12.1) pour `HEARTBEAT_URL_SAUVEGARDE`. Une sauvegarde qui ne tourne plus doit déclencher une alerte.
- 12.2 doit être livrée avant la clôture des inscriptions, et sa restauration doit être rejouée au dry-run d'avant le jour J.
- Les deux stories s'appuient sur l'infrastructure de l'épopée 8 : fabrique de connexion unique, `ProofStore` adossé à Supabase Storage, rôles `azzel_app` et propriétaire. Le README (exploitation) documente les variables, le destinataire des alertes, la lecture d'un événement Sentry, le suivi d'un battement, la bascule vers GlitchTip, ainsi que la procédure de restauration.
