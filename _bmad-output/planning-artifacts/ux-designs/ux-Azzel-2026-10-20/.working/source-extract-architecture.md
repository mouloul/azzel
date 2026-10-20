# Extraction UX — ARCHITECTURE-SPINE.md (Azzel, 2026-10-19)

> Source : `_bmad-output/planning-artifacts/architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md` (status: final, updated 2026-10-20)
> Règle : capture seule, rien d'inventé ; noms verbatim.

## Stack front-end / frameworks UI

- **Next.js 16.4.2** — web + backend monolithe (`apps/web`) : vitrine publique, inscriptions/espace coureur web, portail volontaires (PWA scan QR offline), portail admin.
- **Expo SDK 58 / React Native 0.88 / expo-location 58.0.0** — app native coureurs (`apps/runners`) : tracking GPS arrière-plan, e-dossard, dossier. **Dev build requis — pas Expo Go.**
- **React 19.3.x** — version unique workspace (web + RN).
- **@zxing/browser 0.2.1** — fallback lecture QR, « toujours actif sur iOS — BarcodeDetector y est désactivé par défaut ».
- **pnpm workspaces** — monorepo `apps/web`, `apps/runners`, `packages/shared`.
- **Supabase cloud free tier** — Postgres 500 Mo · storage 1 Go · realtime 200 conn. / 2 M msgs/mois · SMTP custom OK.
- Hébergement web : VPS (IONOS/Hostinger), auto-hébergement Next.js + reverse proxy (Coolify ou équiv.).
- Pas de design system ni bibliothèque UI mentionnés.

## Système UI nommé

- Aucun système UI nommé (pas de shadcn/MUI/Compose/interne). Seul élément UI-adjacent : `BarcodeDetector` avec fallback `@zxing/browser`.

## Plateformes / multi-surface imposées par l'architecture

- **AD-1 — Plateforme double, frontières strictes** :
  - **Web (Next.js)** : vitrine publique, inscriptions/espace coureur web, portail volontaires (scan QR offline en **PWA**), portail admin.
  - **App native Expo (coureurs)** : tracking GPS arrière-plan, e-dossard, dossier.
- Contrainte de plateforme : « pas de GPS arrière-plan en PWA : iOS jamais, Android écran éteint » → justifie l'app native coureurs.
- Surfaces fonctionnelles (Capability → Architecture Map) :
  - Inscriptions & dossier (FR-1..6) → `apps/web`
  - E-dossard & retrait (FR-7, FR-8) → `apps/web` (PWA) + `apps/runners`
  - Portail volontaires (FR-9..12) → `apps/web` PWA offline
  - Chrono & résultats (FR-13..17) → PWA scan
  - Tracking GPS (FR-18..20) → `apps/runners`
  - Vitrine (FR-21..23) → `apps/web` public
  - Admin & PC (FR-24..26) → `apps/web`
- Terminaux : navigateurs publics (vitrine), mobiles scanneurs volontaires (PWA, iOS Safari inclus), smartphones coureurs (Android/iOS, distribution Play Store + App Store via EAS, « soumission anticipée » ; « repli Android : APK sideload »).

## Contraintes techniques impactant l'UX

- **Offline / sync (AD-2)** : PWA volontaires et app coureurs « ne décident jamais rien » ; événements (Passage, abandon, position) enregistrés dans une **outbox locale append-only** (IndexedDB web / SQLite natif), poussée « par lots idempotents quand le réseau revient ». « L'appareil propose, le serveur dispose. » → l'UX doit rendre visible l'état de la boîte d'envoi / la synchronisation.
- **Arbitrage serveur (AD-3)** : « l'ordre d'arrivée serveur tranche ; les horloges clientes n'ont jamais le dernier mot » — premier Passage reçu serveur compte, suivants archivés (audit) et neutres ; premiers Abandons concurrents gagnent ; « les Positions ne sont pas un classement : la dernière reçue par appareil fait foi ». Heures de départ officielles configurées côté serveur (départs échelonnés) ; scan au départ = contrôle de présence, jamais référence horaire de classement. → UX : pas de promesse de temps « définitif » côté appareil.
- **Scan QR** : `BarcodeDetector` si dispo, fallback `@zxing/browser` toujours actif sur iOS Safari ; « retour < 1 s visé, qualifié sur le fallback iOS » ; annuaire coureurs **préchargé en IndexedDB**.
- **Auth (AD-5)** : « session interactive unique par compte » — « toute nouvelle connexion révoque les sessions interactives antérieures du compte, tous rôles » ; chaque installation productrice d'événements (app coureurs avec tracking, PWA scanneuse) détient un **jeton d'appareil** dédié au canal sync, « révocable séparément par le compte — la boîte d'envoi ne meurt jamais d'une connexion ouverte ailleurs ». → UX : gérer l'expérience de révocation de session et la gestion des jetons d'appareil.
- **Auth & emails (convention)** : email + code unique généré en interne (UUID), SMTP propre, expiration courte, limitation de rythme, file d'envoi avec rejeu (notifications de statut FR-6, rappel J-7). Invitation volontaires : import Excel → premier login → mot de passe.
- **Fichiers preuves** : « compression/redimensionnement côté client avant upload, cible ≤ 300 Ko l'unité » (budget storage 1 Go). → UX : feedback de compression/upload.
- **Canaux publics (AD-7)** : vitrine live (résultats, carte) servie par le backend Next.js (cache + **SSE/polling**) ; « jamais de lecture directe Supabase realtime depuis les navigateurs publics » (plafond 200 connexions, 2 M messages/mois) ; **realtime réservé au portail admin**. Seuls identifiants non personnels sur les canaux publics : « numéro de dossard qualifié par édition et position — jamais nom, contact ou photo ». Liens de résultats partagés avec paramètre de suivi anonyme compté côté serveur (SM-5).
- **QR e-dossard (AD-8)** : le QR encode un « jeton unique édition » (pas le dossard nu), résolu via annuaire répliqué. Correction d'un Passage erroné uniquement par « annulation auditable côté admin ».
- **Multi-tenancy (AD-4)** : RLS Postgres, `organisation_id` sur chaque table métier ; isolation structurelle. → UX : contexte organisation présent partout.
- **Nommage** : « Code et identifiants en anglais ; documents et UI en français. »
- **Latence/perf vitrine** : cache + SSE/polling côté backend ; budget FR-21 sur la vitrine.

## Modèle de données visible côté utilisateur

Objets du diagramme ER (frontières d'appartenance) :

- **ORGANISATION** → porte **EVENEMENT**
- **EVENEMENT** → tient **EDITION**
- **EDITION** → propose **EPREUVE** ; inscrit **COUREUR** ; découpe **SECTEUR**
- **SECTEUR** → porte **MISSION** ; **MISSION** assignée à **VOLONTAIRE**
- **COUREUR** → franchit **PASSAGE** (horodaté par **CHECKPOINT**, jalonné par **EPREUVE**) ; émet **POSITION**
- **COMPTE** → détient **SESSION** ; **ORGANISATION** → regroupe **COMPTE**

Autres objets manipulés visibles dans le texte : dossiers d'inscription, preuves (fichiers uploadés), décharge, e-dossard (QR), annuaire coureurs (réplique locale), classements/résultats, carte de tracking, contenus publics vitrine, rapports admin, invitations volontaires (import Excel).

## Décisions techniques notables pour les états UI (loading, erreurs, sync…)

- **Erreurs API** : « enveloppe unique définie dans `shared` » → format d'erreur homogène pour toute l'UI.
- **Horodatages** : « ISO 8601 UTC stockés, affichage local » → conversion de fuseau à l'affichage.
- **Sync logging** : « journal sync (lots, rejets, offsets horloge) — l'auditabilité du chrono prime » → matière première pour un écran d'état de sync.
- **Outbox append-only + lots idempotents** (clé : `appareil+entité+identifiant naturel`) ; clé naturelle du Passage `(édition, coureur, checkpoint)` définie dans `shared` → déduplication visible côté utilisateur (doublons neutres).
- **Scan QR < 1 s** visé (retour utilisateur), qualifié sur le fallback iOS Safari.
- **Realtime** : réservé au portail admin ; vitrine en SSE/polling → états de chargement différents selon la surface.
- **Erreurs de scan / Passages erronés** : pas de suppression ; annulation auditable côté admin → parcours de correction dédié.
- **Contrat partagé** : types, client sync, schémas de validation, constantes (intervalles, statuts), format payload QR et schéma réplique annuaire versionnés dans `packages/shared` → statuts/intervalles cohérents entre surfaces.

## Questions ouvertes pour l'UX

- **iOS « Autoriser une fois » piège UX** : explicitement listé en Deferred — « détail de l'app coureurs, traité en UX (`bmad-ux`) ». → à traiter dans le design UX.
- **Bibliothèque cartographie vitrine** (Leaflet vs MapLibre) et rendu GPX : « choix local du module `vitrine` » → le design carte/rendu GPX reste ouvert.
- **Mécanisme d'auth précis** (Supabase Auth + révocation vs jetons maison) : décidé à l'implémentation du module `iam` → les parcours de connexion/révocation UX dépendent de ce choix.
- **Export rapports** (format, moteur) : local au module `admin` → format des exports à définir côté UX admin.
- **Distribution app coureurs** : soumission anticipée App Store (revue iOS ≈ délais), repli APK sideload Android → parcours d'installation/onboarding à concevoir.

## Citations clés

- « l'appareil propose, le serveur dispose. » (Design Paradigm)
- « pas de GPS arrière-plan en PWA : iOS jamais, Android écran éteint » (AD-1)
- « toute nouvelle connexion révoque les sessions interactives antérieures du compte, tous rôles » (AD-5)
- « la boîte d'envoi ne meurt jamais d'une connexion ouverte ailleurs » (AD-5)
- « jamais de lecture directe Supabase realtime depuis les navigateurs publics » (plafond 200 connexions, 2 M messages/mois) (convention Canaux publics)
- « numéro de dossard qualifié par édition et position — jamais nom, contact ou photo » (AD-7)
- « retour < 1 s visé, qualifié sur le fallback iOS » (convention Scan QR)
- « annuaire coureurs préchargé en IndexedDB » (convention Scan QR)
- « Compression/redimensionnement côté client avant upload, cible ≤ 300 Ko l'unité » (convention Fichiers preuves)
- « Erreurs API : enveloppe unique définie dans `shared` ; horodatages ISO 8601 UTC stockés, affichage local » (convention État & erreurs)
- « Code et identifiants en anglais ; documents et UI en français. » (convention Nommage)
- « iOS "Autoriser une fois" piège UX » (Deferred — renvoyé explicitement vers `bmad-ux`)
