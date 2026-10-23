# Epic 6 Context: App coureurs & suivi GPS

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mettre l'app native coureurs (Expo) entre les mains de Yacine : installation depuis les stores (ou APK sideload Android documenté), connexion avec le compte créé sur le web, accès au dossier et à l'e-dossard, activation explicite du suivi GPS opt-in (positions toutes les 5–10 min, précision équilibrée, cache hors-ligne, envoi en lot au retour du réseau), franchissement du piège iOS « Autoriser une fois » via un écran guide Réglages, et pédagogie batterie avec rappel email à J-7. C'est la seule surface capable de produire des positions GPS en arrière-plan (impossible en PWA) : elle alimente la carte publique de l'épopée 7 tout en garantissant que le tracking désactivé n'enregistre strictement rien.

## Stories

- Story 6.1: Installation et onboarding de l'app native
- Story 6.2: Activation du suivi GPS opt-in
- Story 6.3: Guide permission iOS « Autoriser une fois »
- Story 6.4: Pédagogie batterie et rappel J-7

## Requirements & Constraints

- Tracking strictement opt-in ; « désactivé : rien n'est enregistré » est littéral — aucun enregistrement à l'insu.
- Positions capturées toutes les 5–10 min en « précision équilibrée », stockées en cache hors-ligne, envoyées en lot au retour du réseau. La fréquence ne doit jamais être augmentée pour embellir la carte au prix de la batterie des coureurs.
- Aucune fonction critique ne dépend du réseau : capture des positions et e-dossard fonctionnent en zone blanche.
- Piège iOS « Autoriser une fois » : détection de la permission localisation expirée au retour au premier plan ; écran guide avec chemin Réglages complet + bouton « Ouvrir les Réglages » ; permission refusée → suivi silencieusement inactif, aucune culpabilisation ; rétablissement de la permission → le suivi repart sans manipulation supplémentaire.
- Pédagogie batterie : carte à puces concrètes (partir à 100 %, ne pas tuer l'application, powerbank en vente au village), conclue par la citation kabyle « Un point après l'autre, et l'ouvrage est parfait » (source Hanoteau 1867 toujours notée) ; rappel email à J-7 avec bouton vers l'app. L'alerte batterie < 15 % côté coureur est balisée Should, à confirmer.
- Connexion avec le même email + code que le web ; la session unique s'applique (toute nouvelle connexion révoque les sessions interactives antérieures du compte, tous rôles).
- Vie privée : les positions ne sont exposées publiquement que par numéro de dossard qualifié par édition — jamais nom, contact ou photo.
- L'e-dossard dans l'app reste lisible après 30 jours de cache, réseau absent ; le QR encode un jeton unique édition (pas le dossard nu).
- Dossier déjà validé à l'installation → accès direct à l'e-dossard, étapes d'onboarding court-circuitées.
- Distribution : soumission anticipée aux stores (délais de revue iOS) ; repli Android par APK sideload documenté. Le taux d'activation du tracking est un critère de succès secondaire (cible à chiffrer avec l'organisateur).

## Technical Decisions

- L'app vit dans `apps/runners` (Expo SDK 58 / RN 0.88 / expo-location 58.0.0, dev build obligatoire — pas Expo Go) ; React 19.3.x unique workspace ; aucun code métier dupliqué : types de domaine, schémas de validation, constantes (intervalles) et client sync ne vivent que dans `packages/shared`.
- Le tracking GPS arrière-plan est le motif d'existence de l'app native : impossible en PWA (iOS jamais, Android écran éteint).
- Les positions sont des événements de terrain : insertion append-only dans une outbox locale SQLite, push par lots idempotents (clé naturelle incluant l'appareil) — « l'appareil propose, le serveur dispose ». Les Positions ne sont pas un classement : la dernière reçue par appareil fait foi côté serveur.
- Chaque installation productrice d'événements détient un jeton d'appareil dédié au canal sync, indépendant des sessions interactives et révocable séparément : la boîte d'envoi survit à une connexion ouverte ailleurs.
- Réception des positions côté backend par le module `tracking` du monolithe Next.js ; les canaux publics ne servent que des identifiants non personnels, servis par le backend.
- Horodatages ISO 8601 UTC stockés, affichage local ; enveloppe d'erreur unique définie dans `shared` ; journal sync (lots, rejets, offsets horloge) en lecture seule.
- Build/distribution via EAS ; le mécanisme d'auth précis (Supabase Auth vs jetons maison) se décide à l'implémentation du module `iam`.

## UX & Interaction Patterns

- Tutoiement coureur, UI française ; mode sombre : défaut préférence système, override mémorisé.
- Bandeau sync visible : « ◷ N passages en attente » → « ✓ envoyés — file : 0 » ; journal sync accessible depuis le bandeau.
- Guide permission iOS : écran à étapes numérotées, chemin « Réglages > Azzel > Localisation > Toujours » en exergue, bouton contour « Ouvrir les Réglages », toujours accessible depuis l'app.
- E-dossard : carte sombre, numéro 74 px, badge « HORS-LIGNE PRÊT » en mono, QR sur carte blanche coins 16 px ; raccourci système recommandé (widget iOS / quick settings Android) pour un accès en un geste écran verrouillé.
- Erreurs : enveloppe unique — message homogène + action à faire + bouton « Appeler l'équipe » ; jamais de code brut.
- Accessibilité : cibles ≥ 48 dp, frappe ≥ 15 px sur contenus critiques, jamais la couleur seule, prefers-reduced-motion respecté.
- La citation kabyle n'apparaît qu'au point d'usage batterie — jamais groupée en section, jamais en zone critique.

## Cross-Story Dependencies

- Story 6.1 s'appuie sur l'épopée 1 (compte email + code, dossier, checklist) et restitue l'e-dossard livré par la story 4.1 ; le scaffold `apps/runners` existe dès la story 1.1.
- Story 6.2 dépend de 6.1 et produit les Positions consommées par la carte publique (épopée 7, story 7.3) et potentiellement par l'alerte batterie du PC (épopée 5, Should).
- Le rappel J-7 (story 6.4) réutilise la file d'envoi email avec rejeu mise en place pour les notifications de statut (épopée 1).
- Story 6.3 est autonome côté UI mais n'a d'effet que sur le suivi activé en 6.2.
