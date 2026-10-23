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
