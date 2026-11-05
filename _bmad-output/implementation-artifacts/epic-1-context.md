# Epic 1 Context: S'inscrire et boucler son dossier

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un coureur crée son accès (email + code de vérification, session unique), s'inscrit à l'édition (épreuve, identité, urgence, taille de t-shirt), accepte décharge et règlement intérieur horodatés, téléverse sa preuve de paiement CCP, suit sa checklist pièce par pièce et reçoit les notifications email — jusqu'au verdict « Dossier validé — dossard prêt ». C'est la porte d'entrée du produit et le jalon du 15/11/2026 (V1 « inscriptions » opérationnelle). L'épic porte aussi les fondations techniques de tout le reste : scaffold du monorepo, design tokens Vert Djurdjura, module iam et socle de données multi-organisation (schéma + RLS). Il doit permettre à ≥ 80 % des coureurs de boucler leur dossier sans échange humain, sans jamais exclure les coureurs peu à l'aise avec le numérique — l'assistance humaine reste visible en contrepoint.

## Stories

- Story 1.1: Fondation du monorepo
- Story 1.2: Accès coureur par email + code, session unique
- Story 1.3: Formulaire d'inscription à l'édition
- Story 1.4: Acceptation décharge et règlement intérieur
- Story 1.5: Télversement de la preuve de paiement CCP
- Story 1.6: Validation ou refus du dossier par l'organisateur
- Story 1.7: Checklist de dossier self-service
- Story 1.8: Notifications de statut par email
- Story 1.9: Socle multi-organisation (schéma + RLS)

## Requirements & Constraints

- **Auth** : code à usage unique à expiration courte, envoyé via SMTP propre avec limitation de rythme ; un code erroné ou expiré ne crée aucun compte (message clair + action à faire). Session interactive unique par compte, tous rôles : toute nouvelle connexion révoque les sessions interactives antérieures.
- **Formulaire d'inscription** : épreuve (longue ~35 km / moyenne 10–15 km), identité, genre (pour faire le lien avec les tailles des tshirt), contact, urgence, taille de t-shirt requise (elle alimente la commande J-10) ; champs obligatoires bloquants ; catégorie d'âge dérivée ; clôture à J-10 (16/03/2027) configurable côté serveur, soumission refusée avec message explicite après échéance.
- **Décharge + règlement** : les deux acceptations obligatoires pour soumettre, chacune horodatée avec la version du document.
- **Preuve CCP** : image/PDF uniquement ; compression/redimensionnement côté client, cible ≤ 300 Ko par fichier ; rejet des formats non conformes avant envoi avec message listant les formats acceptés ; retry idempotent sans re-sélectionner le fichier, brouillon conservé localement ; budget storage total 1 Go (free tier).
- **Validation organisateur** : le refus exige un motif (champ libre court), jamais de refus silencieux ; le motif remonte au coureur par email avec le numéro d'appel de l'équipe.
- **Checklist** : statut de chaque pièce (email vérifié, épreuve, décharge, règlement, preuve, validation) ; chaque pièce manquante nomme l'action à faire en lien direct ; compteur de pièces ; tout vert → bandeau « Dossier validé — dossard prêt » ; bouton « Appeler l'équipe » toujours visible.
- **Emails de statut** : reçu, validé, refusé avec motif — via file d'envoi avec rejeu (échec SMTP non bloquant).
- **Multi-organisation** : `organisation_id` sur chaque table métier, isolation par RLS Postgres (jamais un filtrage applicatif seul) ; une seconde organisation se crée sans changement de schéma ni fuite de données — hiérarchie organisation → événement → édition.
- **Transverse** : UI en français, code et identifiants en anglais ; accessibilité AA+ dans les deux modes, frappe ≥ 15 px sur contenus critiques, cibles ≥ 48 dp, zoom 200 %, `prefers-reduced-motion`, jamais la couleur seule.

## Technical Decisions

- **Monorepo pnpm dès le premier commit** : `apps/web` (Next.js 16.4.2 — vitrine, inscriptions, espace coureur, admin), `apps/runners` (Expo SDK 58 / RN 0.88, dev build — pas Expo Go), `packages/shared` (types domaine, schémas de validation, constantes, enveloppe d'erreur). Le contrat inter-apps ne vit que dans `shared`, versionné.
- **Stack verrouillée** : Node ^22.13 || ^24.3 || ≥26 ; React 19.3.x en version unique workspace ; Supabase cloud free tier (Postgres 500 Mo, storage 1 Go) ; auto-hébergement Next.js sur VPS + reverse proxy (Coolify ou équivalent) ; SMTP custom.
- **Design tokens « Vert Djurdjura »** : source unique dans `shared`, déclinée en variables CSS web + thème RN — paires clair/sombre incl. couleurs opérationnelles, stacks système (aucune webfont), mono pour horodatages et métadonnées, rounded 8/16/24/full, spacing 4–48. Mode sombre optionnel partout : défaut préférence système, override mémorisé, bascule visible dans l'en-tête.
- **Monolithe modulaire server-authoritative** : modules Next.js par domaine ; cet épic touche `inscriptions` et `iam`. Le mécanisme d'auth précis (Supabase Auth vs jetons maison) est volontairement différé à l'implémentation de `iam` — l'invariant est la session unique, complétée plus tard d'un jeton d'appareil révocable séparément pour le canal sync.
- **Conventions** : enveloppe d'erreur unique versionnée dans `shared` ; horodatages ISO 8601 UTC stockés, affichage local ; frontières ER : ORGANISATION → EVENEMENT → EDITION → EPREUVE/COUREUR, COMPTE → SESSION. Bus factor 1 : sobriété technique et documentation obligatoires.

## UX & Interaction Patterns

- **Saisie du code** : champ unique `inputmode="numeric"` + `autocomplete="one-time-code"`, collage autorisé, validité affichée, renvoi avec compte à rebours.
- **Télversement** : feedback visible pendant compression et envoi ; échec réseau → erreur doublée du bouton « Appeler l'équipe ».
- **Checklist** : libellés verbatim (« Dossier validé — dossard prêt », « Dépose ta preuve de paiement CCP ») ; tutoiement coureur, ton sobre et actionnable, jamais promotionnel ; un seul bouton action par vue (pill couleur sapin), bouton contour pour l'alternative.
- **Bouton assistance « Appeler l'équipe »** obligatoire dans : enveloppe d'erreur, email de refus, checklist incomplète.
- **Accessibilité** : focus visible 2 px, gap ≥ 8 px entre cibles interactives, icônes labellisées, décorations `aria-hidden`.

## Cross-Story Dependencies

- **1.1 d'abord** : monorepo, tokens et enveloppe d'erreur conditionnent toutes les autres stories.
- **Séquence coureur** : 1.2 → 1.3 → 1.4/1.5 → 1.6 → 1.7/1.8 (compte requis pour le dossier ; formulaire soumis avant acceptations et télversement ; validation après dépôt de la preuve ; checklist et emails réagissent au statut).
- **1.9 transversal** : chaque table créée en 1.2–1.8 porte `organisation_id` + RLS dès sa création, pas de reprise a posteriori.
- **Aval** : l'état « dossier validé » débloque l'e-dossard (Epic 4) et l'app coureurs (Epic 6) ; les coureurs inscrits alimentent l'annuaire des scanneurs (Epic 3) ; le jalon 15/11/2026 combine cet épic avec la page d'annonce minimale (Epic 2).
