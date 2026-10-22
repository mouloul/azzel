---
title: 'Story 3.3 — Fiche mission hors-ligne (PWA volontaires)'
type: 'feature'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '7f13569'
baseline_commit: '7f13569b7c13312e94bdd3839469b81a43a8cf46'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La fiche mission de Karim vit sur une page serveur : sans réseau le jour J (zone blanche), application fermée, il ne sait ni où se placer, ni à quelle heure, ni qui appeler — l'offline-first de l'épopée 3 n'existe pas encore côté volontaire (FR-11, NFR-8).

**Approach:** Transformer `/volontaires` en PWA installable offline-first : manifeste + icônes dédiées (générées en Djurdjura), service worker maison (shell mis en cache, réseau d'abord avec repli cache), fiches missions persistées en **IndexedDB** à chaque ouverture en ligne (donc à jour dès l'affectation), rendu une colonne avec contact PC `tel:` cliquable, badge d'état « synchronisé / HORS-LIGNE PRÊT », invitation au mode sombre à la première ouverture. Aucune nouvelle dépendance runtime.

## Boundaries & Constraints

**Always:**
- Offline-first radical : hors-ligne, la fiche s'affiche depuis IndexedDB et le shell depuis le service worker — jamais d'écran vide, aucune fonction critique ne dépend du réseau.
- Mise à jour **à chaque ouverture en ligne** : le client rappelle `GET /api/volontaires/etat` (session volontaire), écrit l'état en IndexedDB, affiche la fraîcheur (« synchronisé à HH:MM » / « hors-ligne — données du JJ/MM HH:MM »).
- Fiche une colonne par mission : secteur (nom + lieu), rôle (type + titre), horaires (heure locale), **contact PC en gros bouton `tel:`** (≥ 48 px, absent si non renseigné), consignes (lignes courtes), bouton « Appeler l'équipe » toujours visible.
- Accessibilité terrain : cibles ≥ 48 px, gap ≥ 8 px, frappe ≥ 15 px sur les contenus critiques, aucune dépendance au survol, `role="status"` sur le badge d'état, une colonne.
- Mode sombre : à la première ouverture, bandeau d'invitation (Oui / Plus tard) ; bascule visible en en-tête ; choix mémorisé (mécanisme existant `data-theme` + localStorage).
- Identité terrain : variables `--az-*` existantes (palette Djurdjura = operationsTokens) + paires sombres ; tutoiement.
- PWA installable : manifeste (name « Azzel Volontaires », start_url `/volontaires`, standalone), icônes PNG 192/512 + maskable + apple-touch-icon 180, service worker scope géré pour ne jamais toucher la vitrine.
- Service worker minimal et explicite : précache `/volontaires`, réseau-d'abord + repli cache pour navigations `/volontaires*` et l'API état, cache-first pour `/_next/static/*` et `/charte/*` (immuables), nettoyage des anciens caches ; aucune interception des autres routes.
- L'épopée 4 greffera caméra/scan/outbox sur ce shell : composants sectionnés, store IndexedDB nommé/versionné, SW simple — ne rien verrouiller.

**Never:**
- Pas de scan/caméra/outbox sync (épopée 4), pas d'annuaire coureurs (3.4), pas de notification push (le « préchargé à l'affectation » = disponible à la prochaine ouverture, documenté à l'écran).
- Pas de nouvelle dépendance runtime (SW, IndexedDB et génération d'icônes écrits à la main) ; pas de `next-pwa` ni équivalent.
- Pas de refactor en route groups du layout racine (l'en-tête vitrine reste au-dessus en V1) ; pas de modification des surfaces coureur/admin.
- Le scan QR n'apparaît que comme un type de mission parmi d'autres — aucun bouton scanner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Première visite en ligne | session volontaire, missions affectées | Fiches rendues (SSR), état écrit en IndexedDB, caches SW remplis, badge « synchronisé » | échec IDB → rendu SSR quand même |
| Réouverture hors-ligne | réseau absent, SW actif | Shell servi du cache, fiches de l'IndexedDB, badge « HORS-LIGNE PRÊT » | jamais d'écran vide |
| Installation | Ajouter à l'écran d'accueil (iOS Safari / Android) | Icône dédiée, ouverture standalone sur la fiche | No error expected |
| Contact PC | secteur avec contact | Gros bouton `tel:` cliquable | sans contact : ligne absente, pas de lien mort |
| Première ouverture (thème) | aucun choix mémorisé | Bandeau « mode sombre ? » Oui / Plus tard ; bascule en en-tête ensuite | choix mémorisé |
| Aucune mission | volontaire sans affectation | Message d'attente + toutes les missions avec couverture | No error expected |
| API injoignable au chargement | fetch échoue | IndexedDB lu, « données du … » affiché | IDB vide + hors-ligne : message d'attente + assistance |
| Session expirée en ligne | API 401 | Message + action « se reconnecter » + Appeler l'équipe | enveloppe shared |
| Non-volontaire sur l'API | coureur/organisateur | 403 | enveloppe |
| Cache SW absent | premier lancement directement hors-ligne | Message d'explication + assistance (cas marginal, documenté) | pas d'écran blanc |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/volontaires/page.tsx` (+ `volontaires.css`) — page 3.2 à réécrire : server component → état initial en props → composant client PWA.
- `apps/web/src/modules/missions/service.ts` — `getMissionsVolontaireState` à étendre (secteurLieu, secteurContact ; les données existent déjà dans `listMissionsEtat`).
- `apps/web/src/app/api/admin/guard.ts` — pattern de garde à décliner pour le rôle volontaire (route publique d'état).
- `apps/web/src/lib/theme.ts` + `components/theme-toggle.tsx` — mécanisme `data-theme`/localStorage à réutiliser (bandeau première ouverture).
- `apps/web/src/lib/tokens-css.ts` — variables `--az-*` (palette Djurdjura + paires sombres) déjà générées : les utiliser telles quelles.
- `apps/web/src/app/layout.tsx` — layout racine (header vitrine + ThemeToggle) : inchangé, pas de route group.
- `apps/web/src/app/api/admin/volontaires/**` + tests routes — patterns de tests stubbés à reproduire pour `/api/volontaires/etat`.
- `apps/web/src/modules/missions/secteurs.integration.test.ts` — harnais intégration si l'état étendu mérite un cas réel.
- `packages/shared/src/datetime.ts` — `formatLocalDateTime` pour les horaires.
- `scripts/` — emplacement du générateur d'icônes (dev-only, node stdlib `zlib`, PNG encodés à la main).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/scripts/gen-pwa-icons.mjs` + PNGs commités (`public/volontaires/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`) — générateur PNG pur node (zlib), fond vert Djurdjura + chevron sentier blanc, exécutable via `pnpm -F @azzel/web icons:generate`, test validant signature + dimensions des fichiers commités.
- [x] `public/volontaires/manifest.webmanifest` + `public/sw-volontaires.js` — manifeste standalone start_url `/volontaires`, icônes + maskable + theme color Djurdjura ; SW versionné : précache `/volontaires`, réseau-d'abord/repli pour `/volontaires*` et `GET /api/volontaires/etat`, cache-first `/_next/static/*` + `/charte/*` + icônes/manifeste, nettoyage à l'activate, `skipWaiting`+`clients.claim`, aucune autre route interceptée.
- [x] `apps/web/src/app/volontaires/layout.tsx` + `components/pwa-register.tsx` — layout PWA : `<link>` manifeste + apple-touch-icon, `viewport`/themeColor (clair + sombre), enregistrement du SW au montage.
- [x] `apps/web/src/lib/idb-volontaires.ts` + `lib/fraicheur.ts` (+ tests unitaires) — wrapper IndexedDB minimal promessifié (base `azzel-volontaires`, store versionné `etat`, SSR-safe) ; calcul du libellé de fraîcheur (« synchronisé à HH:MM » / « hors-ligne — données du … ») ; stub indexedDB en mémoire pour les tests.
- [x] `modules/missions/service.ts` — `MissionVolontaireView` étendu (`secteurLieu`, `secteurContact`) + tests unitaires de l'assemblage.
- [x] `GET /api/volontaires/etat/route.ts` (+ tests routes) — garde rôle volontaire (pattern guardAdmin décliné), réponse `{ editionNom, assistancePhone, mesMissions, missions, generéA }` en `no-store`, 401/403 enveloppes.
- [x] `apps/web/src/app/volontaires/page.tsx` + `volontaires-pwa.tsx` + `volontaires.css` — page serveur (requireRolePage volontaire, état initial en props) → composant client : revalidation API → IndexedDB, badge `role="status"` (sync / HORS-LIGNE PRÊT), bandeau première ouverture mode sombre + bascule en-tête, fiches une colonne (secteur+lieu, rôle, horaires, bouton `tel:` ≥ 48 px, consignes, Appeler l'équipe), toutes les missions avec couverture, états vides ; CSS terrain une colonne, cibles ≥ 48 px, gap ≥ 8 px, frappe ≥ 15 px, `--az-*` + `[data-theme="dark"]`.
- [ ] Tests -- routes état (401/403/200 forme/no-store), assemblage fiche (lieu/contact présents, absent → null), fraîcheur, IndexedDB (écriture/lecture/SSR-safe), icônes PNG valides.

**Acceptance Criteria:**
- Given une mission affectée à Karim et une première visite en ligne, when il coupe le réseau (et ferme l'application), then la PWA rouvre standalone sur sa fiche complète — secteur, rôle, horaires, contact `tel:`, consignes — depuis IndexedDB et le shell SW, avec badge « HORS-LIGNE PRÊT ».
- Given le secteur de sa mission avec un contact PC, when Karim le tape, then la numérotation s'ouvre (`tel:`), cible ≥ 48 px.
- Given la première ouverture, when aucun choix de thème n'est mémorisé, then l'invitation au mode sombre s'affiche, se mémorise, et la bascule reste en en-tête.
- Given l'ajout à l'écran d'accueil (iOS Safari et Android Chrome), when il ouvre l'icône, then la PWA démarre standalone avec son icône dédiée.

## Review Triage Log

### 2026-10-22 — Review pass 1 (blind-hunter 15, edge-case-hunter 11, verification-gap 5 ; 31 findings)
- **patch (medium)** BF2+EC1+EC4 — empoisonnement du shell : les réponses redirigées (session expirée → `/connexion-volontaire` 200) et un portail captif sont cachés sous la clé `/volontaires` — le repli hors-ligne servirait la page de connexion. Garde `redirected`/URL finale dans `reseauDabord` et à l'install.
- **patch (medium)** EC3+EC11(claim) — la PREMIÈRE visite ne précache que le HTML : CSS/JS chargés avant l'enregistrement du SW ne sont jamais cachés → hors-ligne après une seule visite = fiche non stylée (AC non tenu). Précacher les sous-ressources du shell à l'install (parse des `link`/`script` du HTML).
- **patch (medium)** BF1+EC6 — la déconnexion ne purge rien : IDB + caches SW (état mis en cache, données personnelles) survivent au logout — appareil partagé, fiche du prédécesseur servie si le réseau tombe avant la revalidation du suivant. Purge IDB + caches `az-volontaires-*` au logout.
- **patch (low)** BF3+EC2+EC5 — robustesse SW : navigation `!ok` en ligne → repli cache au lieu de l'erreur serveur ; `cache.put` protégé (quota) ; `cacheFirst` attrape l'échec offline (réponse 503 propre, jamais de promesse rejetée dans respondWith).
- **patch (low)** BF4 — handler fetch sans contrôle d'origine : une requête cross-origin au chemin ressemblant serait interceptée ; garde `url.origin === self.location.origin`.
- **patch (low)** BF6 — lecture IDB sans validation : un enregistrement d'un autre schéma ferait planter le rendu (`.length` sur undefined) ; garde de forme (Array.isArray) → null.
- **patch (low)** BF10+EC7+EC8 — le repli IDB écrase l'état SSR même plus ancien, et un 5xx en ligne s'affiche « HORS-LIGNE PRÊT » : comparer `generéA` (garder le plus frais), badge hors-ligne seulement si `navigator.onLine === false`.
- **patch (low)** BF11+EC10 — régressions vs 3.2 sur la branche d'erreur : LogoutButton retiré (plus moyen de se déconnecter), email du compte plus affiché — réintroduire les deux.
- **patch (low)** BF12+VG2 — le SW n'est couvert que par des assertions TEXTUELLES (`toContain`) : ses stratégies offline (cœur de la story) peuvent régresser sans signal. Test comportemental : exécuter le SW avec `self`/`caches`/`fetch` stubés (style stub maison du repo) — repli etat 503, repli navigation shell, non-interception des routes hors périmètre.
- **patch (low)** VG1 — `Service-Worker-Allowed` servi sans test : retirer l'entrée headers tue le offline silencieusement (le `.catch` avale). Test unitaire sur `nextConfig.headers()`.
- **patch (low)** VG3+BF5(partie serveur) — `/volontaires` réécrite sans `page.test.tsx` alors que toutes les pages sœurs en ont un (convention repo) : SSR fiche + `assistancePhone` + branche d'erreur.
- **patch (low)** BF7+BF8+BF9+BF13+BF14+BF15+VG5 — hygiène : `libelleDateCourte` mort (supprimer + tests), enveloppe `volontaires.db_unavailable` dédiée (fini `admin.*` sur la surface volontaires), `readAssistancePhone` stubbé dans route.test (env-dépendant), assertion vacuous `new Date()` remplacée, commentaire next.config inexact corrigé (l'en-tête élargit la portée, il ne la réduit pas), themeColor layout aligné sur Djurdjura (#345E4A), meta `appleWebApp.capable` pour les iOS anciens.
- **defer** BF5(partie client)+VG4 — tests des effets du composant client (revalidation → IDB, 401 → écran déconnecté) : aucun harnais DOM dans le repo (vitest node, pas de jsdom/testing-library) ; décision d'outillage au-delà de la story.

## Design Notes

- « Préchargée à l'affectation » sans push : l'état est rappelé **à chaque ouverture en ligne** et persisté — dès que le volontaire rouvre (ou rafraîchit) après l'affectation, la fiche est dans la poche ; le message d'attente le documente.
- Deux niveaux de repli : le SW sert le shell hors-ligne ; IndexedDB porte les données (le HTML SSR mis en cache ne serait pas seul juge de paix — l'épopée 4 réutilisera ce store pour l'outbox).
- PNG sans dépendance : encodeur maison (IHDR/IDAT/IEND via `node:zlib`) — les icônes sont commitées, le script reste pour la régénération ; design volontairement simple (aplat Djurdjura + chevron).
- Le SW n'intercepte que les routes volontaires : la vitrine, l'admin et l'espace coureur ne passent jamais par lui (aucun risque de contamination des budgets/stratégies).
- Le scan reste « une mission parmi d'autres » : la fiche d'une mission `scan_checkpoint` s'affiche comme toute fiche, sans bouton caméra — l'épopée 4 greffera le sien sur ce shell.

## Verification

**Commands:**
- `pnpm -F @azzel/web icons:generate` -- expected: PNGs régénérés à l'identique (déterministe).
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (nouveaux tests routes/IDB/fraîcheur/état étendu).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé (SW/manifeste/ICSS hors chunk vitrine).

**Manual checks (if no CLI):**
- Chrome DevTools offline après visite connectée : `/volontaires` rend la fiche + badge HORS-LIGNE PRÊT ; onglet Application : SW actif, IndexedDB peuplé, manifeste valide (installable) ; Lighthouse PWA installable ; iOS Safari : Partage → Sur l'écran d'accueil → icône dédiée → ouverture standalone → mode avion → fiche consultable.
