import { DEFAULT_LOCALE } from '@azzel/shared';

// Story 3.3 — libellés de fraîcheur de la fiche mission : le volontaire
// sait TOUJOURS si ce qu'il lit est à jour (« synchronisé à HH:MM ») ou
// lu depuis la poche (« hors-ligne — données du JJ/MM HH:MM »).

const HEURE = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
});
const DATE_HEURE = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function parseIso(valeur: string): Date | null {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** État synchronisé à l'instant `generéA` : « synchronisé à 14:32 ». */
export function libelleSynchronise(generéA: string): string {
  const date = parseIso(generéA);
  return date === null ? 'synchronisé' : `synchronisé à ${HEURE.format(date)}`;
}

/** État lu depuis IndexedDB réseau absent : « hors-ligne — données du 16/05 06:00 ». */
export function libelleHorsLigne(generéA: string): string {
  const date = parseIso(generéA);
  return date === null ? 'hors-ligne — données enregistrées' : `hors-ligne — données du ${DATE_HEURE.format(date)}`;
}

/** Story 3.4 — variante annuaire : « hors-ligne — annuaire du 16/05 06:00 ». */
export function libelleHorsLigneAnnuaire(genereA: string): string {
  const date = parseIso(genereA);
  return date === null ? 'hors-ligne — annuaire enregistré' : `hors-ligne — annuaire du ${DATE_HEURE.format(date)}`;
}
