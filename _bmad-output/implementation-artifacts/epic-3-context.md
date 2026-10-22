# Epic 3 Context: Armer les volontaires

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à l'organisation d'armer ses 150–200 volontaires sans saisie manuelle : import Excel avec invitations par email et rapport ligne par ligne, découpage de l'édition en secteurs et missions typées avec état de couverture, fiche mission hors-ligne dans la poche de chaque volontaire, et préchargement de l'annuaire des coureurs sur les appareils scanneurs. Cette épopée pose le socle terrain dont dépend le chronométrage offline (épopée 4) : sans PWA volontaires installée ni annuaire local, le scan en zone blanche est impossible. Le tout doit être sec pour le dry-run pré-course.

## Stories

- Story 3.1: Import Excel des volontaires et invitations
- Story 3.2: Secteurs et missions typées
- Story 3.3: Fiche mission hors-ligne (PWA volontaires)
- Story 3.4: Préchargement de l'annuaire des coureurs

## Requirements & Constraints

- Import volontaires : fichier Excel (nom, email, téléphone) ; lignes valides → volontaires créés, lignes invalides → rejet avec rapport ligne par ligne — **jamais d'import silencieux**. Chaque volontaire reçoit une invitation (file d'envoi avec rejeu, échec SMTP non bloquant) et définit son mot de passe à la première connexion.
- Secteurs et missions : types fermés (scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication) ; chaque mission affiche son état **couverte / vacante** (côté admin et côté volontaire) ; une affectation créant un chevauchement horaire pour un volontaire déclenche un avertissement **non bloquant**.
- Fiche mission : secteur, rôle, horaires, contacts, consignes — préchargée **à l'affectation**, consultable application fermée et réseau absent. Offline-first radical : aucune fonction critique ne dépend du réseau.
- Annuaire coureurs : réplique locale de toute l'édition (dossards, identité) avant le départ ; l'état de préchargement (« annuaire prêt — N coureurs ») est visible et annoncé au lecteur d'écran ; un coureur absent de l'annuaire sera signalé « DOSSARD INCONNU » au scan (consommé par l'épopée 4).
- Sessions : session interactive unique par compte, tous rôles (une nouvelle connexion révoque les anciennes) ; la PWA scanneuse, installation productrice d'événements, détient un jeton d'appareil dédié au canal sync, révocable séparément — la boîte d'envoi ne meurt jamais d'une connexion ouverte ailleurs.
- Accessibilité terrain : cibles ≥ 48 dp / 44 pt, gap ≥ 8 px entre cibles, frappe ≥ 15 px sur contenus critiques, aucune dépendance au survol (Android entrée de gamme), lecture confortable une colonne.
- UI en français ; code et identifiants en anglais.

## Technical Decisions

- Le portail volontaires vit dans `apps/web` (Next.js 16) en **PWA offline installable** (iOS Safari inclus) ; les écrans d'import et de gestion des secteurs/missions vivent côté admin. Modules backend : `missions` (secteurs, volontaires, affectations), `iam` (invitations, comptes), annuaire côté `chrono`.
- Frontières de données : ÉDITION → SECTEUR → MISSION, MISSION affectée à VOLONTAIRE ; `organisation_id` descend dans chaque table métier, isolation par RLS Postgres (contrainte structurelle, jamais de filtrage applicatif seul).
- Le contrat inter-apps vit **uniquement dans `packages/shared`**, versionné : schéma de la réplique annuaire, format du payload QR e-dossard (jeton unique édition, **jamais le dossard nu**), clé naturelle du Passage `(édition, coureur, checkpoint)` — jamais réinventés localement.
- Stockage local web : IndexedDB pour l'annuaire répliqué versionné et la fiche mission préchargée ; paradigme « l'appareil propose, le serveur dispose ».
- Identité visuelle : la PWA volontaires est une surface **terrain/jour J** → utiliser les `operationsTokens` (Vert Djurdjura) déjà exportés par `packages/shared`, pas les `siteTokens` de la charte vitrine.
- Erreurs API : enveloppe unique définie dans `shared` (message + action à faire, jamais de code brut) ; horodatages ISO 8601 UTC stockés, affichage en heure locale.

## UX & Interaction Patterns

- Fiche mission : carte une colonne — secteur, rôle, horaires, contact PC cliquable (`tel:`), consignes en listes courtes ; le scan QR n'apparaît que comme une mission parmi d'autres.
- Mode sombre : proposé à la première ouverture de la PWA (préparation la veille, départs à l'aube) ; bascule visible en en-tête, choix mémorisé.
- Import côté admin : rapport ligne par ligne succès/erreurs ; avertissement de chevauchement à l'affectation ; aucune mission vacante au soir du jour J-1 (objectif opérationnel).
- Voice & tone : **tutoiement** côté volontaire ; libellés concrets et actionnables, les chiffres et les verbes priment sur les adjectifs.
- Bouton d'assistance « Appeler l'équipe » visible sur tout parcours qui peut coincer (canal humain, jamais une FAQ).
- Wireflow de référence pour la surface volontaires : `wireframes/flow-scan-2026-10-20` (étapes amont : invitation → missions → fiche hors-ligne).

## Cross-Story Dependencies

- 3.1 dépend de l'épopée 1 : socle multi-organisation + RLS (story 1.9), mécanisme email / file d'envoi du module iam (stories 1.2, 1.8).
- 3.2 dépend de 3.1 (volontaires existants) ; 3.3 dépend de 3.2 (la fiche est préchargée au moment de l'affectation).
- 3.4 dépend des coureurs à dossards attribués (épopée 1) ; son annuaire est **consommé par l'épopée 4** (moteur de scan, validation locale, états doublon/inconnu, sync) — respecter la version de contrat `shared`.
- L'épopée 4 greffera caméra plein écran, scan retrait/passages et outbox sync sur cette même PWA : ne rien verrouiller dans le shell (navigation, préchargement, thème) qui l'empêche.
