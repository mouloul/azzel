---
title: 'Story 1.7 — Checklist de dossier self-service'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '0275f36'
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Le coureur ne voit pas d'un coup d'œil ce qui manque dans son dossier — il navigue entre inscription, acceptations et preuve sans vue consolidée (FR-5, UX-DR-10).

**Approach:** Service de consolidation `getChecklistState` (lecture seule des états existants : compte vérifié par existence, formulaire, décharge, règlement, preuve active, validation organisateur) + page /checklist dans l'espace coureur : une ligne d'état par pièce (puce verte si faite, sinon texte secondaire + l'action nommée en lien direct), compteur de pièces, tout vert → bandeau verbatim « Dossier validé — dossard prêt », assistance toujours visible, refus → motif + action redéposer.

## Boundaries & Constraints

**Always:**
- Six pièces : email vérifié (le compte existe = vérifié), épreuve choisie (formulaire soumis), décharge acceptée, règlement accepté, preuve déposée (active), dossier validé (statut `validé`).
- Chaque pièce manquante nomme l'action à faire **en lien direct** vers la page concernée (/inscription, /acceptations, /preuve) — libellés verbatim de la spine (ex. « Dépose ta preuve de paiement CCP »).
- Compteur affiché (« 4 pièces sur 6 ») ; tout vert → bandeau « Dossier validé — dossard prêt » (verbatim).
- Statut `refusé` : ligne validation en échec avec le motif + action « Déposer une nouvelle preuve » ; assistance « Appeler l'équipe » visible en permanence sur la page (SM-C1, UX-DR-11).
- Lecture SEULE : aucune écriture, aucun nouvel endpoint mutateur ; tutoiement (espace coureur connecté) ; tokens charte, accessible (liste sémantique, états portés par texte ET couleur, jamais la couleur seule).
- Inscriptions fermées : la checklist reste consultable (lecture), les liens restent affichés mais les pages cibles gèrent déjà leurs propres états fermés.

**Never:**
- Pas de e-dossard ni QR (épopée 4), pas d'email (1-8), pas de modification des gardes existantes.
- Pas de nouvelle donnée en base — consolidation d'états existants uniquement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dossier complet | statut validé | 6/6, bandeau « Dossier validé — dossard prêt » | No error expected |
| Dossier en cours | preuve manquante seule | 5/6, ligne preuve = action « Dépose ta preuve de paiement CCP » (lien /preuve) | No error expected |
| Dossier refusé | statut refusé + motif | Ligne validation : motif + « Déposer une nouvelle preuve » + assistance | No error expected |
| Non inscrit | session sans coureur | Lignes formulaired/acceptations/preuve en action, email vérifié vert | No error expected |
| Non connecté | sans session | Redirection /connexion | 401/redirect |
| DB indisponible | erreur store | État indisponible propre (message + action), pas de 500 | Enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/modules/inscriptions/service.ts` — getInscriptionState (coureur, edition), getAcceptancesState, getPreuveState : sources à consolider ; ajouter getChecklistState qui orchestre et retourne les six pièces {id, libellé, fait, actionLabel?, actionHref?, motifRefus?}.
- `apps/web/src/app/espace-coureur/page.tsx` — remplacer les lignes éparses par la checklist (ou inclure /checklist comme vue principale de l'espace coureur — décision : la checklist DEVIENT la page /espace-coureur, pas une nouvelle route).
- `apps/web/src/components/assistance-button.tsx` — réutiliser tel quel.
- `apps/web/src/app/globals.css` — classes charte existantes (cards, chips succès/échec), puces.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/service.ts` -- getChecklistState(session) : consolidation, statuts dérivés, aucune écriture.
- `apps/web/src/app/espace-coureur/page.tsx` -- réécriture : checklist six pièces (liste ordonnée sémantique, puce verte/texte secondaire + lien action), compteur, bandeau verbatim si complet, motif refus, assistance permanente, états indisponible/401 existants conservés.
- `apps/web/src/app/globals.css` -- styles checklist (minimal, tokens charte).
- `apps/web/src/modules/inscriptions/checklist.test.ts` + intégration -- chaque ligne de matrice (consolidation des six pièces aux états variés, refus, non inscrit, indisponible).

**Acceptance Criteria:**
- Given un dossier complet, when le coureur ouvre son espace, then les six puces sont vertes, le compteur affiche 6/6 et le bandeau « Dossier validé — dossard prêt » apparaît.
- Given une pièce manquante, when la checklist s'affiche, then la ligne nomme l'action en lien direct vers la page qui la résout.
- Given un dossier refusé, when le coureur consulte, then le motif et l'action « Déposer une nouvelle preuve » sont visibles avec l'assistance.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 15 findings — high 0, medium 4, low 8, false 0, maybe-false 0 (8 entrées patch, 1 defer, 2 rejets implicites)
- findings (résumé) :
  - `[medium]` `[patch]` « Remplacer ma preuve » supprimé — plus de chemin vers /preuve une fois déposée (BH1+EC2).
  - `[medium]` `[patch]` « Modifier mon inscription » supprimé (BH2).
  - `[medium]` `[patch]` Dégradation graduelle perdue : échec preuve = checklist entière indisponible (BH3+EC1) — allSettled + pièce dégradée.
  - `[medium]` `[patch]` Récap personnel supprimé (BH4) — restauré en compact (épreuve, catégorie, t-shirt, urgence, date).
  - `[low]` `[patch]` Actions non conditionnées à canDepositPreuve/registrationOpen — liens morts (BH5+BH10) ; « En attente de validation » à un non-inscrit (BH6) ; CTA dupliqué décharge/règlement (BH7) ; gardes [0]! opaques + afterEach mort + intégrations fermées/refus-redépôt manquantes (BH8+EC3+EC4) ; extraction etatPiece/compteur/bandeau en module pur testé (VG1 partiel — le contrat verbatim du rendu est épinglé sans stack UI).
  - `[defer]` Rendu de page complet sans test (VG1 reste) — dette UI tracée.
  - IA — divergence L3 (remplacement vs ajout) résolue par la restauration du récap ; « validation sans action » conforme spec.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Checklist self-service = écran principal de l'espace coureur : six pièces (email, formulaire, décharge, règlement, preuve, validation) avec états Fait/À faire/Refusé/En attente, actions en liens directs conditionnées (déposer/remplacer preuve selon canDepositPreuve, modifier inscription si ouvert, neutralisation « Inscriptions fermées »), compteur pluriel, bandeau verbatim « Dossier validé — dossard prêt », motif de refus + assistance permanente, récap compact restauré, dégradation graduelle (preuve indisponible seule), module de vue pur testé (checklist-view).

### Revue
4 couches — 15 constats → 8 patchs (4 medium, 4 low) corrigés (311/312 verts, 1 skip documenté) ; 1 defer.

**Recommandation de re-revue : true** — 4 medium patchées ; risques nommés : (1) rendu de page sans test de composant (dette UI, contrat verbatim épinglé au niveau vue pure), (2) parcours navigateur manuel recommandé (bandeau, dégradé, fermé).

### Vérification
`pnpm test` 311 passés + 1 skip (25 fichiers, intégrations exécutées) ; `pnpm build` + `pnpm typecheck` verts.

## Spec Change Log

## Review Triage Log

## Design Notes

La checklist devient l'écran principal de l'espace coureur (une seule vue, pas de navigation imposée) — conforme UX-DR-10 (« compteur de pièces, puce verte/lien action par pièce manquante, tout vert → bandeau »). Les états proviennent des services existants : aucune dupplication de requête SQL au-delà de ce que getInscriptionState/getAcceptancesState/getPreuveState font déjà (trois lectures, une page).

## Verification

**Commands:**
- `pnpm test` -- expected: suite verte, matrice checklist couverte.
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- `pnpm dev:web` → parcours coureur : vider/remplir les pièces une à une, vérifier compteur/libellés/bandeau/motif de refus/assistance.
