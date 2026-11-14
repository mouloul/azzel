# Note d'architecture — Observabilité de production (stack légère)

**Auteur :** Winston (System Architect) · **Date :** 2026-11-14
**Statut :** décision prise, 1 story à ordonnancer
**Objectif :** savoir, avant qu'un coureur ou un organisateur nous le dise, que la
production est tombée, qu'un cron ne tourne plus ou qu'une erreur se répète.

**Règle cardinale : aucune donnée personnelle ne sort du VPS par le canal
d'observabilité.** Ni email, ni téléphone, ni nom, ni position GPS, ni clé de preuve.
Une erreur se diagnostique avec un identifiant opaque, jamais avec l'identité du
coureur.

**Cadre (décidé avec Boss le 2026-11-14) :**
- production sur **VPS + Coolify**, conformément à `ARCHITECTURE-SPINE.md` §Stack ;
- outils **SaaS hébergés dans l'UE**, à condition que l'offre gratuite suffise.

**Hors portée :**
- l'**observabilité métier du jour J** (retard de synchro, passages par checkpoint,
  file d'emails). Elle appartient au tableau admin live (FR-24), pas à un outil
  technique ;
- les traces distribuées : un monolithe Next.js n'en a pas l'usage ;
- les **sauvegardes de la base**. Un outil d'observabilité signale une perte, il
  ne la répare pas. Le constat de `reviews/review-rubric.md` (aucune sauvegarde
  automatique en free tier Supabase) reste ouvert et mérite sa propre story.

---

## 1. Décision

| Besoin | Outil | Où vivent les données |
| --- | --- | --- |
| Erreurs serveur (Next.js) et app coureurs (Expo) | **Sentry SaaS**, offre gratuite Developer, **région UE** | Francfort |
| Disponibilité HTTP et battements de cœur des crons | **Better Stack Uptime**, offre gratuite | hors VPS |
| Journaux applicatifs | **JSON sur stdout**, conservés par Coolify | VPS |
| Métriques machine et base | **Coolify Sentinel** + tableau de bord Supabase | déjà en place |

Aucun service supplémentaire ne tourne sur le VPS.

---

## 2. Pourquoi ces choix

### Sentry plutôt que GlitchTip auto-hébergé

GlitchTip parle le protocole Sentry : **mêmes SDK, seul le DSN change**. On commence
donc sur Sentry SaaS (zéro maintenance) en sachant que la sortie vers GlitchTip ne
coûte qu'une variable d'environnement. C'est la réversibilité qui tranche, pas le
confort.

GlitchTip sur le VPS applicatif est écarté : il tomberait en même temps que ce qu'il
surveille, et il consomme de la RAM sur la machine qui doit tenir le jour J.

### Sentry plutôt que PostHog (arbitré avec Boss le 2026-11-14)

L'argument fort de PostHog est son quota d'erreurs gratuit : 100 000 exceptions par
mois contre 5 000 chez Sentry. Il est écarté pour quatre raisons :
- son cœur est l'analytics produit, et son module d'erreurs est plus jeune ;
- sa pente par défaut (autocapture du DOM, replay, identifiants de visiteur) va
  contre la règle cardinale et imposerait un bandeau de consentement ;
- son auto-hébergement est lourd (ClickHouse, Kafka), donc il n'offre pas de sortie
  équivalente à GlitchTip ;
- le seul besoin d'analytics du PRD, la portée des partages (SM-5, FR-26), est déjà
  couvert côté serveur et de façon anonyme (`compterVisitePartage`, migration 0034).

**À rouvrir si** un besoin d'analytics produit apparaît (par exemple un entonnoir
d'inscription demandé par le comité). PostHog redeviendrait alors le candidat
naturel : un seul outil pour l'usage et les erreurs.

### Un moniteur externe plutôt qu'Uptime Kuma

Même raison : un moniteur hébergé sur la machine qu'il surveille se tait exactement
quand on a besoin qu'il parle. La disponibilité se mesure de l'extérieur.

### Pas de Grafana Cloud, ni d'OpenTelemetry, ni de SigNoz

Ces outils sont puissants, mais ils demandent un agent (Alloy, collecteur OTel), une
configuration de pipelines et de l'entretien. Pour un développeur seul et un
monolithe, le coût d'exploitation dépasse le gain.

### Des journaux sur stdout plutôt qu'une plateforme de logs

Coolify conserve déjà la sortie des conteneurs. Un format JSON uniforme suffit à
filtrer avec `grep`/`jq`. On n'ajoutera un envoi vers une plateforme (Better Stack
Logs, par exemple) que si un besoin réel apparaît : il suffira alors de brancher un
drain sur ce même format.

---

## 3. Offres gratuites — vérification du 2026-11-14

Ces chiffres viennent surtout de comparateurs tiers. **On les reconfirme sur les
pages officielles au moment de créer les comptes.**

| Service | Ce qu'inclut l'offre gratuite | Ce qu'Azzel consomme |
| --- | --- | --- |
| Sentry Developer | 1 utilisateur, **5 000 erreurs/mois**, 30 jours d'historique ; région UE disponible sur toutes les offres, gratuite comprise (FAQ officielle) | Un dev, un trafic modeste hors jour J : largement dans le quota si on coupe le tracing de performance |
| Better Stack Uptime | **10 moniteurs + 10 battements de cœur**, vérification toutes les 3 min, 1 page de statut, alertes par email | 2–3 moniteurs HTTP, 4–5 battements de cœur (voir §5) |

**Deux pièges à connaître :**
1. **La région Sentry ne se change plus une fois l'organisation créée.** Il faut
   créer l'organisation directement en UE (`de.sentry.io`).
2. **Au-delà de 5 000 erreurs, Sentry jette les événements.** Une boucle d'erreurs
   le jour J peut épuiser le quota en quelques minutes. Parades au §6.

---

## 4. Garde-fous RGPD

- `sendDefaultPii: false` sur tous les SDK.
- Un **`beforeSend` commun** (dans `packages/shared`, utilisé par le web et par
  Expo) masque emails, numéros de téléphone, coordonnées GPS, clés de preuve et
  jetons (`azzel_session`, jeton d'appareil, jeton e-dossard). Il est couvert par des
  tests unitaires.
- **Pas de session replay** : il coûte en vie privée et pèse sur le bundle.
- **Pas de corps de requête** dans les événements. Les en-têtes `Cookie` et
  `Authorization` sont retirés.
- Le contexte utilisateur se limite à un **identifiant opaque** (`account.id`) et au
  rôle. Jamais d'email.
- Journal stdout : même règle. Le logger refuse les clés connues comme personnelles
  (`email`, `telephone`, `nom`…) plutôt que de compter sur la discipline de chaque
  appelant.
- Better Stack ne reçoit que des URL publiques et des battements de cœur sans
  contenu : aucune donnée personnelle par construction.
- À ajouter au registre des sous-traitants : Sentry (Functional Software Inc.,
  données en UE) et Better Stack.

---

## 5. Contenu de la story

### 5.1 Journal structuré
- `apps/web/src/lib/journal.ts` : `journal.info|warn|error(module, message, champs)`
  produit une ligne JSON (`ts` ISO 8601 UTC, `niveau`, `module`, `organisationId`
  facultatif, `message`, champs). Il filtre les clés personnelles.
- Remplacer les ~71 `console.error`/`console.warn` serveur de `apps/web/src`. Les
  logs côté client restent hors lot.

### 5.2 Erreurs serveur — Sentry
- `apps/web/instrumentation.ts` : `register()` initialise Sentry côté Node ;
  `export const onRequestError = Sentry.captureRequestError` (le hook natif de
  Next 16 pour les erreurs de rendu, de route et d'action).
- **Sans `SENTRY_DSN`, rien ne s'initialise.** Le développement local, les tests et
  la CI ne changent pas.
- `tracesSampleRate: 0` : pas de tracing de performance, pour ne pas consommer de
  quota.
- `environment` vient de `SENTRY_ENVIRONMENT` (`production`, `recette`). La recette
  Vercel peut être branchée sur le même projet pour roder la chaîne avant le jour J.
- Les source maps sont envoyées au build par `withSentryConfig` si
  `SENTRY_AUTH_TOKEN` est présent dans l'environnement de build Coolify. Sinon, le
  build reste inchangé.

### 5.3 Erreurs navigateur — décision mesurée, pas présumée
Le SDK navigateur pèse sur le bundle, alors que le projet a un budget
(`pnpm budget`). La story **mesure** l'impact d'`instrumentation-client.ts` et
consigne la décision : branché si le budget tient, différé sinon. Les surfaces
prioritaires seraient la PWA scanneuse et le formulaire d'inscription.

### 5.4 App coureurs — Sentry Expo
- `@sentry/react-native` avec son plugin de configuration Expo (on utilise déjà un
  dev build).
- DSN par variable EAS. Le même `beforeSend` masque en plus les positions GPS des
  breadcrumbs.
- Les source maps sont envoyées par EAS Build.

### 5.5 Route de santé
- `GET /api/sante` : un `select 1` borné (même patron que `lib/lecture-bornee.ts`)
  renvoie `200 {"ok":true}`, sinon `503`. Réponse `no-store`, aucun détail
  d'infrastructure exposé.
- C'est elle que surveille Better Stack, en plus de la page d'accueil.

### 5.6 Battements de cœur des crons
- `apps/web/src/lib/battement.ts` : `battement(nom, issue)` appelle l'URL lue dans
  `HEARTBEAT_URL_<NOM>`. Délai court ; **ne lève jamais d'erreur** : une panne de
  Better Stack ne doit pas casser un cron.
- Branché à la fin de chaque CLI planifiée sur le VPS :

| Cron VPS | Fréquence | Battement |
| --- | --- | --- |
| `emails:send` (file d'envoi) | fréquent | `HEARTBEAT_URL_EMAILS` |
| `inscriptions:echeances` | horaire | `HEARTBEAT_URL_ECHEANCES` |
| `emails:j7` | quotidien | `HEARTBEAT_URL_J7` |
| keep-alive Supabase | hebdo | `HEARTBEAT_URL_KEEPALIVE` |
| sauvegarde base (le jour où elle existe) | quotidien | `HEARTBEAT_URL_SAUVEGARDE` |

- En cas d'échec, on appelle l'URL `/fail` du battement : l'alerte part tout de
  suite, sans attendre la fin du délai de grâce.

### 5.7 Variables d'environnement (Coolify)
`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` (au build uniquement),
`HEARTBEAT_URL_*`. Toutes sont facultatives : leur absence désactive la brique
concernée sans erreur.

### 5.8 Exploitation
Une section du README (ou un runbook dédié) explique qui reçoit les alertes, comment
lire un événement Sentry, comment suivre un battement et comment basculer vers
GlitchTip.

### 5.9 Tests
- Masquage : un événement contenant email, téléphone, coordonnées et jeton en ressort
  nettoyé.
- `battement` : ne lève jamais d'erreur, même sur délai dépassé, réponse 500 ou URL
  absente.
- `/api/sante` : 200 si la base répond, 503 si elle se tait, jamais de détail exposé.
- `journal` : rejette les clés personnelles.

---

## 6. Risques et parades

| Risque | Parade |
| --- | --- |
| Quota Sentry épuisé par une boucle d'erreurs le jour J | Spike protection et limite par clé côté Sentry ; `ignoreErrors` pour le bruit connu (coupures réseau des scanneurs hors ligne, abandon de requête). Le journal stdout prend le relais. Option : souscrire un mois d'offre Team autour du 26/03/2027 |
| Conditions de l'offre gratuite Better Stack ambiguës (« personal projects » d'un côté, usage commercial autorisé de l'autre selon les sources) | Lire les CGU officielles à l'inscription. Si l'usage commercial est exclu : **Healthchecks.io** (société lettone, données à Francfort, open source, 20 tâches gratuites) pour les crons + UptimeRobot pour le HTTP |
| Alertes ignorées parce que trop bruyantes | Un seul canal (email) et des délais de grâce adaptés à chaque cron. On ajuste après deux semaines de production |
| Données personnelles glissées dans un message d'erreur | `beforeSend` testé + filtre du journal. Revue ciblée avant mise en production |
| Sentry change ses conditions | DSN → GlitchTip : aucun changement de code |

---

## 7. Amendement de spine proposé

Dans `ARCHITECTURE-SPINE.md` :

- **Consistency Conventions → Logging** :
  > Journal JSON sur stdout (`lib/journal.ts`), sans donnée personnelle ; journal sync
  > (lots, rejets, offsets horloge) inchangé — l'auditabilité du chrono prime.
- **Consistency Conventions → nouvelle ligne Observabilité** :
  > Erreurs : Sentry région UE (protocole Sentry, sortie GlitchTip possible), masquage
  > commun dans `shared`, pas de replay. Disponibilité et crons : moniteur externe au
  > VPS (Better Stack), battement de cœur en fin de chaque cron. Rien d'auto-hébergé
  > sur le VPS applicatif.
- **Deferred** : remplacer « CI/CD & observabilité approfondies » par
  « CI/CD ; observabilité au-delà des erreurs et de la disponibilité (traces,
  métriques applicatives) ».

---

## 8. Suites (arbitrées avec Boss le 2026-11-14)

1. **Destinataire des alertes** : Boss seul.
2. **Amendement de spine** : appliqué le 2026-11-14 (Logging, Observabilité,
   Sauvegardes, Stack, Deferred).
3. **Stories** : épopée 12 « Exploitation de production » dans `epics.md` :
   - 12.1 Observabilité de production (cette note) ;
   - 12.2 Sauvegardes de la base et des preuves, à livrer avant la clôture des
     inscriptions.
4. **Reste ouvert** : la lecture des CGU Better Stack à l'inscription (voir §6).

## Sources (consultées le 2026-11-14)

- Sentry, FAQ région UE : https://sentry.zendesk.com/hc/en-us/articles/25074658211227-Sentry-s-EU-Region-FAQ
- Sentry, limites de l'offre gratuite (tiers) : https://realuptime.io/blog/sentry-free-tier-limits · https://costbench.com/software/developer-tools/sentry/free-plan/
- Better Stack, offre gratuite (tiers) : https://freetier.co/directory/products/better-stack · https://www.modern-datatools.com/tools/better-stack/pricing
- Healthchecks.io, tarifs : https://healthchecks.io/pricing · confidentialité : https://blog.healthchecks.io/2021/01/everything-privacy
- UptimeRobot, usage commercial (tiers) : https://notifier.so/guides/uptimerobot-pricing-2026/
