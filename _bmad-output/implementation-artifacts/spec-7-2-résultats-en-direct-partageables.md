---
title: 'Story 7.2 — Résultats en direct partageables'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '4df6c9d'
baseline_commit: '4df6c9d1fd18bcb87a5e42ea765935af4f4f2ce6'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-7-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La course reste invisible de l'extérieur le jour J : aucune page publique de résultats n'existe, aucun rafraîchissement live n'est servi, et la portée des partages (FR-16/SM-5) n'est mesurée nulle part — Malika depuis Tizi Ouzou ne peut rien suivre.

**Approach:** 1) Page publique `/resultats` (SSR + composant client de polling `/api/resultats` toutes les 10 s, pause onglet caché — AD-7 : polling servi par le backend, JAMAIS de realtime Supabase côté navigateur) : classements par épreuve du contrat 7.1 (« Classement provisoire » en toutes lettres + fraîcheur « synchronisé il y a X min »), derniers arrivés (10), badge dossard mono, témoin live (point pulsé, statique sous prefers-reduced-motion), registre sobre vouvoyé. 2) État vide avant départ : « Pas encore de partants — départ à HH:MM » (prochaine heure de départ configurée). 3) Partage : l'URL `/resultats?partage=1` est l'URL partageable ; chaque chargement de page avec le paramètre incrémente un compteur ANONYME agrégé par jour (aucune donnée personnelle : ni IP, ni user-agent stockés) — migration 0034 `resultats_visite` — l'API de polling ne compte JAMAIS (pas de double comptage). 4) Lien « Résultats » dans la navigation publique.

## Boundaries & Constraints

**Always:**
- Tout résultat public transite par le backend (org par défaut, pattern `readDefaultOrgPartenaires`) ; aucune lecture directe base depuis le navigateur, aucune lib realtime (AD-7).
- Anonymat strict : seul identifiant exposé = dossard (qualifié par épreuve/édition dans le contexte) — jamais nom, contact, photo.
- « Classement provisoire » en toutes lettres + fraîcheur sur TOUT état rafraîchi ; jamais « officiel », jamais « temps réel » ; état vide verbatim « Pas encore de partants — départ à HH:MM » (ou neutre si aucune heure configurée).
- Comptage partage : upsert agrégat (organisation, édition, jour, visites) dans UNE transaction ; aucune donnée personnelle collectée ; le polling sans paramètre ne compte pas ; un échec de comptage n'affecte JAMAIS le rendu de la page.
- Polling : 10 s, `visibilitychange` (pause caché), jamais de requête simultanée, squelette de chargement calqué sur la mise en page ; budget vitrine respecté (CSS existant, zéro lib JS lourde).
- Page lisible premier rendu < 5 s sur 3G lent (SSR complet, le client n'est qu'un rafraîchisseur).

**Never:**
- Pas de carte ni de positions (7.3) ; pas de rapport/export (7.4) ; pas de modification du calcul des classements (7.1 livré, lu tel quel).
- Pas de SSE/WebSocket (le polling suffit au budget 3G) ; pas de comptage côté client ni de stockage d'IP/UA.
- Pas de tutoiement sur la vitrine ; pas de données d'une autre organisation ; pas de page admin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page jour J | passages synchronisés, heures configurées | Classements provisoires par épreuve + fraîcheur + derniers arrivés, témoin live | N/A |
| Polling | nouveau passage sync | Mise à jour ≤ 10 s sans rechargement, jamais de requête simultanée, pause onglet caché | réseau KO → état affiché conservé + fraîcheur vieillit |
| Avant départ | aucun partant, heures configurées | « Pas encore de partants — départ à HH:MM » (prochaine heure), squelettes nuls | N/A |
| Heures absentes | aucune heure_depart | Texte neutre « Les résultats apparaîtront au départ » — JAMAIS un départ à 00:00 | N/A |
| Épreuve non configurée | heure absente pour UNE épreuve | Cette épreuve : état non configuré (pas de rangs), les autres normales | N/A |
| URL partagée | `/resultats?partage=1` | Page identique + compteur jour +1 (anonyme) ; polling sans paramètre → pas de comptage | comptage KO → page normale |
| Rechargements répétés | 3 chargements ?partage=1 | 3 visites comptées (agrégat anonyme, pas de dédoublonnage) | N/A |
| Sans paramètre | `/resultats` direct | Aucun comptage | N/A |
| API publique | GET /api/resultats | { classements (contrat 7.1), derniersArrives } no-store | base KO → 503 enveloppe vitrine douce |
| Base indisponible (SSR) | db down | Page dégradée : message + assistance, jamais d'erreur brute | N/A |
| Multi-org | org B isolée | Résultats de l'organisation par défaut uniquement | jamais de fuite |
| Reduced motion | prefers-reduced-motion | Témoin live statique (le texte « direct » porte seul l'info) | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/classements.ts` — contrat 7.1 (`ClassementsEdition`, libellé, fraîcheur) : étendre avec `DernierArrive {dossard, epreuveSlug, epreuveNom, tempsMs}` et `ResultatsPublic {classements, derniersArrives}`.
- `apps/web/src/modules/chrono/service.ts` + `store.ts` — `getClassements(organisationId)` (7.1) : y ajouter les derniers arrivés (mêmes lectures arbitrées, même transaction) + résolution org par défaut publique.
- `apps/web/src/modules/sponsors/store.ts:readDefaultOrgPartenaires` — gabarit « lecture publique pré-session, organisation par défaut ».
- `apps/web/src/app/api/admin/course/etat/route.ts` + `app/admin/course/course-live.tsx` — gabarits route JSON no-store + polling client (POLLING_MS, pause cachée, jamais simultané) à décliner en public 10 s.
- `apps/web/src/lib/course/fraicheur-course.ts` — `libellerFraicheurCourse` réutilisable tel quel.
- `apps/web/src/app/layout.tsx` — navigation publique (header/footer) : lien « Résultats ».
- `apps/web/src/app/page.tsx` + composants `aa-*`, `globals.css`/`vitrine-textes.css` — registre sobre, tokens, classes aa-* ; budget `scripts/check-budget.sh`.
- Migration : prochain numéro 0034 (inscriptions/chrono pris jusqu'à 0033) — `resultats_visite` RLS stricte, agrégats uniquement.
- Tests : `app/page.test.tsx` (rendu SSR + assertions HTML), `course-live.test.tsx` (polling client), `classements.integration.test.ts` (gabarit base réelle).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/classements.ts` (+ tests) — `DernierArrive`, `ResultatsPublic`, pure `prochaineHeureDepart(epreuves)` (plus tôt, null si aucune), `libelleEtatVide` (« Pas encore de partants — départ à HH:MM », locale fr, heure locale).
- [x] `apps/web/src/modules/chrono/` — étendre la transaction `classements()` : derniers 10 arrivés (dossard, épreuve, temps, réception DESC) ; service `getResultatsPublic()` (org par défaut, aucune session) + enveloppe d'erreur publique douce (503).
- [x] `apps/web/src/modules/chrono/migrations/0034_resultats_visite.sql` — `resultats_visite (organisation_id, edition_id, jour date, visites int)` UNIQUE (org, édition, jour), RLS stricte (aucun accès public direct) ; store `compterVisitePartage(organisationId)` upsert atomique (+1).
- [x] `apps/web/src/app/resultats/page.tsx` (+ tests) — SSR force-dynamic : getResultatsPublic, comptage `?partage=1` (best effort), état vide verbatim, registre vouvoyé, squelettes, SEO sobre (title/description), never index les dossards seuls.
- [x] `apps/web/src/app/resultats/resultats-live.tsx` (+ tests) — client : polling 10 s `/api/resultats` (pause caché, jamais simultané, `interpreterResultatPolling` calque course-live), témoin live point pulsé (statique prefers-reduced-motion), fraîcheur, skeletons calqués, échec réseau → état conservé.
- [x] `apps/web/src/app/api/resultats/route.ts` (+ tests) — GET public : org par défaut, `ResultatsPublic`, `Cache-Control: no-store`, AUCUN comptage ; base KO → 503 enveloppe vitrine douce ; jamais de donnée personnelle.
- [x] `apps/web/src/app/layout.tsx` — lien « Résultats » dans la navigation publique (header et/ou footer selon structure).
- [x] Intégration — derniers arrivés ordonnés, état vide (heures absentes → neutre, jamais 00:00), comptage partage (3 chargements = 3 visites, sans paramètre = 0, polling = 0, aucune colonne personnelle), RLS multi-org, API no-store.
- [x] Tests matrice — chaque rangée couverte (pures + page SSR + route + intégration).

**Acceptance Criteria:**
- Given des Passages synchronisés le jour J, when Malika ouvre `/resultats` (ou l'URL partagée), then classements et derniers arrivés se mettent à jour via le polling backend (≤ 10 s) sans jamais exposer la moindre donnée personnelle (AD-7, anonymat dossard).
- Given `/resultats?partage=1` chargé N fois, when le rapport 7.4 lira `resultats_visite`, then N visites anonymes sont comptées pour le jour (aucune IP/UA, aucun double comptage par polling).
- Given aucun partant, when la page s'affiche, then « Classement provisoire » + « Pas encore de partants — départ à HH:MM » (ou neutre sans heures) — jamais « officiel », jamais 00:00.
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : polling 10 s (pas de SSE — budget 3G et précèdent repo) ; comptage en agrégat quotidien anonyme upserté (suffit à la « portée des partages » de 7.4, zéro donnée personnelle) ; URL partageable = paramètre `?partage=1` simple à coller partout ; état vide calculé côté serveur depuis les heures de départ officielles 7.1.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration resultats publics)
- `pnpm budget` -- expected: succès (accueil inchangé)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | `interpreterResultatPolling` ne valide pas `classements` (payload dérivé sans epreuves → TypeError, vue blanche) — défense asymétrique. | patch |
| 2 | medium | Comptage sur TOUTE valeur de `?partage` (0/false/coquille) alors que l'URL documentée est `?partage=1` — resserrer sur '1'. | patch |
| 3 | medium | Page de partage sans métadonnées Open Graph (aperçus WhatsApp/Messenger = canal principal) — ajouter og:title/description. | patch |
| 4 | medium | Attentes SSR séquentielles (résultats → comptage → téléphone) : le comptage ajoute un aller-retour base au premier octet des chargements partagés — paralléliser. | patch |
| 5 | medium | `prochaineHeureDepart` renvoie une heure PASSÉE (départ retardé → « départ à 07:00 » à 10:30, mensonger) — prochaine heure À VENIR, repli sur la plus tôt. | patch |
| 6 | low | Comparaison lexicographique des ISO (dérive de format) — comparer par instants (Date.parse). | patch |
| 7 | medium | CSS mobile masque l'épreuve des derniers arrivés → dossard NU non qualifié (règle d'anonymat) — garder visible (compact). | patch |
| 8 | medium | TIMEOUT_FETCH = POLLING (10 s) : requête lente avale le tick suivant (stagnation ~20 s) — timeout 8 s. | patch |
| 9 | medium | API publique sans throttle ni cache : N spectateurs = N×6 lectures/min complètes — micro-cache serveur ~5 s sur getResultatsPublic. | patch |
| 10 | low | HORLOGE_MS 1 s re-rend tout pour un libellé à la minute — 10 s. | patch |
| 11 | low | Heure d'état vide rendue au fuseau du SERVEUR au SSR (flash) — placeholder '--:--' pré-montage comme la méta épreuve. | patch |
| 12 | low | AbortSignal.timeout absent Safari < 15.4 → polling mort silencieux — détection de fonctionnalité. | patch |
| 13 | medium | Fusion d'état polling (échec = état conservé) en inline non testée — extraire en pure (calque appliquerResultatPolling) + tests branche par branche. | patch |
| 14 | low | Boucle de scheduling (intervalle/visibility/enVol) sans test : aucune infrastructure d'effets client dans le dépôt (précédent course-live 5.1 identique). | différé |
| 15 | low | Branche montée (`maintenant` non null → heure locale départ) jamais exercée — test SSR avec prop injectée. | patch |
| 16 | low | Comptage incluant bots/crawlers (mesure gonflable, sans UA stocké) : limite assumée — la documenter dans la migration et les notes. | patch |
