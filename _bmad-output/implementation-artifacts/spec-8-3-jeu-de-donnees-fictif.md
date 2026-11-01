---
title: 'Story 8.3 — Jeu de données fictif « édition complète »'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '54f62893db9fd5685c0c45ecd1defdc73726a34c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le comité d'organisation doit prendre l'application en main sur l'environnement de recette. Une base fraîchement migrée ne contient qu'une organisation, une édition et deux épreuves : aucun coureur, aucun dossier à valider, aucun secteur, aucune mission. Le comité arriverait sur des écrans vides et ne pourrait exercer aucun des gestes qu'il aura à faire le jour J.

**Approche :** un script de seed qui produit une édition crédible en empruntant les services métier existants plutôt qu'en écrivant en SQL brut, accompagné d'une commande de réinitialisation, pour que le comité puisse expérimenter, casser des choses et repartir d'un état propre sans l'équipe.

## Boundaries & Constraints

**Always :**
- **Aucune donnée réelle.** Noms, adresses, téléphones manifestement inventés. Aucune adresse email n'appartient à une personne extérieure à l'équipe.
- **Les coureurs se fabriquent par les services**, pas par `INSERT` : `submitInscription` → `uploadPreuve` → `acceptDocuments` → `decideDossier` → `obtenirEdossard` → `attribuerDossards`. Le schéma porte des contraintes couplées (les quatre colonnes d'acceptation posées ensemble ou pas du tout, motif de refus obligatoire si et seulement si `status = 'refusé'`, preuve active unique par coureur) qu'un seed en SQL brut violerait ou contournerait silencieusement.
- **Les écritures sont scopées par `withOrg`** : sous `azzel_app` avec le GUC `app.organisation_id` posé dans la transaction, les `INSERT` passent (AD-4 intact). `org-scope.ts` n'est pas modifié.
- **Les emails engendrés par le seed sont neutralisés.** Les services empilent `inscription_recue`, `dossier_valide` et `dossier_refuse` dans `email_outbox`. Cinquante coureurs fictifs produisent autant d'envois vers des adresses inventées : si le worker tourne sur la recette avec le SMTP de la story 8.4, ce sont autant de rebonds qui abîment la réputation du domaine expéditeur. Les lignes produites par le seed finissent dans un statut qui ne sera jamais expédié.
- **Idempotence par identité stable.** Les comptes fictifs sont reconnaissables à leur email ; une seconde exécution les retrouve au lieu d'en créer de nouveaux.
- **Statuts verbatim** : `'en constitution'`, `'validé'`, `'refusé'` — accentués, tels que la contrainte `coureur_status_chk` les exige.

**Never :**
- Ne pas modifier `org-scope.ts`, ni les services, ni les stores. Le seed est un consommateur de l'existant.
- Ne pas insérer dans `organisation`, `evenement`, `edition`, `epreuve`, `document` : les migrations les créent déjà. Le seed les retrouve par slug.
- Ne pas réutiliser `scripts/dev-db.sh reset` comme réinitialisation : il supprime le conteneur et le volume Docker, n'existe pas sur une base hébergée, et effacerait le schéma.
- Ne pas contourner la dépendance à la story 8.2 en silence (voir Décisions).

## Décisions prises

- **La réinitialisation s'exécute sous le rôle propriétaire** (`DATABASE_OWNER_URL`). `azzel_app` ne dispose que de `SELECT` et `INSERT` sur `terrain_evenement`, `abandon`, `annulation` et `position` : `UPDATE` et `DELETE` lui sont révoqués, la purge est donc impossible sous le rôle applicatif. Le seed, lui, reste sous `azzel_app`.
- **Garde-fou de la réinitialisation : variable d'autorisation explicite.** Sans `AZZEL_SEED_RESET=1` dans l'environnement, la commande refuse et nomme la variable manquante. L'inspection du contenu de la base a été écartée : elle bloquerait une recette légitimement salie par le comité — précisément le moment où la réinitialisation sert.
- **Volume fixe, écrit dans le script** : une cinquantaine de coureurs, répartition en dur, relisible d'un coup d'œil. Pas de paramètre : personne n'a demandé à faire varier le volume, et un argument serait une entrée à valider et un cas de test de plus.
- **Dépendance à la story 8.2, assumée et visible.** Les preuves passent par `getProofStore()`, qui sert `LocalDiskProofStore` tant que `SupabaseProofStore` n'existe pas. En local le seed est complet ; sur l'environnement hébergé les preuves déposées seront perdues au redémarrage tant que 8.2 n'est pas livrée. Le script le dit à l'exécution plutôt que de laisser le comité découvrir des preuves manquantes.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|----------|--------------|----------------------|------------------|
| Premier seed | Base migrée, aucun coureur | Édition peuplée ; le script rapporte ce qu'il a créé | N/A |
| Seed rejoué | Base déjà seedée | Aucun doublon ; le script rapporte qu'il n'a rien eu à créer | N/A |
| Seed sans migrations | `coureur` absente | Échec explicite renvoyant vers `db:migrate` | `process.exitCode = 1` |
| Seed sans base | `DATABASE_URL` absente | Échec explicite, aucune trace partielle | `process.exitCode = 1` |
| Réinitialisation | Base seedée et modifiée par le comité | Les données du seed disparaissent ; organisation, édition, épreuves et documents des migrations subsistent | N/A |
| Réinitialisation sans rôle propriétaire | `DATABASE_OWNER_URL` absente | Refus explicite nommant la variable manquante | `process.exitCode = 1` |
| Emails du seed | Après seed | Aucune ligne `email_outbox` du seed n'est expédiable | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/migrate.ts` -- motif de CLI à suivre : connexion `max: 1`, `process.exitCode = 1` sans `process.exit()`, `sql.end({ timeout: 5 })` en `finally`, garde `invokedDirectly`. Exporte `applyAllMigrations`.
- `apps/web/src/modules/notifications/send-cli.ts` -- variante de la garde `invokedDirectly` qui résout les liens symboliques ; connexion applicative avec `prepare: false`.
- `apps/web/src/modules/inscriptions/dossards.integration.test.ts` (~l.117-142) -- `createCoureurValide()` : la chaîne de services complète, de bout en bout. **Recette de référence à reprendre, pas à réinventer.**
- `apps/web/src/modules/inscriptions/service.ts` -- `submitInscription`, `uploadPreuve`, `acceptDocuments`, `decideDossier`, `obtenirEdossard`, `attribuerDossards`.
- `apps/web/src/db/org-scope.ts` -- `withOrg`, `findOrganisationIdBySlug`. **Ne pas modifier.**
- `apps/web/src/modules/iam/constants.ts` -- `DEFAULT_ORGANISATION_SLUG`.
- `apps/web/src/modules/inscriptions/proof-store.ts` -- `getProofStore()`, `detectProofFormat` ; les octets de preuve doivent faire ≤ 307200 et porter un en-tête de format cohérent.
- `apps/web/src/modules/missions/store.ts` -- `createMissionsStore` ; `secteur` (unique par `(edition_id, nom)`), `mission` (`type` parmi six valeurs, `fin_le > debut_le`), `affectation`, `volontaire` (`account_id` unique).
- Tables du chrono : **`terrain_evenement`**, pas `passage`. `cle_idempotence` unique, `type IN ('retrait','passage')`, `checkpoint_id` non nul si et seulement si `type = 'passage'`, rattachement au coureur par `jeton_edossard` sans clé étrangère.
- `apps/web/package.json` -- déclarer les deux points d'entrée à côté de `db:migrate`, `emails:send`, `emails:j7`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/seed/donnees.ts` -- décrire le jeu fictif : identités, épreuves visées, répartition par stade de dossier, secteurs, missions, volontaires -- données séparées de la mécanique, relisibles sans lire le code
- [x] `apps/web/src/modules/seed/seed.ts` -- peupler via les services sous `withOrg`, idempotent par email, neutraliser les lignes `email_outbox` produites, avertir si `SupabaseProofStore` est absent -- cœur de la story
- [x] `apps/web/src/modules/seed/reset.ts` -- purge sous le rôle propriétaire, dans l'ordre des clés étrangères, préservant ce que les migrations créent, garde-fou selon la réponse à la question ouverte -- commande destructrice, donc explicite et gardée
- [x] `apps/web/src/modules/seed/seed.test.ts` -- couvrir la matrice I/O : idempotence, absence de migrations, absence de base, neutralisation des emails
- [x] `apps/web/package.json` -- déclarer `seed` et `seed:reset`
- [x] `.env.example` -- documenter les deux commandes et la variable de garde-fou
- [x] `_bmad-output/implementation-artifacts/note-archi-winston-deploiement-vercel.md` -- noter que la réinitialisation exige le rôle propriétaire, fait d'architecture découvert ici

**Acceptance Criteria:**
- Étant donné une base migrée et vide, quand on lance le seed deux fois de suite, alors le nombre de coureurs est identique après la seconde exécution qu'après la première.
- Étant donné une base seedée, quand on interroge `email_outbox`, alors aucune ligne produite par le seed n'est dans un statut expédiable.
- Étant donné une base seedée puis réinitialisée, quand on relance le seed, alors l'édition est de nouveau complète sans intervention manuelle en base.
- Étant donné une base seedée, quand un organisateur ouvre la liste des dossiers, alors il trouve des dossiers à valider, des dossiers validés et des dossiers refusés avec leur motif.

## Implementation Notes

**Fichiers livrés**

- `apps/web/src/modules/seed/donnees.ts` — jeu fictif pur données : 50 coureurs en
  table lisible (22 validés · 10 dossiers complets · 12 inscriptions nues · 6 refusés
  avec motif), 12 volontaires, 4 secteurs / 8 missions couvrant les six types,
  affectations (une mission laissée volontairement vacante), heures de départ
  échelonnées, plan des événements terrain. Toutes les adresses sont sur
  `seed.azzel.invalid` — domaine réservé RFC 2606, structurellement non délivrable.
- `apps/web/src/modules/seed/seed.ts` — mécanique : chaîne de services complète sous
  `withOrg` (rôle `azzel_app`), idempotence par relecture de l'état réel de chaque
  dossier, neutralisation des emails, avertissement 8.2, CLI.
- `apps/web/src/modules/seed/reset.ts` — purge en une transaction sous le rôle
  propriétaire, ordre des clés étrangères, garde-fou `AZZEL_SEED_RESET=1`.
- `apps/web/src/modules/seed/seed.test.ts` — 9 cas couvrant la matrice I/O.

**Décisions d'implémentation**

- *Idempotence par état réel, pas par drapeau.* `upsertCoureur` refuse de réécrire un
  dossier qui n'est plus « en constitution » (`DossierValidatedError`) : un rejeu
  naïf planterait. Le seed relit donc, pour chaque compte retrouvé par email, s'il a
  un dossier, une preuve active, ses acceptations, une décision — et ne rejoue que
  les étapes manquantes. Un seed interrompu à mi-chemin se rattrape tout seul.
- *Worker jamais réveillé.* `submitInscription` et `decideDossier` déclenchent
  `processOutbox` en best effort. Le seed leur passe `triggerOutbox` neutre, puis
  bascule en `cancelled` (statut de la migration 0019, le seul que le worker ne
  revendique jamais) toute ligne `email_outbox` destinée au domaine fictif. Les
  adresses réelles du comité ne sont jamais touchées : le filtre porte sur le
  suffixe du domaine réservé.
- *`horodatage_reception` posé explicitement* sur les événements terrain : la valeur
  par défaut `now()` donnerait des temps de classement absurdes, l'édition fictive
  étant datée en 2027.
- *Réinitialisation sous le rôle propriétaire* — fait d'architecture consigné dans
  `note-archi-winston-deploiement-vercel.md` §4. La purge remet aussi
  `epreuve.heure_depart` à NULL (la ligne `epreuve`, elle, est préservée).
- *`appareil` et `terrain_evenement`* : le seed insère les événements directement
  (sous `withOrg`, `INSERT` accordé, `ON CONFLICT (cle_idempotence) DO NOTHING`)
  plutôt que par `synchroniserLot` — cela aurait exigé d'enregistrer un appareil
  scanneur et de manipuler un jeton, sans rien ajouter à la crédibilité des données.

**Limites connues**

- Les preuves déposées par le seed vivent sur `LocalDiskProofStore` tant que la story
  8.2 n'est pas livrée ; le script l'annonce à chaque exécution.
- La réinitialisation supprime les lignes `preuve` mais ne balaie pas les fichiers du
  stockage : des octets orphelins subsistent (sans conséquence fonctionnelle).
- Passée la clôture des inscriptions (`registration_closes_at`, 2027-03-16 pour
  l'édition 2027), le seed ne peut plus créer de coureur : il échoue alors sur
  `InscriptionsFermeesError`, qui donne le `UPDATE` de contournement. Un rejeu sur
  base déjà peuplée reste possible après la clôture (il n'inscrit personne).

## Spec Change Log

## Review Triage Log

Passe 1 — trois couches. Chaque verdict vérifié sur le code ou sur la base, pas repris du rapport.

| # | Trouvaille | Verdict | Évidence |
|---|---|---|---|
| 1 | Passages de checkpoint antérieurs au départ | **high** | **Prouvé par requête sur la base seedée** : `moyenne` part à 08:00, 3 passages à partir de 07:47. Temps négatifs au classement. `PLAN_TERRAIN.cp1` part de 07:38 pour les deux épreuves alors que les départs sont échelonnés. |
| 2 | Ligne de matrice « réinitialisation sans rôle propriétaire » non testée | **high** | Vérifié : ni `RoleProprietaireManquant` ni `DATABASE_OWNER_URL` n'apparaissent dans `seed.test.ts`. Échec d'audit de matrice — bloquant par règle du workflow. |
| 3 | Neutralisation des emails hors `try/finally` | **medium** | Vérifié : dernière instruction du chemin nominal. Toute exception laisse les lignes en `pending`, et `.env.example` promet qu'aucun message ne peut partir. Impact réel atténué : `.invalid` ne résout pas, donc rien n'atteindrait une boîte — mais la promesse écrite est fausse. |
| 4 | `affectationsCreees`, `avertissements`, `heure_depart` jamais assertés | **medium** | Vérifié : absents de `seed.test.ts`. Perdre toutes les affectations, tous les passages ou toutes les heures de départ ne ferait échouer aucun test (`toBeGreaterThan(0)` survit à la perte des trois quarts des données). |
| 5 | `missionIdParTitre` clavetée sur le titre seul | **medium** | Vérifié : `new Map(etat.missions.map((m) => [m.titre, m.id]))`, alors que l'unicité SQL est `(secteur_id, titre)`. Aucune collision aujourd'hui, invariant ni documenté ni testé. |
| 6 | `continue` muets sur affectations et lots terrain | **medium** | Vérifié. Une cible introuvable est sautée sans trace ; le comité recevrait une édition sans couverture de mission, sans explication. |
| 7 | Preuve JPEG non décodable (en-tête + remplissage `0xAB`) | **medium** | L'écran de validation afficherait une image cassée — or valider un dossier est le geste que la recette doit permettre d'exercer. |
| 8 | `rienACreer` ignore `dossiersValides` / `dossiersRefuses` | **medium** | Vérifié. Une reprise annoncerait « rien à créer » tout en décidant des dossiers. |
| 9 | Clôture des inscriptions non gardée | **medium** | `submitInscription` refuse après `registration_closes_at` (2027-03-16). Erreur brute au lieu d'un message nommé. |
| 10 | Purge : aucune garde si elle n'efface rien | **medium** | Le propriétaire a `BYPASSRLS` sur Supabase (vérifié : `rolbypassrls = t`) et en local. Si un hôte futur ne l'accorde pas, la purge supprimerait zéro ligne en annonçant « base déjà vierge ». |
| 11 | Dérive des listes de purge non détectée | **medium** | Les deux listes couvrent exactement les 30 tables actuelles. C'est leur dérive future qui n'est pas protégée. |
| 12 | `readDatabaseOwnerUrl() ?? ownerUrl` inatteignable, commentaire faux | **low** | Vérifié : `readDatabaseOwnerUrl()` renvoie la variable verbatim. Aucune normalisation. |
| 13 | `vi.unstubAllEnvs()` hors `afterEach` | **low** | Un échec d'assertion laisse l'environnement pollué pour les cas suivants. |
| 14 | Commentaire de `telephoneFictif` contredit sa sortie ; une ligne de données mal formatée | **low** | Vérifié. Fichier dont le contrat affiché est la relecture d'un coup d'œil. |
| 15 | Absence d'appareils, abandons, annulations, positions | **defer** | Réel, mais la story ne les demande pas. Le comité ne pourra pas exercer les écrans PC course ni la carte. À arbitrer pour 8.4. |
| 16 | La purge efface la vitrine sans la resemer | **defer** | `sponsor`, `temoignage`, configs vitrine effacés et jamais recréés. À documenter ou à semer. |
| 17 | Fichiers de preuve orphelins après purge | **defer** | Sans conséquence fonctionnelle ; à surveiller face au plafond de 1 Go. |
| 18 | Fabrique `getDbClient()` non réutilisée par les CLI du seed | **false** | Les CLI de courte vie gardent leur connexion propre : c'est la frontière posée par la story 8.1, pas un oubli. |


### Résolution (passe 1)

Les quatorze trouvailles **high / medium / low** sont traitées ; les trois **defer**
et le **false** restent tels quels.

- **1** — `PLAN_TERRAIN` exprime désormais chaque lot en `minutesDepuisDepart`,
  relatif au départ de l'épreuve DU COUREUR (les jetons portent leur épreuve).
  Strictement positif pour les passages ; seul le retrait précède le départ.
  Revérifié par requête sur la base seedée : écart minimal +38 min (longue),
  +47 min (moyenne), **0 passage avant départ**.
- **2** — cas « réinitialisation sans rôle propriétaire » ajouté dans
  `describe('seed — CLI hors base')`, sur le modèle du cas voisin.
- **3** — neutralisation en entrée de run (rattrapage d'un run interrompu) ET dans
  un `finally` ; le peuplement est extrait dans `peupler()` pour rendre le `finally`
  lisible.
- **4** — `affectationsCreees` dérivé d'`AFFECTATIONS_FICTIVES`, `GROUP BY type` sur
  `terrain_evenement` conforme à `PLAN_TERRAIN` avec `checkpoint_id` non nul sur les
  passages, `heure_depart` non nulle et distincte sur les deux épreuves,
  `heuresDepartEffacees` asserté à la purge, comptes à zéro sur TOUTES les tables
  purgées, et `avertissements` exigé à exactement un élément (celui de la story 8.2) —
  tout saut de cible fait donc échouer la suite.
- **5** — clé `secteurId|titre` partout ; `AFFECTATIONS_FICTIVES` porte le secteur de
  chaque mission.
- **6** — chaque `continue` pousse un avertissement nommant la cible manquée.
- **7** — la preuve est un **PDF d'une page de 805 octets**, table `xref` calculée,
  portant « RECU DE VERSEMENT CCP — DOCUMENT FICTIF ». Validé en rendu réel
  (Quick Look / CoreGraphics), pas seulement par `detectProofFormat`.
- **8** — `rienACreer` inclut `dossiersValides`, `dossiersRefuses` et
  `emailsNeutralises`.
- **9** — `InscriptionsFermeesError`, levée à la première création nécessaire (un
  rejeu sur base peuplée reste donc possible après la clôture), message portant le
  `UPDATE` de contournement.
- **10** — `PurgeSansEffetError` : purge sans effet + rôle sans SUPERUSER ni
  BYPASSRLS → échec explicite. La détection passe par `pg_roles`, un `SELECT` de
  contrôle étant filtré par les mêmes politiques.
- **11** — test comparant l'union des deux listes à `information_schema.tables`, dans
  les deux sens. Il a trouvé un défaut réel dès sa première exécution : `invitation`,
  listée à la purge, est supprimée par la migration 0035 — entrée retirée.
- **12** — simplifié ; le commentaire dit maintenant la vraie raison d'exiger la
  variable (ne pas purger sur une URL devinée par `readDatabaseOwnerUrl`).
- **13** — `vi.unstubAllEnvs()` dans `afterEach`.
- **14** — commentaire de `telephoneFictif` corrigé, ligne « Nadia Lamrioui »
  reformatée.


## Verification

**Commands:**
- `bash scripts/dev-db.sh reset && bash scripts/dev-db.sh up` -- base vierge
- `pnpm -F @azzel/web db:migrate` -- schéma en place
- `pnpm -F @azzel/web seed` puis `pnpm -F @azzel/web seed` -- attendu : la seconde exécution ne crée rien
- `pnpm -F @azzel/web seed:reset && pnpm -F @azzel/web seed` -- attendu : cycle complet sans erreur
- `pnpm typecheck && pnpm build` -- attendu : aucune erreur
- `AZZEL_REQUIRE_DB=1 pnpm test` -- attendu : suite complète au vert, aucun test préexistant modifié
