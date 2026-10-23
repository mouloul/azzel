import {
  hasAnnulationFieldErrors,
  normaliserSaisieAnnulation,
  validerSaisieAnnulation,
  type AnnulationFieldErrors,
} from '@/modules/chrono/domain';

// Story 5.4 — dérivations du dialogue d'annulation (calque abandon-form :
// fonctions pures, testées hors effets). La validation réutilise CELLE du
// domaine chrono (mêmes règles serveur — jamais réinventées) ; ici ne restent
// que la forme du dialogue (textarea motif) et l'assemblage du corps POST.

/** Cible du dialogue : la ligne de board qui fait foi (événement arbitré). */
export interface CibleAnnulation {
  evenementId: string;
  dossard: number;
  checkpointTitre: string;
  /** Réception SERVEUR ISO — affichée en heure locale client (calque boards). */
  horodatageReception: string;
}

/** Valeurs du dialogue inline : un seul champ, le motif OBLIGATOIRE. */
export interface ValeursFormulaireAnnulation {
  motif: string;
}

export function valeursAnnulationInitiales(): ValeursFormulaireAnnulation {
  return { motif: '' };
}

/**
 * Validation LOCALE (retour immédiat) : mêmes règles que le serveur — la
 * cible fournit l'evenementId (state du board, jamais tapé à la main), le
 * motif devient trimé puis validerSaisieAnnulation décide (1–500). Le
 * serveur revalide tout.
 */
export function validerFormulaireAnnulation(
  cible: CibleAnnulation,
  values: ValeursFormulaireAnnulation,
): AnnulationFieldErrors {
  return validerSaisieAnnulation(
    normaliserSaisieAnnulation({ evenementId: cible.evenementId, motif: values.motif }),
  );
}

export function aDesErreursAnnulation(errors: AnnulationFieldErrors): boolean {
  return hasAnnulationFieldErrors(errors);
}

/** Corps JSON du POST /api/admin/course/annulation. */
export function corpsAnnulationSoumis(
  cible: CibleAnnulation,
  values: ValeursFormulaireAnnulation,
): Record<string, unknown> {
  return {
    evenementId: cible.evenementId,
    motif: values.motif.trim(),
  };
}

/** aria-label du bouton de ligne (spec 5.4) : la cible se porte à elle-même. */
export function ariaLabelAnnulation(cible: Pick<CibleAnnulation, 'dossard' | 'checkpointTitre'>): string {
  return `Annuler le passage — dossard ${cible.dossard} à ${cible.checkpointTitre}`;
}
