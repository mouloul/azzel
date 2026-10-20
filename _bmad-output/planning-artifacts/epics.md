---
status: final
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - ../prds/prd-Azzel-2026-10-19/prd.md
  - ../architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md
  - ../ux-designs/ux-Azzel-2026-10-20/DESIGN.md
  - ../ux-designs/ux-Azzel-2026-10-20/EXPERIENCE.md
---

# Azzel - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Azzel, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Inscription par email vérifié (code à usage) ; session unique par compte, tous rôles ; code expiré/erroné ne crée pas de compte.
FR-2: Formulaire d'inscription à l'édition (épreuve longue/moyenne, identité, urgence, taille de t-shirt requise) ; champs obligatoires bloquants ; clôture J-10 (16/03/2027).
FR-3: Acceptation décharge + règlement intérieur obligatoire, horodatée avec version du document.
FR-4: Télversement preuve de paiement CCP (image/PDF) ; validation/refus organisateur avec motif ; formats non conformes rejetés avec message clair.
FR-5: Checklist dossier self-service — statut de chaque pièce ; chaque pièce manquante nomme l'action à faire.
FR-6: Notifications de statut par email (reçu, validé, refusé avec motif).
FR-7: E-dossard QR hors-ligne haute définition, lisible après 30 jours de cache.
FR-8: Scan de retrait du dossard au guichet (marque « présent au départ », hors-ligne inclus) ; doublon = voyant.
FR-9: Import Excel volontaires (nom, email, téléphone) + invitations ; définition du mot de passe à la première connexion ; rapport ligne par ligne des rejets.
FR-10: Secteurs et missions typées (scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication) ; état couverte/vacante ; avertissement de chevauchement horaire (non bloquant).
FR-11: Fiche mission hors-ligne (secteur, rôle, horaires, contacts, consignes) préchargée à l'affectation, disponible app fermée/réseau absent.
FR-12: Préchargement de l'annuaire des coureurs de l'édition dans les appareils scanneurs ; scan d'un coureur inconnu = voyant rouge explicite.
FR-13: Scan de passage offline (e-dossard → checkpoint, horodatage local, validation contre annuaire local) ; confirmation < 1 s (bip + voyant) ; doublon même coureur/checkpoint = voyant rouge, Passage non dupliqué.
FR-14: Sync par lots idempotente au retour du réseau (clé appareil+checkpoint+coureur) ; zéro Passage perdu au soir ; dédoublonnage cross-appareils : premier Passage reçu par checkpoint compte, suivants archivés pour audit.
FR-15: Classements par épreuve (scratch ; sexe/catégories d'âge `[ASSUMPTION: à confirmer]`) avec départs échelonnés ; un coureur n'apparaît que dans son épreuve.
FR-16: Résultats en direct sur la vitrine ; URLs partageables ; jamais de classement partiel incohérent ; paramètre de suivi anonyme (SM-5).
FR-17: Saisie des abandons (coureur, lieu, motif, heure) ; le coureur sort des calculs en cours, reste dans les rapports.
FR-18: Capture et envoi des positions opt-in (5–10 min, précision équilibrée), cache hors-ligne, envoi en lot au retour réseau ; tracking désactivé n'enregistre rien.
FR-19: Carte interactive publique — dernière position connue des coureurs opt-in sur tracé GPX + checkpoints ; identification par numéro de dossard uniquement ; positions > 1 h `[ASSUMPTION]` estompées.
FR-20: Pédagogie batterie (charge 100 %, tueur d'applications, powerbank) avec rappel J-7.
FR-21: Page course publique sans compte (dates, épreuves, parcours GPX, dénivelés, horaires, ravitaillements, consignes sécurité) ; mention « sous l'égide de la fédération et du ministère des sports » ; budget < 300 Ko / rendu < 5 s en 3G / GPX différé `[ASSUMPTION sur seuils]`.
FR-22: Bloc sponsors configurable option A (unique, signature) / option B (multiples, sans exclusivité) ; bascule sans dev.
FR-23: Infos pratiques et annexes éditables par l'admin (hébergement, restauration, région, événements annexes).
FR-24: Tableau de bord live admin : retraits, partants par épreuve, en course, arrivés, abandonnés, passages par checkpoint ; fraîcheur = dernière sync, affichée.
FR-25: Alertes hors-délais (barrière horaire non franchie) `[ASSUMPTION: + batterie < 15 % — Should]`.
FR-26: Rapports chiffrés post-course (inscrits, présents, passages, arrivées, abandons, portée partages) en un fichier ; export « commande » à J-10 (décomptes par épreuve et taille de t-shirt).
FR-27: Isolation des données par organisation (triplet organisation → événement → édition) dès la V1 ; seconde organisation sans changement de schéma.

### NonFunctional Requirements

NFR-1: Performance scan — confirmation < 1 s par coureur, qualifiée sur le fallback iOS Safari (@zxing/browser).
NFR-2: Performance vitrine — premier chargement < 300 Ko, premier rendu lisible < 5 s sur 3G lent, tracé GPX en chargement différé.
NFR-3: Fiabilité sync — 100 % des Passages synchronisés au soir de la course, zéro perdu (SM-2) ; sync idempotente.
NFR-4: Intégrité classements — un rafraîchissement n'expose jamais de classement partiel incohérent.
NFR-5: Transparence fraîcheur — toute donnée live affiche sa fraîcheur (« synchronisé il y a X min »).
NFR-6: Durabilité e-dossard — QR lisible après 30 jours de cache, sans réseau.
NFR-7: Vie privée canaux publics — identifiants exposés : numéro de dossard qualifié par édition et position ; jamais nom, contact, photo.
NFR-8: Offline-first radical — aucune fonction critique ne dépend du réseau (scan, fiche mission, e-dossard, positions).
NFR-9: Sécurité auth — session interactive unique par compte (tous rôles) ; jeton d'appareil dédié au canal sync, révocable séparément ; limitation de rythme sur l'envoi des codes.
NFR-10: Budget d'exploitation proche de zéro — free tier Supabase (Postgres 500 Mo, storage 1 Go, realtime 200 conn./2 M msgs/mois), VPS + Coolify, SMTP custom.
NFR-11: Accessibilité — contrastes AA+ dans les deux modes, frappe ≥ 15 px sur contenus critiques, cibles ≥ 48 dp/44 pt, zoom 200 %, prefers-reduced-motion, jamais la couleur seule.
NFR-12: Langue — UI en français, code et identifiants en anglais.

### Additional Requirements

- **Structural Seed (scaffold du premier commit)** : monorepo pnpm `apps/web` (Next.js 16.4.2), `apps/runners` (Expo SDK 58 / RN 0.88, dev build — pas Expo Go), `packages/shared` (types domaine, client sync, validation, constantes) — le monorepo et `shared` existent dès le premier commit.
- Stack verrouillée : Node ^22.13 || ^24.3 || ≥26 ; React 19.3.x unique workspace ; @zxing/browser 0.2.1 (fallback QR toujours actif sur iOS) ; Supabase cloud free tier ; auto-hébergement Next.js + reverse proxy (Coolify ou équiv.).
- ER aux frontières verrouillées : ORGANISATION → EVENEMENT → EDITION → EPREUVE/COUREUR/SECTEUR → MISSION/VOLONTAIRE ; COUREUR → PASSAGE (horodaté par CHECKPOINT) / POSITION ; COMPTE → SESSION ; `organisation_id` sur chaque table métier (RLS Postgres).
- Modules : `inscriptions`, `chrono`, `missions`, `tracking`, `vitrine`, `admin`, `iam` (Capability → Architecture Map).
- AD-2 : outbox append-only locale (IndexedDB web / SQLite natif) + lots idempotents ; « l'appareil propose, le serveur dispose ».
- AD-3 : arbitrage serveur — premier Passage reçu par checkpoint fait foi, suivants archivés (audit), neutres classement ; heures de départ officielles côté serveur ; scan au départ = contrôle de présence, jamais référence horaire de classement.
- AD-5 : session unique + jeton d'appareil (« la boîte d'envoi ne meurt jamais d'une connexion ouverte ailleurs ») ; mécanisme auth précis (Supabase Auth vs jetons maison) décidé à l'implémentation du module `iam`.
- AD-7 : canaux publics via backend Next.js (cache + SSE/polling) — jamais de lecture directe Supabase realtime depuis les navigateurs publics ; realtime réservé au portail admin.
- AD-8 : le QR encode un jeton unique édition (pas le dossard nu), résolu via annuaire répliqué ; correction d'un Passage erroné uniquement par annulation auditable côté admin.
- Emails : code UUID à expiration courte, limitation de rythme, file d'envoi avec rejeu (notifications FR-6, rappel J-7, invitations volontaires).
- Fichiers preuves : compression/redimensionnement côté client avant upload, cible ≤ 300 Ko l'unité.
- Conventions transverses : enveloppe d'erreur unique définie dans `shared` ; horodatages ISO 8601 UTC stockés, affichage local ; journal sync (lots, rejets, offsets horloge).
- Séquencement : 15/11/2026 → module `inscriptions` + vitrine minimale ; dry-run → cœur offline + PC ; 26/03/2027 → tout le Must.

### UX Design Requirements

UX-DR-1: Système de design tokens « Vert Djurdjura » — implémenter les tokens du frontmatter DESIGN.md (colors clair/sombre incl. 5 opérationnelles jour J avec encres, typography humaniste arrondie + mono meta 12 px / meta-lg 15 px / dossard 74 px, rounded 8/16/24/full, spacing 4–48) comme source unique (CSS vars web + theme RN).
UX-DR-2: Mode sombre optionnel partout — défaut préférence système, override mémorisé, bascule visible dans l'en-tête de chaque surface ; opérationnelles inversées testées.
UX-DR-3: Frise kabyle SVG monochrome sapin — seuils en tête/pied (vitrine, e-dossard), décorative, aria-hidden, jamais derrière du texte.
UX-DR-4: Glyphes piliers inline amazighs (ⵣ Yaz sport, tala santé, tabzimt citoyenneté, ingel écologie) — 20–24 px SVG discrets sur la vitrine ; jamais mascotte ni logo politique/sacré.
UX-DR-5: Citations kabyles aux points d'usage uniquement (batterie « Un point après l'autre… », départ/fin « Il franchit les cols… », ravitaillements « Aman d laman ») avec source Hanoteau 1867 — jamais groupées en section, jamais en zone critique.
UX-DR-6: Caméra scan plein écran PWA — viseur plein cadre, badges LIVE + heure sur voile ≥ 96 %, mission en cours en voile haut, dernier scan en pastille ; audio débloqué au tap « Démarrer le scan », vibration en 3e canal, deux mélodies distinctes doublon/inconnu.
UX-DR-7: Voyant scan — pill ≥ 96 px de haut plein cadre, texte ≥ 24 px graisse 800, heure mono ≥ 16 px ; succès / ↻ DÉJÀ PASSÉ (+ heure du premier passage) / ⚠ DOSSARD INCONNU (+ bouton appel PC direct) ; clignotement ≤ 1 flash/s ; aria-live assertive.
UX-DR-8: Bandeau sync visible — « ◷ N passages en attente » → « ✓ envoyés — file : 0 » + Journal sync en lecture seule (lots, rejets, offsets horloge).
UX-DR-9: E-dossard — carte sombre, numéro 74 px, « HORS-LIGNE PRÊT » mono, QR sur carte blanche coins 16 px, raccourci système recommandé (un geste écran verrouillé).
UX-DR-10: Checklist dossier — compteur de pièces, puce verte/lien action par pièce manquante, tout vert → bandeau « Dossier validé — dossard prêt », assistance visible.
UX-DR-11: Bouton assistance SM-C1 « Appeler l'équipe » — obligatoire dans l'enveloppe d'erreur, l'email de refus, la checklist incomplète, la vitrine (infos pratiques).
UX-DR-12: Tableau de bord live + lignes de board — agrégats par checkpoint, badge dossard mono, heure mono 15 px alignée droite, séparateurs pointillés, fraîcheur en pied, realtime sans flash complet ; alerte hors-délais clignotante (≥ 1 s de période) avec texte intégral + actions « Appeler le secteur » / « Saisir l'abandon ».
UX-DR-13: Carte publique — tracé GPX différé, checkpoints marqués, pastilles dossards anonymes, estompage > 1 h, « dernière position connue » affichée comme telle.
UX-DR-14: Vitrine « qui en jette » sans images lourdes — hero typographique + SVG/dégradés, une seule couleur de marque (sapin), bandeau égide toujours visible, bloc sponsors option A/B sans dev.
UX-DR-15: Vidéo trailer 1ʳᵉ édition (Should) — poster léger + lecture à la demande, jamais dans le chemin critique ; témoignages coureurs (Should) ; galerie photos lazy-load (Could).
UX-DR-16: Guide permission iOS « Autoriser une fois » — écran dédié chemin Réglages complet + bouton « Ouvrir les Réglages » ; permission refusée = suivi silencieusement inactif, aucune culpabilisation.
UX-DR-17: Pédagogie batterie — carte à puces concrètes + citation kabyle + rappel J-7 (email) ; alerte < 15 % (Should).
UX-DR-18: État permission caméra refusée/indisponible (PWA scan) — détection au premier lancement, écran dédié « Autoriser la caméra » avec chemin Réglages + assistance PC.
UX-DR-19: Saisie code email — champ unique inputmode numeric + autocomplete one-time-code, collage autorisé, validité affichée, renvoi avec compte à rebours ; code erroné/expiré = message clair sans création de compte.
UX-DR-20: Télversement preuve CCP — compression côté client ≤ 300 Ko avec feedback, rejet des formats avec message listant les formats acceptés, retry idempotent sans re-sélection, brouillon conservé, erreur doublée de l'assistance.
UX-DR-21: Enveloppe d'erreur unique — message homogène + action à faire, jamais de code brut, numéro d'assistance inclus.
UX-DR-22: Voice & Tone — tutoiement coureur/volontaire, sobre vitrine/admin ; libellés verbatim de la spine (ex. « HORS-LIGNE PRÊT — ton dossard marche sans réseau », « Classement provisoire — synchronisé il y a 3 min »).
UX-DR-23: Accessibility floor complet — focus visible 2 px action/action-sombre, zoom navigateur 200 % testé / pinch jamais désactivé, gap ≥ 8 px entre cibles, aucune action critique au bord, pause/stop scan ≥ 64 dp, icônes labellisées, décorations aria-hidden, reduced-motion → statique.
UX-DR-24: Responsive & plateforme — vitrine mobile-first une colonne (display réduit), app/PWA une colonne gros éléments tactiles, Android entrée de gamme (aucune dépendance au survol, motion dosé), iOS Safari PWA, écrans hétérogènes.

### FR Coverage Map

FR-1: Épopée 1 — Inscription email vérifié + session unique (iam)
FR-2: Épopée 1 — Formulaire d'inscription à l'édition, clôture J-10
FR-3: Épopée 1 — Décharge + règlement horodatés avec version
FR-4: Épopée 1 — Télversement preuve CCP, validation/refus avec motif
FR-5: Épopée 1 — Checklist dossier self-service
FR-6: Épopée 1 — Notifications de statut par email
FR-7: Épopée 4 — E-dossard QR hors-ligne (30 jours de cache)
FR-8: Épopée 4 — Scan de retrait, voyant doublon
FR-9: Épopée 3 — Import Excel volontaires + invitations
FR-10: Épopée 3 — Secteurs et missions, couverture, chevauchements
FR-11: Épopée 3 — Fiche mission hors-ligne
FR-12: Épopée 3 — Préchargement annuaire coureurs
FR-13: Épopée 4 — Scan de passage offline < 1 s
FR-14: Épopée 4 — Sync par lots idempotente, dédoublonnage cross-appareils
FR-15: Épopée 7 — Classements par épreuve, départs échelonnés
FR-16: Épopée 7 — Résultats en direct partageables, suivi anonyme
FR-17: Épopée 5 — Saisie des abandons (PC)
FR-18: Épopée 6 — Capture et envoi des positions opt-in
FR-19: Épopée 7 — Carte interactive publique anonyme (GPX, estompage)
FR-20: Épopée 6 — Pédagogie batterie + rappel J-7
FR-21: Épopée 2 — Page course publique < 300 Ko, égide
FR-22: Épopée 2 — Bloc sponsors option A/B sans dev
FR-23: Épopée 2 — Infos pratiques et annexes éditables
FR-24: Épopée 5 — Tableau de bord live, fraîcheur affichée
FR-25: Épopée 5 — Alertes hors-délais
FR-26: Épopée 7 — Rapports post-course + export « commande » J-10
FR-27: Épopée 1 — Schéma organisation_id + RLS dès la V1

## Epic List

### Epic 1: S'inscrire et boucler son dossier
Un coureur crée son accès (email + code, session unique), remplit le formulaire d'inscription à l'édition, accepte décharge et règlement horodatés, téléverse sa preuve CCP, suit sa checklist pièce par pièce et reçoit les notifications email. Inclut le scaffold du monorepo (apps/web, apps/runners, packages/shared), les design tokens Vert Djurdjura, le module iam et le socle de données multi-organisation (schéma + RLS).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-27

### Epic 2: Vitrine publique de l'édition
Tout visiteur découvre la course (dates, épreuves, parcours GPX, égide fédération/ministère, glyphes piliers, frises), les sponsors (option A signature / option B multiples, bascule sans dev) et les infos pratiques éditables — « qui en jette » en < 300 Ko. Livrée minimale (annonce) pour le 15/11/2026, complète pour le jour J.
**FRs covered:** FR-21, FR-22, FR-23

### Epic 3: Armer les volontaires
L'organisation importe les volontaires par Excel (rapport ligne par ligne), découpe l'édition en secteurs et missions typées (couverture, chevauchements) ; chaque volontaire définit son mot de passe et retrouve sa fiche mission hors-ligne ; les appareils scanneurs préchargent l'annuaire des coureurs.
**FRs covered:** FR-9, FR-10, FR-11, FR-12

### Epic 4: Chronométrage offline & e-dossard
Dossier validé = e-dossard QR prêt (hors-ligne, 30 jours) ; les guichets scannent le retrait (voyant doublon) ; les scanneurs enregistrent les passages en zone blanche (bip + voyant < 1 s, validation contre l'annuaire local) ; la sync par lots idempotente remonte tout au retour du réseau — « l'appareil propose, le serveur dispose ».
**FRs covered:** FR-7, FR-8, FR-13, FR-14

### Epic 5: Piloter la course au PC
Nadia suit le tableau de bord live (retraits, partants, en course, arrivés, abandonnés, passages par checkpoint, fraîcheur = dernière sync), reçoit les alertes hors-délais clignotantes, saisit les abandons (lieu, motif, heure) et annule de façon auditable les passages erronés.
**FRs covered:** FR-17, FR-24, FR-25

### Epic 6: App coureurs & suivi GPS
Yacine installe l'app native (Expo — stores + repli APK), y retrouve dossier et e-dossard, active le tracking opt-in (5–10 min, précision équilibrée), passe le piège iOS « Autoriser une fois » (guide Réglages), reçoit la pédagogie batterie et le rappel J-7 ; tracking désactivé n'enregistre rien.
**FRs covered:** FR-18, FR-19 (capture), FR-20

### Epic 7: La course visible de l'extérieur
Classements par épreuve (départs échelonnés), résultats en direct partageables (jamais incohérents, suivi anonyme compté), carte publique anonyme (tracé GPX, pastilles dossards, positions > 1 h estompées) et rapports chiffrés post-course pour le directoire + export « commande » J-10.
**FRs covered:** FR-15, FR-16, FR-19 (affichage public), FR-26

## Epic 1: S'inscrire et boucler son dossier

Un coureur crée son accès (email + code, session unique), remplit le formulaire d'inscription à l'édition, accepte décharge et règlement horodatés, téléverse sa preuve CCP, suit sa checklist pièce par pièce et reçoit les notifications email. Inclut le scaffold du monorepo (apps/web, apps/runners, packages/shared), les design tokens Vert Djurdjura, le module iam et le socle de données multi-organisation (schéma + RLS).

### Story 1.1: Fondation du monorepo

As a développeur bénévole de l'équipe Azzel,
I want un socle unique (monorepo pnpm, `apps/web` Next.js, `apps/runners` Expo, `packages/shared`, design tokens, conventions d'erreur),
So that tout pousse au même endroit dès le premier commit et le bus factor 1 reste gérable (sobriété + documentation).

**Acceptance Criteria:**

**Given** le dépôt fraîchement cloné avec Node ^22.13 || ^24.3
**When** `pnpm install && pnpm build`
**Then** `apps/web` (Next.js 16.4.2) build et sert une page racine française, `apps/runners` (Expo SDK 58, dev build) et `packages/shared` (TypeScript) compilent
**And** les tokens du frontmatter DESIGN.md (colors clair/sombre incl. opérationnelles, typography, rounded, spacing) sont implémentés en variables CSS + thème RN, source unique dans `shared` (UX-DR-1)
**And** la bascule clair/sombre suit la préférence système par défaut, override mémorisé (UX-DR-2) ; enveloppe d'erreur unique versionnée dans `shared` (UX-DR-21) ; horodatages ISO 8601 UTC stockés, affichage local.

### Story 1.2: Accès coureur par email + code, session unique

As a coureur,
I want créer mon accès avec mon email et un code de vérification à expiration courte,
So que mon compte soit protégé et que personne ne reste connecté à ma place sur un autre appareil.

**Acceptance Criteria:**

**Given** un email jamais utilisé
**When** je demande un code puis je le saisis correctement
**Then** mon compte est créé et je suis connecté ; le code est un UUID à expiration courte, envoyé via SMTP avec limitation de rythme (NFR-9)
**And** le champ de saisie est unique avec `inputmode="numeric"` + `autocomplete="one-time-code"`, collage autorisé, validité affichée, renvoi possible avec compte à rebours (UX-DR-19)
**And** un code erroné ou expiré ne crée aucun compte et affiche un message clair + action à faire
**And** toute nouvelle connexion révoque les sessions interactives antérieures du compte, tous rôles (FR-1, AD-5).

### Story 1.3: Formulaire d'inscription à l'édition

As a coureur,
I want m'inscrire à l'édition en choisissant mon épreuve et en saisissant mes informations,
So que mon dossard soit attribué sur des bases fiables et ma commande t-shirt exacte.

**Acceptance Criteria:**

**Given** mon accès créé (1.2)
**When** je soumets le formulaire d'inscription (épreuve longue/moyenne, identité, contact, urgence, taille de t-shirt)
**Then** la soumission incomplète est bloquée par les champs obligatoires ; la catégorie d'âge est dérivée (FR-2)
**And** la clôture à J-10 (16/03/2027) est configurable côté serveur : après échéance, la soumission est refusée avec message explicite
**And** la soumission crée uniquement les tables/lignes nécessaires (coureur rattaché à l'édition).

### Story 1.4: Acceptation décharge et règlement intérieur

As a coureur,
I want accepter la décharge de bonne santé et le règlement intérieur en ligne,
So que mon dossier soit juridiquement complet sans papier.

**Acceptance Criteria:**

**Given** le formulaire soumis (1.3)
**When** j'accepte les deux documents
**Then** chaque acceptation est horodatée avec la version du document (FR-3)
**And** toute soumission sans les deux acceptations est impossible.

### Story 1.5: Télversement de la preuve de paiement CCP

As a coureur,
I want déposer ma preuve de virement CCP compressée directement depuis mon téléphone,
So que mon dossier avance sans email ni papier.

**Acceptance Criteria:**

**Given** mon inscription soumise
**When** je sélectionne une image ou un PDF
**Then** compression/redimensionnement côté client ≤ 300 Ko avec feedback visible ; formats non image/PDF rejetés avant envoi avec message listant les formats acceptés (FR-4, UX-DR-20)
**And** en cas d'échec réseau : retry idempotent sans re-sélectionner le fichier, brouillon conservé localement, erreur doublée du bouton « Appeler l'équipe »
**And** la preuve est stockée dans le budget storage (1 Go free tier).

### Story 1.6: Validation ou refus du dossier par l'organisateur

As a organisateur,
I want valider ou refuser une preuve avec motif,
So que le coureur sache toujours où il en est, sans échange inutile.

**Acceptance Criteria:**

**Given** un dossier avec preuve déposée
**When** l'organisateur valide ou refuse
**Then** le refus exige un motif en champ libre court ; jamais de refus silencieux (FR-4)
**And** le motif remonte au coureur (email, 1.8) avec le numéro d'appel de l'équipe (UX-DR-11).

### Story 1.7: Checklist de dossier self-service

As a coureur peu à l'aise avec le numérique,
I want voir d'un coup d'œil ce qui manque dans mon dossier,
So que je sache exactement quoi faire sans appeler personne.

**Acceptance Criteria:**

**Given** mon espace coureur
**When** j'ouvre ma checklist (email vérifié, épreuve, décharge, règlement, preuve, validation)
**Then** chaque pièce manquante nomme l'action à faire en lien direct ; compteur de pièces affiché (FR-5, UX-DR-10)
**And** tout vert → bandeau « Dossier validé — dossard prêt » (libellé verbatim)
**And** le bouton d'assistance « Appeler l'équipe » reste visible sur l'écran (SM-C1, UX-DR-11).

### Story 1.8: Notifications de statut par email

As a coureur,
I want être informé par email des changements de statut,
So que je n'aie pas à vérifier le site tous les jours.

**Acceptance Criteria:**

**Given** un changement de statut (reçu, validé, refusé avec motif)
**When** le statut change
**Then** un email part via une file d'envoi avec rejeu (échec SMTP non bloquant) (FR-6)
**And** les libellés suivent la Voice and Tone de la spine (sobres, actionnables).

### Story 1.9: Socle multi-organisation (schéma + RLS)

As a créateur de la plateforme,
I want les données isolées par organisation dès la V1,
So que la location d'instances post-2027 ne demande aucun changement de schéma.

**Acceptance Criteria:**

**Given** le schéma métier des stories 1.2–1.8
**When** chaque table métier est créée ou reprise
**Then** `organisation_id` descend dans chaque table + politiques RLS Postgres actives (FR-27, AD-4)
**And** un test crée une seconde organisation avec son compte sans changement de schéma ni fuite de données entre instances.

## Epic 2: Vitrine publique de l'édition

Tout visiteur découvre la course (dates, épreuves, parcours GPX, égide fédération/ministère, glyphes piliers, frises), les sponsors (option A signature / option B multiples, bascule sans dev) et les infos pratiques éditables — « qui en jette » en < 300 Ko. Livrée minimale (annonce) pour le 15/11/2026, complète pour le jour J.

### Story 2.1: Page d'annonce publique minimale

As a visiteur sans compte,
I want découvrir le Trail d'Ait-Aissi (dates, épreuves, lieu, égide) et m'inscrire,
So que la course existe publiquement dès l'ouverture des inscriptions (jalon 15/11/2026).

**Acceptance Criteria:**

**Given** l'URL publique de la vitrine
**When** un visiteur l'ouvre sur une connexion 3G lente
**Then** le premier chargement pèse < 300 Ko et le premier rendu lisible arrive < 5 s (NFR-2, FR-21) ; hero typographique + SVG/dégradés, aucune webfont ni photo pleine largeur (UX-DR-14)
**And** la mention « Sous l'égide de la Fédération et du ministère des Sports » est toujours visible
**And** le CTA « S'inscrire » mène au parcours de l'épopée 1 ; contact « Appeler l'équipe » visible (SM-C1)
**And** squelettes de chargement calqués sur la mise en page finale ; GPX absent de cette page minimale.

### Story 2.2: Identité Village — piliers, frises, sombre

As a visiteur,
I want ressentir l'identité kabyle du village dans la page, sobrement,
So que la crédibilité et la chaleur se dégagent sans apparat ni folklore.

**Acceptance Criteria:**

**Given** la page d'annonce (2.1)
**When** la page s'affiche
**Then** les 4 piliers sport/santé/citoyenneté/écologie portent chacun un petit glyphe SVG inline 20–24 px monochrome sapin (ⵣ Yaz, tala, tabzimt, ingel), jamais de médaillon ni mascotte (UX-DR-4)
**And** frise kabyle monochrome sapin en seuils tête/pied, décorative, `aria-hidden`, jamais derrière du texte (UX-DR-3)
**And** mode sombre : défaut système, override mémorisé, bascule visible en en-tête (UX-DR-2) ; contrastes AA+ vérifiés dans les deux modes
**And** aucun symbole politique ou sacré détourné, le mot « Tafsut » n'apparaît nulle part comme label.

### Story 2.3: Bloc sponsors option A / option B

As a organisateur,
I want configurer le sponsoring retenu (sponsor unique ou plusieurs) sans développeur,
So que la vitrine absorbe le scénario Ifri (A) comme le repli (B).

**Acceptance Criteria:**

**Given** l'espace admin
**When** je configure l'option A (sponsor unique, emplacement signature) ou l'option B (plusieurs sponsors, sans exclusivité)
**Then** la vitrine reflète le choix immédiatement, bascule A→B sans développement (FR-22)
**And** en option A le nom du sponsor porte l'emplacement signature ; en option B les emplacements sont équivalents.

### Story 2.4: Parcours GPX, consignes et page région

As a coureur ou proche,
I want consulter le parcours, les ravitaillements, les consignes de sécurité et les infos pratiques de la région,
So que j'arrive préparé et en sécurité le jour J.

**Acceptance Criteria:**

**Given** la vitrine complète
**When** je consulte la page course
**Then** dates, épreuves (Longue ~35 km / Moyenne 10–15 km), dénivelés, horaires, ravitaillements et consignes de sécurité sont publics sans compte (FR-21) ; tracé GPX en chargement différé, jamais dans le chemin critique
**And** la page région porte la consigne sécurité « ne pas défier la montagne » (sagesse de la vieille de janvier) et la note écologie des singes sacrés du Jurjura, en contenu éditorial sobre
**And** l'admin édite hébergement, restauration, région et événements annexes sans développement (FR-23) ; citation « Aman d laman » réservée aux ravitaillements, source notée (UX-DR-5).

### Story 2.5: Vidéo trailer 1ʳᵉ édition & témoignages coureurs (Should)

As a visiteur,
I want voir la 1ʳᵉ édition en images et lire des coureurs,
So que la crédibilité de l'organisation se voie avant même la course.

**Acceptance Criteria:**

**Given** des images/vidéos de la 1ʳᵉ édition disponibles (question ouverte : matière à vérifier)
**When** la vitrine se charge
**Then** le trailer s'affiche en poster léger (dégradé + bouton lecture vert altitude ≥ 3:1) et ne charge qu'au clic — jamais d'autoplay, jamais dans le budget des 300 Ko initiaux (UX-DR-15)
**And** les témoignages (citations courtes + visage ou avatar initiales + édition de référence) sont sobres, jamais en carrousel automatique
**And** si la matière 1ʳᵉ édition manque, les deux blocs se désactivent proprement sans page cassée.

## Epic 3: Armer les volontaires

L'organisation importe les volontaires par Excel (rapport ligne par ligne), découpe l'édition en secteurs et missions typées (couverture, chevauchements) ; chaque volontaire définit son mot de passe et retrouve sa fiche mission hors-ligne ; les appareils scanneurs préchargent l'annuaire des coureurs.

### Story 3.1: Import Excel des volontaires et invitations

As a organisateur,
I want importer ma liste de volontaires et déclencher les invitations,
So que 150–200 villageois soient opérationnels sans saisie manuelle.

**Acceptance Criteria:**

**Given** un fichier Excel (nom, email, téléphone)
**When** l'admin lance l'import
**Then** les lignes valides créent les volontaires ; les lignes invalides sont rejetées avec rapport ligne par ligne — jamais d'import silentieux (FR-9)
**And** chaque volontaire reçoit une invitation (file d'envoi avec rejeu) et définit son mot de passe à la première connexion
**And** un volontaire importé est rattaché à l'organisation (RLS, story 1.9).

### Story 3.2: Secteurs et missions typées

As a organisateur,
I want découper l'édition en secteurs et y affecter des missions typées,
So que chacun sache exactement où se placer et quoi faire le jour J.

**Acceptance Criteria:**

**Given** des volontaires importés (3.1)
**When** l'admin crée secteurs et missions (types : scan checkpoint, accueil, sécurité tronçon, sécurité arrivée, distribution dossards, communication)
**Then** chaque mission affiche son état de couverture : couverte / vacante (FR-10)
**And** une affectation créant un chevauchement horaire pour un volontaire déclenche un avertissement non bloquant.

### Story 3.3: Fiche mission hors-ligne (PWA volontaires)

As a volontaire du village,
I want ma fiche mission dans ma poche, sans réseau, application fermée,
So que je sache où me placer, à quelle heure, et qui appeler le jour J.

**Acceptance Criteria:**

**Given** une mission affectée à Karim
**When** il ouvre la PWA volontaires (installable, iOS Safari inclus)
**Then** sa fiche (secteur, rôle, horaires, contacts, consignes) est préchargée à l'affectation et consultable réseau absent, app fermée (FR-11, NFR-8)
**And** les contacts PC sont cliquables (tel:) ; lecture confortable sur Android d'entrée de gamme (cibles ≥ 48 dp, frappe ≥ 15 px)
**And** le scan QR n'apparaît que comme une mission parmi d'autres.

### Story 3.4: Préchargement de l'annuaire des coureurs

As a scanneur volontaire,
I want l'annuaire des coureurs de l'édition dans mon téléphone avant le départ,
So que mes scans soient validés localement même en zone blanche.

**Acceptance Criteria:**

**Given** des coureurs aux dossards attribués
**When** l'appareil du scanneur se prépare (avant le départ)
**Then** l'annuaire de l'édition (dossards, identité) est répliqué en IndexedDB, versionné via `shared` (FR-12, AD-8)
**And** l'état de préchargement est visible (« annuaire prêt — N coureurs ») et annoncé au lecteur d'écran
**And** un coureur absent de l'annuaire sera signalé « DOSSARD INCONNU » au scan (consommé par l'épopée 4).

## Epic 4: Chronométrage offline & e-dossard

Dossier validé = e-dossard QR prêt (hors-ligne, 30 jours) ; les guichets scannent le retrait (voyant doublon) ; les scanneurs enregistrent les passages en zone blanche (bip + voyant < 1 s, validation contre l'annuaire local) ; la sync par lots idempotente remonte tout au retour du réseau — « l'appareil propose, le serveur dispose ».

### Story 4.1: E-dossard QR hors-ligne

As a coureur au dossier validé,
I want mon e-dossard QR disponible sans aucune connexion,
So que je le présente au guichet le jour J, zéro papier.

**Acceptance Criteria:**

**Given** un dossier validé (épopée 1)
**When** j'ouvre mon e-dossard
**Then** le QR s'affiche en haute définition, encodant le jeton unique édition (jamais le dossard nu), résolu via annuaire (FR-7, AD-8)
**And** le QR reste lisible après 30 jours de cache, réseau absent (NFR-6) ; carte blanche à coins 16 px, modules encre, quel que soit le mode
**And** badge « HORS-LIGNE PRÊT » + raccourci système recommandé (widget/quick settings) accessible en un geste écran verrouillé (UX-DR-9).

### Story 4.2: Moteur de scan caméra et états de retour

As a volontaire scanneur,
I want une caméra plein écran qui me confirme chaque scan immédiatement,
So que je garde les yeux sur la course, pas sur l'écran.

**Acceptance Criteria:**

**Given** la PWA volontaires avec annuaire chargé (3.4)
**When** je tape « Démarrer le scan »
**Then** l'audio est débloqué par ce premier geste ; lecture via BarcodeDetector avec fallback @zxing/browser toujours actif sur iOS Safari (NFR-1)
**And** chaque scan retourne en < 1 s : bip (mélodies distinctes succès/doublon/inconnu) + vibration + texte intégral ; voyant en `aria-live="assertive"` avec `role="status"` (UX-DR-6, UX-DR-7)
**And** permission caméra refusée ou caméra indisponible → détection au premier lancement, écran dédié « Autoriser la caméra » avec chemin Réglages complet + bouton assistance PC (UX-DR-18)
**And** voile quasi opaque ≥ 96 % derrière tout texte du cadre ; badges « · LIVE » + heure locale + mission en cours.

### Story 4.3: Scan de retrait du dossard

As a volontaire au guichet de retrait,
I want scanner l'e-dossard pour marquer le coureur « présent au départ »,
So que ~700 retraits le jour J passent en express, sans fichier papier.

**Acceptance Criteria:**

**Given** le moteur de scan (4.2) et des e-dossards validés
**When** je scanne un coureur au guichet
**Then** le retrait est enregistré hors-ligne, marqué « présent au départ » (FR-8)
**And** un second scan du même coureur affiche le voyant doublon « ↻ DÉJÀ PASSÉ » avec l'heure du premier retrait — aucun enregistrement dupliqué.

### Story 4.4: Scan de passage aux checkpoints

As a scanneur en zone blanche,
I want enregistrer chaque passage sans réseau et sans erreur,
So que le chrono de la course soit complet et fiable au soir.

**Acceptance Criteria:**

**Given** le moteur de scan (4.2) et l'annuaire local (3.4)
**When** un coureur franchit mon checkpoint
**Then** le Passage (e-dossard → checkpoint, horodatage local, validation contre l'annuaire) est confirmé en < 1 s : « ✓ Passage enregistré — dossard 217 · 10:42:07 » (FR-13, NFR-1)
**And** doublon même coureur/même checkpoint → « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », Passage non dupliqué ; inconnu → « ⚠ DOSSARD INCONNU — revérifier » + bouton « Appeler le PC » direct
**And** voyant : pill ≥ 96 px plein cadre, texte ≥ 24 px graisse 800, heure mono ≥ 16 px, clignotement ≤ 1 flash/s ; icônes et positions différencient doublon/inconnu (UX-DR-7).

### Story 4.5: Synchronisation par lots idempotente

As a volontaire qui aperçoit du réseau à 14 h,
I want que tout ce que j'ai scanné remonte sans doublon,
So que le soir, la course est complète — « 217 passages en attente → envoyés ».

**Acceptance Criteria:**

**Given** des Passages/Retraits dans l'outbox locale (IndexedDB, append-only, AD-2)
**When** le réseau revient
**Then** l'envoi se fait par lots idempotents (clé naturelle appareil+checkpoint+coureur) — le rejeu ne crée jamais de doublon visible (FR-14, NFR-3)
**And** bandeau sync toujours visible : « ◷ N passages en attente » → « ✓ envoyés — file : 0 » ; journal sync (lots, rejets, offsets horloge) consultable en lecture seule (UX-DR-8)
**And** l'arbitrage est serveur : premier Passage reçu par checkpoint fait foi pour le classement, les suivants archivés pour audit, neutres ; jamais de suppression locale ni de temps « définitif » côté appareil (AD-3)
**And** la boîte d'envoi survit à une session révoquée (jeton d'appareil dédié, AD-5).

## Epic 5: Piloter la course au PC

Nadia suit le tableau de bord live (retraits, partants, en course, arrivés, abandonnés, passages par checkpoint, fraîcheur = dernière sync), reçoit les alertes hors-délais clignotantes, saisit les abandons (lieu, motif, heure) et annule de façon auditable les passages erronés.

### Story 5.1: Tableau de bord live du PC course

As a organisatrice au PC,
I want suivre la course en direct avec des chiffres dont je connais la fraîcheur,
So que je décide sur du fiable, jamais sur du figé présenté comme vivant.

**Acceptance Criteria:**

**Given** des retraits et passages synchronisés (épopée 4)
**When** Nadia ouvre le tableau de bord
**Then** retraits, partants par épreuve, en course, arrivés, abandonnés et passages par checkpoint s'affichent (FR-24) ; rafraîchissement realtime réservé à cette surface, sans flash complet de la page
**And** la fraîcheur (« synchronisé il y a X min ») est accolée aux chiffres en toutes circonstances, y compris réseau dégradé (NFR-5)
**And** lignes de board live : tri par heure de passage décroissante, badge dossard mono, heure mono 15 px alignée à droite, séparateurs pointillés, non cliquables en V1 (UX-DR-12)
**And** réseau dégradé → les chiffres restent affichés avec leur fraîcheur, les alertes émises restent visibles.

### Story 5.2: Alertes hors-délais

As a organisatrice au PC,
I want être alertée quand un coureur n'a pas franchi un checkpoint avant sa barrière horaire,
So que la sécurité des coureurs ne repose pas sur la vigilance humaine seule.

**Acceptance Criteria:**

**Given** des barrières horaires configurées par checkpoint (question ouverte PRD n°1 : nombre/seuils)
**When** un coureur attendu n'a pas franchi le checkpoint avant sa barrière
**Then** une alerte s'affiche en bloc danger clignotant (période ≥ 1 s), avec texte intégral : coureur, checkpoint, barrière (FR-25, UX-DR-12)
**And** actions directes : « Appeler le secteur » (contact de la mission) et « Saisir l'abandon »
**And** l'alerte batterie < 15 % des coureurs opt-in tracking est balisée `[ASSUMPTION: Should — à confirmer]`
**And** clignotement désactivé sous `prefers-reduced-motion` (le texte intégral porte alors seul l'alerte).

### Story 5.3: Saisie des abandons

As a organisatrice ou volontaire de secteur,
I want saisir un abandon en trois champs,
So que le coureur sorte proprement des calculs et que sa sécurité soit tracée.

**Acceptance Criteria:**

**Given** un coureur en course
**When** un abandon est saisi (coureur, lieu, motif, heure locale)
**Then** le coureur sort des calculs de classement en cours et reste dans les rapports (FR-17)
**And** abandons concurrents (PC et secteur) : les premiers reçus serveur gagnent (AD-3)
**And** l'heure est convertie en local à l'affichage (convention horodatage).

### Story 5.4: Annulation auditable des passages

As a organisatrice au PC,
I want corriger un passage erroné (mauvais scan, mauvais coureur),
So que le chrono reste juste sans jamais effacer l'historique.

**Acceptance Criteria:**

**Given** un Passage synchronisé erroné
**When** Nadia l'annule depuis l'admin
**Then** l'annulation est auditable : auteur, horodatage, motif tracés ; le Passage reste archivé, neutre pour les classements (AD-8)
**And** aucune surface (PWA, app, admin) ne permet une suppression de Passage — seule l'annulation tracée existe.

## Epic 6: App coureurs & suivi GPS

Yacine installe l'app native (Expo — stores + repli APK), y retrouve dossier et e-dossard, active le tracking opt-in (5–10 min, précision équilibrée), passe le piège iOS « Autoriser une fois » (guide Réglages), reçoit la pédagogie batterie et le rappel J-7 ; tracking désactivé n'enregistre rien.

### Story 6.1: Installation et onboarding de l'app native

As a coureur,
I want installer l'app Azzel et y retrouver mon dossier,
So que tout tienne dans ma poche le jour J.

**Acceptance Criteria:**

**Given** un compte coureur actif (épopée 1)
**When** Yacine installe l'app (Play Store / App Store — soumission anticipée ; repli Android : APK sideload documenté)
**Then** il se connecte avec le même email + code (session unique s'applique, AD-5)
**And** l'app est une dev build Expo SDK 58 (expo-location), pas Expo Go
**And** dossier et e-dossard sont retrouvés ; dossier déjà vert → accès direct à l'e-dossard, étapes court-circuitées.

### Story 6.2: Activation du suivi GPS opt-in

As a coureur,
I want activer le suivi pour que mes proches me voient avancer,
So que ma course soit suivie sans sacrifier ma batterie.

**Acceptance Criteria:**

**Given** l'app installée (6.1)
**When** j'active le tracking (opt-in explicite)
**Then** positions capturées toutes les 5–10 min en « précision équilibrée », stockées en cache hors-ligne, envoyées en lot au retour réseau (FR-18, AD-2)
**And** « Désactivé : rien n'est enregistré » est littéral — aucun enregistrement à l'insu (anonymat & vie privée)
**And** la fréquence n'est jamais augmentée pour embellir la carte au prix de la batterie (SM-C2).

### Story 6.3: Guide permission iOS « Autoriser une fois »

As a coureur sur iPhone,
I want être guidé quand le suivi s'arrête à cause de la permission « Autoriser une fois »,
So que mon suivi reste actif sans que j'aie à deviner pourquoi il a coupé.

**Acceptance Criteria:**

**Given** le tracking activé et une permission localisation iOS expirée (« Autoriser une fois »)
**When** je rouvre l'app ou reviens au premier plan
**Then** l'app détecte l'état et affiche l'écran guide : chemin complet « Réglages > Azzel > Localisation > Toujours » en exergue + bouton « Ouvrir les Réglages » (UX-DR-16)
**And** permission refusée → suivi silencieusement inactif, aucune culpabilisation ; guide toujours accessible depuis l'app
**And** le rétablissement de la permission relance le suivi sans manipulation supplémentaire.

### Story 6.4: Pédagogie batterie et rappel J-7

As a coureur,
I want savoir comment préserver ma batterie le jour J,
So que mon suivi et mon e-dossard tiennent jusqu'à l'arrivée.

**Acceptance Criteria:**

**Given** l'app installée
**When** j'active le suivi ou j'ouvre la rubrique batterie
**Then** la carte à puces affiche : partir à 100 %, ne pas tuer l'application, powerbank (en vente au village), conclue par la citation « Un point après l'autre, et l'ouvrage est parfait » avec source Hanoteau 1867 (FR-20, UX-DR-5/17)
**And** à J-7, un email de rappel part (file d'envoi avec rejeu) avec bouton vers l'app
**And** l'alerte batterie < 15 % côté coureur est balisée `[ASSUMPTION: Should — à confirmer]`.

## Epic 7: La course visible de l'extérieur

Classements par épreuve (départs échelonnés), résultats en direct partageables (jamais incohérents, suivi anonyme compté), carte publique anonyme (tracé GPX, pastilles dossards, positions > 1 h estompées) et rapports chiffrés post-course pour le directoire + export « commande » J-10.

### Story 7.1: Classements par épreuve et départs échelonnés

As a proche, média ou fédération,
I want des classements justes par épreuve,
So que chaque coureur soit comparé à sa course réelle.

**Acceptance Criteria:**

**Given** des Passages arbitrés serveur (épopée 4) et des heures de départ officielles configurées côté serveur
**When** les classements sont calculés
**Then** chaque épreuve a son classement avec départs échelonnés gérés ; un coureur n'apparaît que dans le classement de son épreuve (FR-15)
**And** classement scratch + `[ASSUMPTION: par sexe et catégories d'âge — crédibilité fédération, à confirmer]`
**And** un rafraîchissement n'expose jamais de classement partiel incohérent (NFR-4)
**And** le scan au départ = contrôle de présence, jamais référence horaire de classement (AD-3).

### Story 7.2: Résultats en direct partageables

As a Malika depuis Tizi Ouzou,
I want suivre les résultats en direct et partager le lien,
So que toute la Kabylie vive la course en même temps.

**Acceptance Criteria:**

**Given** la vitrine publique (épopée 2)
**When** des Passages sont synchronisés
**Then** classements et passages se mettent à jour via SSE/polling servi par le backend — jamais de lecture directe Supabase realtime depuis les navigateurs publics (AD-7)
**And** les URLs de résultats sont partageables avec paramètre de suivi anonyme compté côté serveur (FR-16, SM-5) — aucune donnée personnelle
**And** affichage « Classement provisoire » en toutes lettres + fraîcheur ; état vide avant départ : « Pas encore de partants — départ à HH:MM ».

### Story 7.3: Carte publique anonyme

As a proche du coureur,
I want voir la dernière position connue sur le tracé officiel,
So que je suive la course sans exposer qui que ce soit.

**Acceptance Criteria:**

**Given** des positions émises par les coureurs opt-in (épopée 6)
**When** j'ouvre la carte publique
**Then** la dernière position connue de chaque coureur opt-in s'affiche sur le tracé GPX + checkpoints, identifiée par numéro de dossard qualifié par édition uniquement — jamais nom, contact ou photo (FR-19, NFR-7)
**And** les positions de plus d'une heure `[ASSUMPTION: X = 1 h]` sont estompées ; la dernière position connue est affichée comme telle
**And** le choix de bibliothèque cartographique (Leaflet vs MapLibre) est local au module vitrine ; la carte ne charge jamais dans le chemin critique 3G.

### Story 7.4: Rapports post-course et export « commande »

As a directoire de l'organisation,
I want le bilan chiffré complet de l'édition,
So que la réputation s'appuie sur des chiffres, et que rien ne soit commandé à l'aveugle.

**Acceptance Criteria:**

**Given** l'édition terminée
**When** l'admin exporte le rapport post-course
**Then** un fichier unique couvre l'édition complète : inscrits, présents, passages, arrivées, abandons, portée des partages (FR-26)
**And** à J-10, l'export « commande » fournit les décomptes validés par épreuve et par taille de t-shirt (médailles, t-shirts — zéro stock)
**And** le format d'export suit le choix local du module admin (question ouverte archi) ; les abandons y figurent (5.3).








