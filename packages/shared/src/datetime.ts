export const DEFAULT_LOCALE = 'fr-FR';

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

function toDate(isoUtc: string): Date {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Horodatage ISO 8601 UTC invalide : ${isoUtc}`);
  }
  return date;
}

export function formatLocalDate(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(toDate(isoUtc));
}

export function formatLocalTime(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(toDate(isoUtc));
}

/** Story 5.2 — heure locale HH:MM (barrières horaires, listes admin). */
export function formatLocalHeure(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    toDate(isoUtc),
  );
}

export function formatLocalDateTime(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(
    toDate(isoUtc),
  );
}

// ---------------------------------------------------------------------------
// Contrat horodatage transverse (déplacé du domaine missions — consommé par
// missions ET chrono : jamais réinventé localement, piège de fuseau silencieux).
// ---------------------------------------------------------------------------

// RFC3339 STRICT se terminant par Z : un ISO sans Z serait interprété en heure
// LOCALE du serveur (décalage silencieux) — refusé net.
const HORODATAGE_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Garde RFC3339 strict (…Z) : la forme ET la date doivent être lisibles. */
export function estHorodatageValide(valeur: string): boolean {
  if (!HORODATAGE_RFC3339.test(valeur)) {
    return false;
  }
  const date = new Date(valeur);
  return !Number.isNaN(date.getTime());
}

/** ISO 8601 UTC (…Z) → valeur d'input datetime-local (heure locale du navigateur). */
export function isoVersDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valeur datetime-local (heure locale) → ISO 8601 UTC pour l'API (…Z). */
export function datetimeLocalVersIso(valeur: string): string {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
