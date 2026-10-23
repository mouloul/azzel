import { datetimeLocalVersIso, isoVersDatetimeLocal } from '@azzel/shared';

import {
  ABANDON_FIELD_ORDER,
  LIBELLES_MOTIF_ABANDON,
  MOTIFS_ABANDON,
  hasAbandonFieldErrors,
  normaliserSaisieAbandon,
  validerSaisieAbandon,
  type AbandonField,
  type AbandonFieldErrors,
  type MotifAbandon,
} from '@/modules/chrono/domain';

// Story 5.3 — dérivations du formulaire d'abandon (calque alertes-course :
// fonctions pures, testées hors effets). La validation réutilise CELLE du
// domaine chrono (mêmes règles serveur — jamais réinventées) ; ici ne restent
// que la forme du formulaire (datetime-local), la conversion heure locale →
// ISO UTC (helpers transverses de @azzel/shared, piègeux fuseaux) et
// l'assemblage du corps POST.

/** Valeurs du formulaire inline : heure en datetime-local (heure du poste PC). */
export interface ValeursFormulaireAbandon {
  dossard: string;
  lieu: string;
  motif: MotifAbandon | '';
  heure: string;
}

/**
 * Valeurs initiales : dossard PRÉ-REMPLI depuis une ligne d'alerte (action
 * « Saisir l'abandon ») ou vide (bouton d'en-tête), heure = MAINTENANT en
 * datetime-local — calculé à l'OUVERTURE côté client, jamais au rendu serveur.
 */
export function valeursAbandonInitiales(
  dossardPreRempli: number | null,
  maintenant: Date,
): ValeursFormulaireAbandon {
  return {
    dossard: dossardPreRempli !== null ? String(dossardPreRempli) : '',
    lieu: '',
    motif: '',
    heure: isoVersDatetimeLocal(maintenant.toISOString()),
  };
}

/**
 * Validation LOCALE (retour immédiat, focus premier champ en erreur) : mêmes
 * règles que le serveur — le dossard devient nombre, l'heure datetime-local
 * devient ISO, puis validerSaisieAbandon décide. Le serveur revalide tout.
 */
export function validerFormulaireAbandon(
  values: ValeursFormulaireAbandon,
  maintenant: Date,
): AbandonFieldErrors {
  return validerSaisieAbandon(
    normaliserSaisieAbandon({
      dossard: values.dossard.trim(),
      lieu: values.lieu,
      motif: values.motif === '' ? null : values.motif,
      heure: datetimeLocalVersIso(values.heure) || null,
    }),
    maintenant,
  );
}

export function aDesErreursAbandon(errors: AbandonFieldErrors): boolean {
  return hasAbandonFieldErrors(errors);
}

/** Premier champ en erreur (ordre ABANDON_FIELD_ORDER) — cible du focus. */
export function premierChampAbandonEnErreur(errors: AbandonFieldErrors): AbandonField | null {
  return ABANDON_FIELD_ORDER.find((champ) => typeof errors[champ] === 'string') ?? null;
}

/** Corps JSON du POST /api/admin/course/abandon : heure locale → ISO UTC. */
export function corpsAbandonSoumis(values: ValeursFormulaireAbandon): Record<string, unknown> {
  return {
    dossard: Number(values.dossard.trim()),
    lieu: values.lieu.trim(),
    motif: values.motif,
    heure: datetimeLocalVersIso(values.heure),
  };
}

/** Options du select motif (liste fermée métier, libellés français). */
export function optionsMotifAbandon(): { valeur: MotifAbandon; libelle: string }[] {
  return MOTIFS_ABANDON.map((motif) => ({ valeur: motif, libelle: LIBELLES_MOTIF_ABANDON[motif] }));
}
