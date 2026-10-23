---
title: 'Story 4.2 — Moteur de scan caméra et états de retour'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'd86de93'
baseline_commit: 'd86de934fbbac3fe3ac11ed5d4df04244e08facc'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-4-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le volontaire scanneur n'a pas de caméra : en zone blanche, impossible de lire les e-dossards — le moteur plein écran (BarcodeDetector + fallback iOS), ses trois états (succès/doublon/inconnu) et la pédagogie permission n'existent pas (FR-13 socle, NFR-1, UX-DR-6/7/18).

**Approach:** Page `/volontaires/scan` (client, caméra plein écran `facingMode: environment`) débloquée depuis `/volontaires` quand le volontaire a une mission `scan_checkpoint`. Décodeur unifié : `BarcodeDetector` natif si dispo, fallback `@zxing/browser` (dépendance nouvelle, import dynamique — hors bundle initial). Trois états de voyant calculés contre l'annuaire IndexedDB (index `indexerAnnuaire`) + dédoublonnage de session : succès (jeton résolu), doublon (déjà scanné dans la session), inconnu (payload invalide ou jeton absent → `DOSSARD INCONNU`). Bips WebAudio distincts + vibration, débloqués au tap « Démarrer le scan » ; écran dédié permission refusée (UX-DR-18) ; voile ≥ 96 %, badges LIVE/heure/mission.

## Boundaries & Constraints

**Always:**
- Confirmation < 1 s : bip + voyant dès le décodage — jamais de bouton « valider » intermédiaire ; chaque état a sa mélodie (succès/doublon/inconnu distinctes) + vibration (3ᵉ canal) + texte intégral — jamais la couleur seule.
- Voyant (UX-DR-7) : pill plein cadre ≥ 96 px de haut, texte ≥ 24 px graisse 800, heure mono ≥ 16 px ; `role="status"` + `aria-live="assertive"` ; clignotement ≤ 1 flash/s, statique sous `prefers-reduced-motion` ; doublon (↻) et inconnu (⚠) différenciés par icône ET position.
- Lecture : `BarcodeDetector` si disponible, sinon `@zxing/browser` TOUJOURS actif (iOS Safari) ; l'audio (AudioContext) et la vibration ne partent qu'après le premier geste utilisateur.
- Permission caméra refusée/indisponible : détection au premier lancement → écran dédié « Autoriser la caméra » avec chemin Réglages complet (iOS + Android) + bouton assistance PC ; le scan ne démarre qu'avec caméra accessible.
- Annonce de démarrage `role="status"` : « caméra active · annuaire chargé » (ou ce qui manque).
- Voile quasi opaque ≥ 96 % derrière tout texte du cadre ; badges « · LIVE » + heure locale (mono, mise à jour live) + mission en cours ; pause/stop ≥ 64 dp.
- Validation contre la réplique **IndexedDB** (annuaire v2 via `indexerAnnuaire` — jamais de réseau) ; sans annuaire → état bloquant « charge l'annuaire d'abord » (pas de scan à l'aveugle).
- Résolution du coureur via `decoderPayloadEdossard` + index jeton — jamais le dossard nu n'est scanné directement.

**Never:**
- Pas de persistance des scans ni d'outbox (4.3 retraits, 4.4 passages, 4.5 sync) — le dédoublonnage 4.2 est de SESSION (en mémoire).
- Pas de scan en mode photo/flash, pas de sélecteur de caméra UI (caméra arrière imposée), pas de nouvelle page hors scope `/volontaires`.
- Pas de lib QR côté serveur ni dans le bundle initial (import dynamique uniquement).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Démarrer | tap « Démarrer le scan » | AudioContext résumé, caméra arrière plein écran, annonce « caméra active · annuaire chargé », badges LIVE/heure/mission | getUserMedia échoue → écran permission |
| Scan succès | QR `azzel-e1:<jeton>` connu | Voyant « ✓ Dossard N — {prénom} » + heure, bip succès, vibration ; < 1 s | No error expected |
| Scan doublon | même jeton re-scanné (session) | « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », bip doublon distinct, le premier reste la référence | No error expected |
| Scan inconnu | payload non-e1 OU jeton absent de l'annuaire | « ⚠ DOSSARD INCONNU — revérifier » + bouton Appeler le PC, bip inconnu | No error expected |
| Permission refusée | getUserMedia NotAllowedError | Écran « Autoriser la caméra » : chemins Réglages iOS/Android complets + assistance | pas de boucle de relance |
| Caméra indisponible | aucun device / NotFoundError | Même écran, variante « caméra indisponible » + assistance | No error expected |
| Annuaire absent | IndexedDB vide | État bloquant « Annuaire non chargé — connecte-toi une fois en ligne » + retour, scan refusé | No error expected |
| Pause/stop | bouton stop | Caméra libérée (tracks stoppés), décodeur arrêté, retour /volontaires | cible ≥ 64 dp |
| Reduced motion | prefers-reduced-motion | Voyants statiques (aucun clignotement) | No error expected |
| Fallback iOS | pas de BarcodeDetector | @zxing/browser prend le relais, mêmes états < 1 s | import échoué → message + assistance |
| Hors-ligne | réseau absent | Le scan fonctionne intégralement (page visitée une fois en ligne, SW + IndexedDB) | No error expected |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/volontaires/` — PWA 3.3/3.4 : entrée « Démarrer le scan » (si mission `scan_checkpoint` dans mesMissions), SW scopé couvrant `/volontaires/scan` (navigations réseau-d'abord + repli).
- `apps/web/src/lib/idb-volontaires.ts` — `lireAnnuaire()` pour la réplique locale.
- `packages/shared` — `decoderPayloadEdossard`, `indexerAnnuaire`, `DOSSARD_INCONNU_LABEL` (contrats 4.1) : le moteur consomme, ne réinvente pas.
- `apps/web/src/lib/fraicheur.ts` — patterns de formatage heure locale (heure mono du voyant).
- `apps/web/src/app/espace-coureur/e-dossard/page.tsx` — le QR encodé `azzel-e1:` (source de vérité du payload à scanner, utile aux tests).
- `apps/web/package.json` — ajouter `@zxing/browser` ^0.2.1 (+ peer `@zxing/library` si requis) ; import dynamique dans le décodeur.
- `apps/web/src/lib/annuaire-replique.ts` — pattern de module pur testé pour la logique d'états.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/lib/scan/etats-scan.ts` (+ tests) — logique pure : `resoudreScan(payload, indexAnnuaire, dejaVus)` → `{ etat: 'succès'|'doublon'|'inconnu', coureur?, dossard?, premierVuA? }` ; payloads invalides → inconnu ; doublon = jeton déjà vu EN SESSION (le premier reste) ; types + labels exacts du voyant.
- [x] `apps/web/src/lib/scan/audio-scan.ts` (+ tests) — AudioContext paresseux, `debloquer()` (premier geste), `bipSucces()/bipDoublon()/bipInconnu()` aux mélodies DISTINCTES (fréquences/durées testables), `vibrer(etat)` via navigator.vibrate (gardes SSR/absence) ; silencieux sans geste.
- [x] `apps/web/src/lib/scan/decodeur-qr.ts` (+ tests avec BarcodeDetector/zxing mockés) — `lancerDecodeur(video, onPayload, { preferencedetector })` : BarcodeDetector en boucle (requestAnimationFrame/interval) si dispo, sinon `@zxing/browser` importé dynamiquement ; `arreter()` libère tout (stream + boucle + reader) ; aucun double déclenchement du même payload en rafale (anti-rebond ~1 s).
- [x] `apps/web/src/app/volontaires/scan/page.tsx` + `scan-client.tsx` + `scan.css` — page client : garde volontaire (serveur), états permission (écran UX-DR-18 complet iOS/Android + assistance), annuaire absent (bloquant), actif : caméra plein écran `environment`, voile ≥ 96 %, badges « · LIVE » + heure locale mono live + mission scan en cours, voyant UX-DR-7 (3 états, icônes ↻/⚠, clignotement ≤ 1/s réduit sous prefers-reduced-motion), bouton stop ≥ 64 dp libérant caméra/décodeur, annonce démarrage role=status ; tutoiement.
- [x] `apps/web/src/app/volontaires/volontaires-pwa.tsx` — bouton « Démarrer le scan » vers `/volontaires/scan` visible uniquement si une mission `scan_checkpoint` est dans mesMissions (le scan reste « une mission parmi d'autres »).
- [ ] Tests — etats-scan (matrice complète), audio (3 mélodies distinctes, gardes), decodeur (fallback zxing déclenché sans BarcodeDetector, anti-rebond, arrêt propre), page (permission refusée → écran dédié + assistance ; entrée gating sur /volontaires ; reduced-motion class), aucun appel réseau.

**Acceptance Criteria:**
- Given un annuaire chargé et la permission caméra, when le scanneur scanne un e-dossard connu puis le rescanne puis scanne un QR inconnu, then trois voyants distincts s'affichent en < 1 s avec bips différents et textes intégraux (« ✓ Dossard N », « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS », « ⚠ DOSSARD INCONNU — revérifier »).
- Given la permission caméra refusée au premier lancement, when l'écran dédié s'affiche, then les chemins Réglages iOS et Android sont complets et le bouton assistance PC est présent — le scan ne démarre pas.
- Given un appareil sans BarcodeDetector (iOS Safari), when le scan démarre, then @zxing/browser décode et tous les états fonctionnent à l'identique.

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 12, edge-case-hunter 6, verification-gap 2 ; ~20 findings)
- **patch (medium)** BF1 — « mission en cours » non résolue temporellement : première mission scan arbitraire (passée/future) quand plusieurs — fenêtre horaire debutLe ≤ now ≤ finLe via helper pur testé.
- **patch (medium)** BF4+EC1 — décodeur muet en cas d'échec persistant : detect() en erreur avalée indéfiniment (caméra vivante, zéro scan) et piste caméra 'ended' non écoutée (LIVE figé) — compteur d'échecs borné + listener ended → signal → écran/annonce dédiés.
- **patch (low)** BF5+VG1 — orchestration session non testée : extraire `resoudreEtEnregistrer` pur (résout + enregistre le jeton au premier succès), testé par le vrai câblage (2ᵉ lecture → doublon, annuaire vide → refus).
- **patch (low)** P (BF16+EC5) — repli SW : /volontaires/scan jamais visitée hors-ligne sert le shell fiche sous l'URL scan (CTA bouclant sur lui-même) — page d'explication dédiée à la place.
- **patch (low)** BF8 — voyant clignotant sans expiration (un succès de 15 min pris pour l'état courant) : clignotement arrêté après ~6 s, texte conservé.
- **patch (low)** BF10+EC2+EC3+EC6(claim) — audio : webkitAudioContext non essayé (vieux iOS cibles du fallback zxing) ; contexte suspendu → bips empilés éclatant à la reprise ; vibrer() non gated par le geste (contrat documenté).
- **patch (low)** BF9 — fallback `new Date(0)` du libellé doublon masquant un bug — libellé neutre sans heure.
- **patch (low)** BF6+BF12+BF11+EC4 — hygiène : deps d'effet `[phase === 'active']` non idiomatiques (extraire `actif`) ; scroll arrière-plan non verrouillé sous l'écran fixed (iOS) ; libellé « Scan checkpoint » dupliqué (LIBELLES_MISSION_TYPE) ; anti-rebond sensible au recul NTP de Date.now().
- **patch (low)** BF7 — assertions CSS garde-fous non scopées aux sélecteurs (elles passent via n'importe quelle règle du fichier).
- **defer** BF2 — garde d'affectation absente sur /volontaires/scan en accès URL direct : l'entrée fiche est gated, l'URL directe est une intention explicite (guichet) — bloquer serait de la friction ; tranché avec la revue.
- **defer** VG2 — missionLabel transmis au badge non observé (écran actif inaccessible au harnais SSR) : cosmétique, à extraire si 4.3/4.4 réutilisent la résolution.
- **false** BF3 — spec `in-progress` vs sprint `review` : états pilotés par le workflow (synchronisés à la clôture).

## Design Notes

- Le dédoublonnage de session (Map jeton→premierVuA) est volontairement en mémoire : 4.3/4.4 le remplaceront par leurs clés naturelles persistées (retrait par coureur, passage par checkpoint) — `resoudreScan` prend la structure déjàVus en paramètre pour cela.
- `@zxing/browser` en import dynamique : ~200 Ko hors bundle initial (budget accueil intact) ; chargé au premier démarrage du scan, en ligne — le SW cache le chunk au premier usage (statiques cache-first).
- L'anti-rebond (~1 s même payload) évite le mitraillage du voyant quand le QR reste dans le cadre — distinct du doublon de session.
- L'heure du voyant est celle de l'appareil (donnée locale, AD-3 : jamais un temps « définitif ») — affichée mono HH:MM:SS.

## Verification

**Commands:**
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (etats-scan, audio, decodeur, pages).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé (zxing en chunk dynamique — vérifier qu'aucun chunk initial ne l'importe).

**Manual checks (if no CLI):**
- Chrome/Android : refuser la caméra → écran dédié ; autoriser → scan d'un vrai QR (généré sur /espace-coureur/e-dossard) → voyant succès < 1 s + bip ; rescan → doublon ; QR quelconque → inconnu ; DevTools offline → scan toujours fonctionnel ; iPhone Safari → fallback zxing.
