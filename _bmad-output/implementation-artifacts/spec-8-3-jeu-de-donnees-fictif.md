---
title: 'Story 8.3 — Jeu de données fictif « édition complète »'
type: 'feature'
created: '2026-11-01'
status: 'review'
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
- Le seed s'appuie sur l'ouverture des inscriptions de l'édition courante
  (`registration_closes_at`, 2027-03-16 pour l'édition 2027) : passée cette date,
  `submitInscription` refusera — il faudra repousser la clôture en base pour
  reseeder.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bash scripts/dev-db.sh reset && bash scripts/dev-db.sh up` -- base vierge
- `pnpm -F @azzel/web db:migrate` -- schéma en place
- `pnpm -F @azzel/web seed` puis `pnpm -F @azzel/web seed` -- attendu : la seconde exécution ne crée rien
- `pnpm -F @azzel/web seed:reset && pnpm -F @azzel/web seed` -- attendu : cycle complet sans erreur
- `pnpm typecheck && pnpm build` -- attendu : aucune erreur
- `AZZEL_REQUIRE_DB=1 pnpm test` -- attendu : suite complète au vert, aucun test préexistant modifié
