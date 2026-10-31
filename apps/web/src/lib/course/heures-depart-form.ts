import { datetimeLocalVersIso, isoVersDatetimeLocal } from '@azzel/shared';

// Story 7.1 — dérivations de la carte « Heures de départ » (calque
// abandon-form : fonctions pures, testées hors effets). La validation de
// valeur vit dans le domaine chrono (mêmes règles serveur — jamais
// réinventées) ; ici ne restent que la forme du formulaire (datetime-local)
// et l'assemblage du corps PUT.

/** Valeurs de la carte : heure datetime-local (heure d'Alger, fuseau produit) par épreuve. */
export type ValeursHeuresDepart = Record<string, string>;

export interface EpreuveHeureDepartForm {
  epreuveId: string;
  epreuveNom: string;
  distanceKm: number;
  heureDepart: string | null;
}

/** Valeurs initiales : l'heure serveur (ISO) reconvertie en datetime-local, vide si null. */
export function valeursHeuresDepartInitiales(
  epreuves: EpreuveHeureDepartForm[],
): ValeursHeuresDepart {
  const valeurs: ValeursHeuresDepart = {};
  for (const epreuve of epreuves) {
    valeurs[epreuve.epreuveId] =
      epreuve.heureDepart !== null ? isoVersDatetimeLocal(epreuve.heureDepart) : '';
  }
  return valeurs;
}

/**
 * Corps du PUT : une ligne PAR ÉPREUVE de la carte (l'ordre serveur fait foi),
 * datetime-local → ISO UTC, champ vide → null (effacer l'heure). Le PUT est
 * un remplacement complet du lot affiché.
 */
export function corpsHeuresDepartSoumis(
  valeurs: ValeursHeuresDepart,
  epreuves: EpreuveHeureDepartForm[],
): { heures: { epreuveId: string; heureDepart: string | null }[] } {
  return {
    heures: epreuves.map((epreuve) => {
      const locale = (valeurs[epreuve.epreuveId] ?? '').trim();
      return {
        epreuveId: epreuve.epreuveId,
        heureDepart: locale.length === 0 ? null : datetimeLocalVersIso(locale),
      };
    }),
  };
}

/** true si une valeur saisie diffère de l'état serveur (bouton actif). */
export function heuresDepartModifiees(
  valeurs: ValeursHeuresDepart,
  epreuves: EpreuveHeureDepartForm[],
): boolean {
  return epreuves.some((epreuve) => {
    const locale = (valeurs[epreuve.epreuveId] ?? '').trim();
    if (locale.length === 0) {
      return epreuve.heureDepart !== null;
    }
    // Comparaison par INSTANT à la résolution du champ (minute) : une heure
    // serveur à secondes/millisecondes non nulles (posée par API) reste
    // « non modifiée » — jamais de comparaison de chaînes ISO brutes.
    // Conversion par le helper shared (fuseau produit) — jamais Date.parse,
    // qui lirait la valeur dans le fuseau du poste.
    const iso = datetimeLocalVersIso(locale);
    const instantMinute = iso === '' ? Number.NaN : Math.floor(Date.parse(iso) / 60_000);
    if (Number.isNaN(instantMinute)) {
      return true;
    }
    if (epreuve.heureDepart === null) {
      return true;
    }
    const serveurMinute = Math.floor(Date.parse(epreuve.heureDepart) / 60_000);
    return instantMinute !== serveurMinute;
  });
}

// ---------------------------------------------------------------------------
// Lecture de la réponse PUT (pures, testées) : le composant ne parse JAMAIS
// lui-même — un 200 malformé ne le fait pas planter, l'erreur « serveur
// injoignable » reste RÉSERVÉE au réseau/timeout (catch du fetch).
// ---------------------------------------------------------------------------

/** Erreur transport : connexion impossible (réservée au catch du fetch). */
export const ERREUR_HEURES_RESEAU = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifiez votre connexion puis réessayez.',
} as const;

/** Erreur transport : délai dépassé (réservé au catch du fetch). */
export const ERREUR_HEURES_DELAI = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessayez dans un instant.',
} as const;

/** Erreur serveur générique : corps sans enveloppe lisible (413/500…). */
export const ERREUR_HEURES_SERVEUR = {
  message: 'Le serveur n’a pas pu enregistrer les heures de départ.',
  action: 'Réessayez dans un instant.',
} as const;

/** Erreur rendue au composant : enveloppe serveur + fields par épreuve. */
export interface ErreurHeuresDepart {
  message: string;
  action: string;
  fields?: Record<string, string>;
}

/**
 * Lit une réponse d'erreur (statut + corps déjà parsé) : enveloppe
 * error.{message, action} si présente (fields compris), sinon erreur SERVEUR
 * générique — jamais « serveur injoignable » (réservé au transport).
 */
export function lireErreurHeuresDepart(statut: number, corps: unknown): ErreurHeuresDepart {
  if (typeof corps === 'object' && corps !== null) {
    const error = (corps as { error?: { message?: unknown; action?: unknown } }).error;
    if (typeof error?.message === 'string' && typeof error?.action === 'string') {
      const brut =
        'fields' in corps &&
        typeof (corps as { fields?: unknown }).fields === 'object' &&
        (corps as { fields?: unknown }).fields !== null
          ? ((corps as { fields: Record<string, string> }).fields ?? undefined)
          : undefined;
      return { message: error.message, action: error.action, fields: brut };
    }
  }
  void statut;
  return { ...ERREUR_HEURES_SERVEUR };
}

/**
 * État serveur d'un 200 : {heures: {epreuves: […]}} avec, par épreuve,
 * epreuveId (chaîne non vide), distanceKm (nombre) et heureDepart (ISO ou
 * null) — tout le reste est rejeté (le composant affiche l'erreur serveur,
 * jamais un crash sur un corps malformé).
 */
export function estEtatServeurValide(corps: unknown): corps is {
  heures: { epreuves: EpreuveHeureDepartForm[] };
} {
  if (typeof corps !== 'object' || corps === null) {
    return false;
  }
  const epreuves = (corps as { heures?: { epreuves?: unknown } }).heures?.epreuves;
  if (!Array.isArray(epreuves)) {
    return false;
  }
  return epreuves.every((epreuve) => {
    if (typeof epreuve !== 'object' || epreuve === null) {
      return false;
    }
    const { epreuveId, distanceKm, heureDepart } = epreuve as Record<string, unknown>;
    return (
      typeof epreuveId === 'string' &&
      epreuveId.length > 0 &&
      typeof distanceKm === 'number' &&
      Number.isFinite(distanceKm) &&
      (heureDepart === null || typeof heureDepart === 'string')
    );
  });
}
