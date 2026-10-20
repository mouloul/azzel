---
name: review-web-verification
target: ARCHITECTURE-SPINE.md (Azzel, 2026-10-19)
reviewer: review-web-verification
date: '2026-10-20'
status: done
---

# Revue de vérification web — Architecture Spine Azzel

**Objet :** vérifier que chaque décision technique engagée dans `ARCHITECTURE-SPINE.md` (§ Stack, conventions, AD) a été confirmée contre des sources vivantes (registre npm, docs officielles, caniuse, pages pricing) et non assertée de mémoire.

**Méthode :** interrogations directes du registre npm (`registry.npmjs.org/<pkg>/latest`, 2026-10-20), docs Expo (`docs.expo.dev/guides/monorepos/` modifiée le 2026-10-16 ; `docs.expo.dev/versions/latest/sdk/location/` SDK 58), page pricing Supabase (`supabase.com/pricing`, 2026-10-20), caniuse (`mdn-api_barcodedetector`, données StatCounter sept. 2026), index doc Coolify (`coolify.io/docs/llms.txt`, 2026-10-20).

---

## Verdict global

**Conforme avec corrections.** L'essentiel de la stack est exact et à jour au 2026-10-20 : Next.js 16.4.2 est bien la latest, Expo SDK 58 / RN 0.88 sont bien le couple courant, `@zxing/browser` 0.2.1 est la latest, le monorepo pnpm est bien supporté first-class par Expo, les quatre chiffres du free tier Supabase sont exacts, et Coolify a bien un chemin officiel pour Next.js SSR auto-hébergé. **Deux corrections factuelles sont requises avant naissance du code** : le plancher Node.js est faux pour le monorepo (F1), et React web 19.2 est périmé et contredit AD-6 (F2).

---

## Findings

### F1 — Node.js ≥ 20.9 : insuffisant pour le monorepo Expo — **ÉLEVÉE**

- **Cible :** § Stack, ligne « Node.js | ≥ 20.9 ».
- **Constat :** 20.9 est le plancher du seul `next@16.4.2` (`engines.node: ">=20.9.0"`, registre npm, 2026-10-20). Mais dans le monorepo visé (AD-6), la CLI Expo 58 et React Native 0.88 imposent un plancher bien plus haut :
  - `expo@58.0.16` : `engines.node: "^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0"` (registre npm, 2026-10-20) ;
  - `react-native@0.88.0` : `engines.node: "^22.13.0 || ^24.3.0 || >= 26.0.0"` (registre npm, 2026-10-20).
- **Impact :** un environnement Node 20.x satisfait le tableau de la spine mais casse `pnpm expo` / le tooling natif dès l'installation — échec immédiat au scaffold.
- **Correction :** « Node.js ≥ 22.13 (24 LTS recommandé) » dans § Stack.
- **Sources :** registry.npmjs.org/next/latest, /expo/latest, /react-native/latest — interrogés le 2026-10-20.

### F2 — React web 19.2 : version périmée, en conflit avec AD-6 — **MOYENNE**

- **Cible :** § Stack, ligne « React (web) | 19.2 » ; AD-6 (« Une seule version de React/RN par workspace »).
- **Constat :** latest `react@19.3.1` (registre npm, 2026-10-20). Le starter vivant Expo SDK 58 épinglera `react: 19.3.0` exact (exemple officiel du guide monorepos, docs.expo.dev/guides/monorepos/, modifiée le 2026-10-16 ; devDeps `expo@58.0.16` → react 19.3.0). Next 16.4.2 accepte `react ^19.x` en peer dependency, sans conflit.
- **Impact :** laissé en 19.2, le workspace viole AD-6 dès la première résolution de dépendances (le guide Expo recommande d'ailleurs `resolutions.react ^19.3.0`).
- **Correction :** « React (web) | 19.3 ».
- **Sources :** registry.npmjs.org/react/latest (2026-10-20) ; docs.expo.dev/guides/monorepos/ (2026-10-16).

### F3 — TypeScript ≥ 5.1 : plancher vrai mais très en retard sur le vivant — **FAIBLE**

- **Cible :** § Stack, ligne « TypeScript | ≥ 5.1 ».
- **Constat :** `typescript@7.0.2` est la version `latest` au 2026-10-20 (port natif, binaires par plateforme ; le 6.x est déjà répandu — `@zxing/browser` 0.2.1 construit avec TS ^6.0.3). Un plancher « ≥ 5.1 » n'est pas faux, mais un greenfield né aujourd'hui héritera de TS 6/7 via le starter, pas de 5.1.
- **Impact :** aucun blocage ; risque de dérive silencieuse entre le document et le `package.json` généré.
- **Correction recommandée :** reformuler en « TypeScript courant au scaffold (6.x/7.x au 2026-10-20) — le code devient propriétaire de la version », cohérent avec la note SEED existante.
- **Sources :** registry.npmjs.org/typescript/latest (2026-10-20) ; registry.npmjs.org/@zxing/browser/latest (2026-10-20).

### F4 — « BarcodeDetector absent d'iOS Safari » : exact en pratique, imprécis en théorie — **FAIBLE**

- **Cible :** § Consistency Conventions, ligne Scan QR ; AD-1 (prévention du tracking PWA).
- **Constat :** l'API est *implémentée* dans Safari 17+ mais **désactivée par défaut** sur toutes les versions testées jusqu'à Safari 27.2 / iOS 26.6–27.2 inclus (caniuse `mdn-api_barcodedetector`, données sept. 2026). Firefox desktop et Android : non supporté. Chrome Android / Samsung Internet : supportés ; usage global 76,61 %.
- **Impact :** la conclusion architecturale (fallback `@zxing/browser` nécessaire) tient. Mais tout volontaire sur iPhone — population significative — passera toujours par le fallback ZXing : l'exigence « retour utilisateur < 1 s » doit être qualifiée sur iPhone/Safari avec ZXing, pas seulement sur Android avec BarcodeDetector.
- **Correction recommandée :** préciser « désactivé par défaut sur iOS Safari (17→27.x) et absent de Firefox » et ajouter le test de perf fallback iOS comme critère d'acceptation du module scan.
- **Sources :** caniuse.com/mdn-api_barcodedetector (consulté le 2026-10-20, données sept. 2026).

### F5 — Free tier Supabase : chiffres exacts, mais limites voisines omises — **INFO**

- **Cible :** § Stack, ligne « Supabase cloud — free tier | Postgres 500 Mo · storage 1 Go · realtime 200 conn. · SMTP custom OK » ; § Consistency Conventions (budget storage 1 Go, keep-alive hebdo).
- **Constat (supabase.com/pricing, 2026-10-20) :** les quatre affirmations sont confirmées — 500 Mo base, 1 Go stockage fichiers, 200 connexions realtime concurrentes (pic), « Custom SMTP server : Included » en Free. La pause après 1 semaine d'inactivité est confirmée → le keep-alive hebdo en cron est justifié. En revanche, le tier Free inclut aussi des plafonds non mentionnés qui concernent directement Azzel :
  - **2 millions de messages realtime/mois** (taille max 256 Ko) — la vitrine « résultats live » (FR-21) et le fanout vers les spectateurs sont le principal consommateur ; à dimensionner avant le jour J ;
  - 50 000 MAU auth ; upload max 50 Mo/fichier ; 5 Go d'egress ; limite de 2 projets actifs (une seule organisation en prod + dev si partage).
- **Impact :** pas d'erreur factuelle ; deux risques de budget à suivre en ops (messages realtime, egress).
- **Sources :** supabase.com/pricing (2026-10-20).

---

## Confirmations (vérifié, conforme)

| Affirmation de la spine | Vérification | Source / date |
| --- | --- | --- |
| Next.js 16.4.2 | ✅ = `latest` npm ; engines node ≥ 20.9 (Next seul) | registry.npmjs.org/next/latest, 2026-10-20 |
| Expo SDK 58 | ✅ = SDK courant (`expo@58.0.16` latest) | registry.npmjs.org/expo/latest, 2026-10-20 |
| React Native 0.88 | ✅ = version appairée à SDK 58 (latest `0.88.0`) | registry.npmjs.org/react-native/latest, 2026-10-20 |
| expo-location 58.0.0 | ✅ gamme SDK 58 (latest 58.0.18 ; `~58.0.0` résout en 58.0.x) | registry.npmjs.org/expo-location/latest, 2026-10-20 |
| « dev build requis — pas Expo Go » (tracking bg) | ✅ doc officielle : « You must use a development build to use background location since it is not supported in the Expo Go app » (iOS) | docs.expo.dev/versions/latest/sdk/location/, SDK 58, 2026-10-20 |
| @zxing/browser 0.2.1 | ✅ = `latest` (peer `@zxing/library ^0.23.0` à installer) | registry.npmjs.org/@zxing/browser/latest, 2026-10-20 |
| pnpm workspaces « monorepo officiellement supporté Expo » | ✅ « first-class support ... pnpm » ; config Metro automatique ; option `nodeLinker: hoisted` si une lib casse en install isolé (à connaître, pas à prévoir) ; pnpm latest = 12.14.0 → à épingler via `packageManager` | docs.expo.dev/guides/monorepos/ (modif. 2026-10-16) ; registry.npmjs.org/pnpm/latest, 2026-10-20 |
| VPS + Coolify pour Next.js 16 auto-hébergé | ✅ page officielle « NextJS » de Coolify (SSR, builds statiques, Nixpacks ou Dockerfile — préférer Dockerfile/standalone) ; Hostinger = provider provisionnable depuis le dashboard Coolify ; IONOS = n'importe quel serveur Linux via SSH | coolify.io/docs/llms.txt + /applications/framework-examples/javascript/nextjs, 2026-10-20 |
| Keep-alive hebdo Supabase (pause 7 jours) | ✅ « Free projects are paused after 1 week of inactivity » | supabase.com/pricing, 2026-10-20 |

## Non vérifiables / hors périmètre web

- **Choix commercial IONOS vs Hostinger** (tarifs, perf VPS) : fit coût confirmé par existence des intégrations Coolify, mais les performances réelles relèvent d'un bench, pas d'une doc.
- **Piège UX iOS « Autoriser une fois »** : déjà correctement déféré au module UX dans la spine ; la doc expo-location SDK 58 le documente explicitement (échec silencieux de `requestBackgroundPermissionsAsync`) — le déféré est légitime.

## Actions demandées

1. **(F1)** Corriger le plancher Node : ≥ 22.13 (recommandé 24 LTS) — bloquant pour le scaffold du monorepo.
2. **(F2)** React web 19.3 (alignement starter SDK 58 + AD-6).
3. **(F3)** Reformuler la ligne TypeScript en « version courante au scaffold ».
4. **(F4)** Préciser le statut BarcodeDetector (désactivé par défaut iOS Safari, absent Firefox) et ajouter le critère de perf fallback iOS au module scan.
5. **(F5)** Inscrire « 2 M messages realtime/mois » au tableau des limites suivies (vitrine live).
