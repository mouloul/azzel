---
title: 'Confirmation claire après l’envoi de la preuve de paiement'
type: 'bugfix'
created: '2026-11-11'
status: 'done'
route: 'oneshot'
baseline_commit: '372cce6c31c327ce5b6a164b01908cf13ce9d789'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur `/preuve`, après un envoi réussi, rien ne confirme l'envoi : le bouton disparaît, le formulaire reste identique et seul « Retour à mon espace » reste visible. Le coureur ne sait pas si sa preuve est partie. La page n'est pas non plus rafraîchie : statut (désormais « en validation ») et fil d'étapes restent périmés.

**Approach:** Après un envoi réussi, remplacer le formulaire par un encart de confirmation (preuve reçue, dossier en validation, email à la décision) avec deux actions — « Voir mon dossier » (principale) et « Remplacer ma preuve » (rouvre le formulaire) —, y amener le focus, et rafraîchir les données serveur de la page.

</frozen-after-approval>

## Implementation Notes

- `app/preuve/preuve-envoyee.tsx` (nouveau) : encart d'accusé de réception sans état (réception, « en validation », email à la décision, n° de transaction), actions « Voir mon dossier » et « Remplacer ma preuve ». Composant séparé pour être testable en rendu serveur (le projet n'a pas d'outillage DOM).
- `app/preuve/preuve-form.tsx` : état `envoye` posé au succès ; le formulaire, l'aperçu et « Retour à mon espace » cèdent la place à l'encart ; focus déplacé sur l'encart (le bouton d'envoi disparaît) ; `router.refresh()` pour que statut et fil d'étapes, rendus serveur, passent « en validation ». « Remplacer ma preuve » rouvre le formulaire.
- `app/dossier.css` : `.confirmation-box`, gabarit de `.error-box` avec le jeton `--az-succes`.
- `app/preuve/preuve-envoyee.test.tsx` : 6 tests de rendu.
- Après revue : encarts serveur masqués pendant l'accusé de réception ; trois messages (premier dépôt, remplacement, même fichier déjà enregistré) ; annonce par le focus seul ; focus rendu au champ fichier au retour ; « C'est bon : » retiré (demande PO).

## Review Triage Log

| # | Constat (Blind Hunter) | Verdict | Preuve / suite |
|---|---|---|---|
| 1 | Encarts serveur (montant, comptes « saisis ci-dessous », « en cours de validation » après rafraîchissement) au-dessus de l'accusé, en double | medium | `page.tsx:212` rend `.encart-attente` en validation — patch : `children` masqués pendant l'accusé |
| 2 | Même fichier renvoyé : « nouvelle preuve… remplace la précédente » faux | medium | `proof-service.ts:170` renvoie la preuve existante — patch : variante `deja-recue` (même `id`) |
| 3 | Focus perdu au retour vers le formulaire | low | « Remplacer ma preuve » démonté — patch : focus sur le champ fichier |
| 4 | Région live + focus + actions dans l'encart, sans nom accessible | low | patch : focus seul, `aria-labelledby` |
| 5 | Intégration `PreuveForm` (bascule, refresh, focus) non testée | low | Rejeté : aucun outillage DOM dans le projet (déjà reporté) ; branches du composant couvertes |
| 6 | Indentation trompeuse du bloc enveloppé | low | patch : bloc réindenté |
| 7 | Commentaire CSS « même gabarit que .error-box » inexact | low | patch : commentaire corrigé |
| 8 | Spec sans critères d'acceptation | false | Format oneshot volontaire (intention gelée seule) |
