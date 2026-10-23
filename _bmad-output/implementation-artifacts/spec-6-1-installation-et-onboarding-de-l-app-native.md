---
title: 'Story 6.1 — Installation et onboarding de l''app native'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '3f9e9d6'
baseline_commit: '3f9e9d6775e3c488ed5d04f8c2fb929103ea621a'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-6-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Yacine ne peut pas mettre la course dans sa poche : `apps/runners` n'est qu'un scaffold (écran placeholder), l'auth web vit dans un cookie httpOnly inutilisable en React Native, et le dossier / l'e-dossard ne sont servis qu'en HTML rendu serveur — aucune API JSON pour l'app native.

**Approach:** 1) IAM : `requireSession` accepte `Authorization: Bearer <token>` en plus du cookie ; `POST /api/auth/verify` renvoie le token (une fois) quand `client: "native"` — la session unique AD-5 s'applique telle quelle. 2) Deux routes JSON session coureur : `GET /api/coureur/dossier` (checklist) et `GET /api/coureur/e-dossard` (état + payload QR via `encoderPayloadEdossard`), réutilisant `getChecklistState` / `obtenirEdossard`. 3) App `apps/runners` : flux connexion email → code → dossier → e-dossard (dossier déjà vert → direct e-dossard, étapes court-circuitées), token en `expo-secure-store`, cache local dossier + e-dossard, QR `react-native-qrcode-svg`. 4) `expo-location` installé (dev build, pas Expo Go), `eas.json`, doc distribution stores + repli APK sideload.

## Boundaries & Constraints

**Always:**
- Connexion = même flux email + code à 6 chiffres que le web (quota, TTL, anti-bruteforce inchangés) ; session unique AD-5 : toute nouvelle connexion révoque les sessions interactives antérieures, web comme app.
- Token de session natif : renvoyé UNE fois dans le corps de `verify` (uniquement si `client: "native"`), stocké dans `expo-secure-store`, envoyé en `Authorization: Bearer` ; jamais loggé.
- L'app est une dev build Expo SDK 58 avec `expo-dev-client` + `expo-location` — jamais Expo Go.
- Dossier déjà validé à la première ouverture → accès direct à l'e-dossard, étapes court-circuitées ; e-dossard : carte sombre, numéro 74 px, badge « HORS-LIGNE PRÊT » mono, QR sur carte blanche coins 16 px, payload `azzel-e1:<jeton>` (contrat `shared`, jamais le dossard nu).
- Cache local (AsyncStorage) du dossier et de l'e-dossard : lisible réseau absent ; 401 → écran de reconnexion, jamais d'effacement silencieux du cache.
- Erreurs : enveloppe `ErrorEnvelopeV1` (`shared`) affichée message + action à faire + bouton « Appeler l'équipe » (`ASSISTANCE_PHONE`) ; jamais de code brut.
- Tutoiement, UI française ; base URL API via `EXPO_PUBLIC_API_URL`.

**Never:**
- Pas de tracking GPS (6.2), pas de guide permission iOS (6.3), pas de pédagogie batterie/rappel J-7 (6.4), pas de jeton d'appareil sync (modèle volontaires 4.5 — réservé à 6.2).
- Pas de SDK Supabase côté app ; pas de duplication des types de domaine (import depuis `@azzel/shared`).
- Pas de soumission réelle aux stores (doc de soumission uniquement) ; pas d'expo Go.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion (code demandé) | email coureur valide | `POST /api/auth/code` → email parti (Mailpit en dev), écran saisie code | quota IP/email → message + `Retry-After` |
| Vérification native | `verify {email, code, client:"native"}` | `{ token }` + cookie (web inchangé) ; token stocké SecureStore | code faux → `iam.*` enveloppe, 5 essais max |
| Session unique | login app après login web | session web révoquée (AD-5) et inversement | session expirée app → 401 → écran reconnexion, cache conservé |
| Dossier (en cours) | `GET /api/coureur/dossier` | checklist JSON (statut, pièces) → écran dossier | 401 → reconnexion |
| Dossier vert | statut validé | accès direct e-dossard, étapes court-circuitées | N/A |
| E-dossard | `GET /api/coureur/e-dossard` validé | `{ jeton, dossard, prenom, nom, epreuveNom, editionNom, payloadQr }` | dossier non validé → `null` + message d'attente |
| Hors-ligne (déjà ouvert) | réseau coupé, cache présent | dossier + e-dossard servis du cache | bandeau « hors-ligne », jamais d'écran vide |
| Hors-ligne (jamais ouvert) | aucun cache | écran expliquant la 1ʳᵉ connexion requise | bouton réessayer |

</frozen-after-approval>

## Code Map

- `apps/runners/` — scaffold 1.1 : `App.tsx` placeholder, `src/theme.ts` clair/sombre, `@azzel/shared` déjà en dépendance ; `start` = `expo start --dev-client`.
- `apps/web/src/modules/iam/session.ts` — `requireSession`/`requireRole` (cookie only aujourd'hui) : y ajouter la lecture `Authorization: Bearer`.
- `apps/web/src/app/api/auth/verify/route.ts` + `iam/store.ts` — `verifyCodeAndStartSession` (révocation sessions = AD-5) : renvoyer le token si `client:"native"`.
- `apps/web/src/app/espace-coureur/page.tsx` + `modules/inscriptions/service.ts` — `getChecklistState` (ChecklistState/Piece/Recap, COUREUR_STATUSES) à exposer en JSON.
- `apps/web/src/app/espace-coureur/e-dossard/page.tsx` + `service.ts` (l.698) — `obtenirEdossard(session)` → `EdossardState` ; page web inchangée.
- `packages/shared/src/edossard.ts`, `error-envelope.ts`, `datetime.ts` — contrats à importer tels quels ; ne pas les dupliquer.
- `apps/web/src/app/api/volontaires/guard.ts` — pattern guard API (enveloppe, no-store) à répliquer.
- `pnpm-workspace.yaml`, `vitest.config.ts` (racine) — tests runners inclus ; `pnpm typecheck/build/test`, `pnpm test:db` (intégration).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/iam/session.ts` (+ tests) — `requireSession` lit `Authorization: Bearer <token>` en plus du cookie, même lookup hashé, même sémantique ; Bearer invalide → 401 enveloppe `iam.*`.
- [x] `apps/web/src/app/api/auth/verify/route.ts` (+ tests) — si `client === "native"`, renvoyer `{ token }` (token session clair, une seule fois) ; sinon comportement cookie inchangé.
- [x] `apps/web/src/app/api/coureur/dossier/route.ts` (+ tests) — GET JSON `getChecklistState(session)` via guard coureur (Bearer ou cookie), `no-store`.
- [x] `apps/web/src/app/api/coureur/e-dossard/route.ts` (+ tests) — GET JSON : dossier non validé → `{ disponible: false }` ; sinon `EdossardState` + `payloadQr: encoderPayloadEdossard(jeton)`.
- [x] `apps/runners/src/api-client.ts` (+ tests) — fetch wrapper : Bearer automatique, parse enveloppe d'erreur, routes code/verify/session/logout/dossier/e-dossard.
- [x] `apps/runners/src/auth-store.ts` (+ tests) — SecureStore token + état session AsyncStorage ; logout purge token + cache.
- [x] `apps/runners/src/ecrans/` — `connexion.tsx` (email → code, renvoi, erreurs quota), `dossier.tsx` (checklist + statut), `edossard.tsx` (carte sombre 74 px, badge, QR blanc 16 px), `hors-ligne.tsx` (cache vide) ; machine à états dans `App.tsx` (connecté → dossier|edossard selon statut).
- [x] `apps/runners/src/offline-cache.ts` (+ tests) — cache JSON dossier + e-dossard (AsyncStorage), lecture sans réseau.
- [x] `apps/runners/package.json` + `app.json` + `eas.json` — ajouter `expo-location`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `react-native-qrcode-svg`, `react-native-svg` ; config EAS (dev build Android/iOS, profil apk sideload).
- [x] `apps/runners/DISTRIBUTION.md` — doc : build EAS dev, installation dev build, procédure APK sideload Android (repli), checklist soumission stores anticipée.
- [x] `apps/web` tests intégration — verify native (token + révocation AD-5), Bearer sur routes coureur, RLS multi-org.

**Acceptance Criteria:**
- Given un compte coureur actif, when Yacine installe la dev build et se connecte email + code, then il atteint son dossier ou son e-dossard et le login web précédent est révoqué (AD-5).
- Given un dossier déjà validé à la première ouverture, when l'app démarre après connexion, then l'e-dossard s'affiche directement (étapes court-circuitées) et reste lisible réseau coupé.
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : auth native par Bearer réutilisant les sessions interactives (le jeton d'appareil indépendant arrive en 6.2 pour le canal sync) ; navigation par machine à états sans routeur (3 écrans) ; QR rendu localement depuis le payload `shared`.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès (unitaires runners + web)
- `pnpm test:db` -- expected: succès (intégration IAM + routes coureur)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | Routing hors-ligne : `demarrer`/`chargerDossier` catch → dossier cache validé sans cache e-dossard → `setEcran('edossard')` avec état null → garde résiduelle affiche « Première connexion requise » alors que la checklist est disponible (App.tsx:105-114, 148-155, confirmé en lecture). | patch |
| 2 | medium | Orchestration App.tsx (cache servi, 401→reconnexion cache conservé, court-circuit) exécutée par aucun test — retrait du repli cache ou inversion branche 401 = zéro test en échec (inventaire complet des tests runners par verification-gap, pré-vérifié). | patch |
| 3 | low | Bandeau : `depuisCache` reste false quand l'e-dossard est servi du cache après un dossier réseau OK (App.tsx:85-88) ; `recuLe` jamais affiché bien que le texte promette « dernière visite affichée ». | patch |
| 4 | medium | Double-tap : `Bouton` sans prop `disabled`, rien désactivé pendant `occupe` → quotas de codes et 5 essais anti-bruteforce brûlés (connexion.tsx, confirmé). | patch |
| 5 | medium | api-client : 200 corps non-JSON → `null as T` (crash aval) ; pas de timeout fetch → écran « chargement » infini sur réseau suspendu (api-client.ts:58-77, confirmé). | patch |
| 6 | low | `ecrireToken` sans try/catch (keychain indisponible) → rejet non géré via `void onConnecte` → app bloquée sur « chargement » (auth-store.ts:29-31, confirmé). | patch |
| 7 | low | `lire` cache : `donnees:null` passe la garde (undefined seulement) → cache « valide » avec données null → crash aval (offline-cache.ts:33-40, confirmé). | patch |
| 8 | medium | Cache global non clé par compte : B connecté hors-ligne avant son 1er fetch → servi le dossier/e-dossard de A (QR = identité d'A au guichet). Fenêtre étroite mais mélange d'identité réel ; purge au logout insuffisante. | patch |
| 9 | low | `verify` renvoie le token en clair sans `Cache-Control: no-store` — incohérent avec le reste de la surface (POST peu cacheable mais coût nul). | patch |
| 10 | low | OTP : ni `textContentType="oneTimeCode"` ni `sms-otp` → friction de saisie du code (connexion.tsx, confirmé). | patch |
| 11 | low | « Renvoyer un code » ne renvoie rien (retour étape email) — étiquette trompeuse, correctif trivial de libellé. | patch |
| 12 | low | TTL « 10 minutes » duplique `CODE_TTL_MINUTES` iam sans partage + `Retry-After` non parsé — dérive développeur rare, correctif > correction directe (const à travers packages). | rejeté |
| 13 | false | Matrice figée « null + message d'attente » vs `{ disponible: false }` : sémantique équivalente (indisponible = null-safe), le correctif demandé est l'édition de la spec gelée — exclu par règle. | rejeté |
| 14 | low | `app.json` sans icônes/splash : dev build par défaut acceptable, soumission stores explicitement différée (DISTRIBUTION.md checklist). | rejeté |
| 15 | low | Cache e-dossard non invalidé sur `disponible:false` : la survie 30 jours hors-ligne est un choix de conception de la spec (4.1) ; révocation d'un dossier déjà validé = cas limite admin. | rejeté |
| 16 | low | Fallback `localhost:3000` sur appareil physique : échec dev-only, déjà couvert par le dépannage DISTRIBUTION.md. | rejeté |
| 17 | low | `actionLabel/actionHref` non rendus dans l'app : actions de dossier non exigées par la spec, réalisables sur le web ; pas de préjudice quotidien nommé. | rejeté |
| 18 | low | `text-encoding@0.7.0` déprécié : transitive de react-native-qrcode-svg, non actionnable ici, aucun préjudice nommé. | rejeté |
| 19 | low | Mode sombre « override mémorisé » (pattern épopée 6) non implémenté : non exigé par la story 6.1, à réclamer dans une story ultérieure de l'épopée. | différé |

