export const DEFAULT_LOCALE = 'fr-FR';

/**
 * Fuseau produit FIXE (décision D1, revue 3.2) : la course se déroule en
 * Algérie — horaires affichés et saisis à l'heure du terrain, quel que soit le
 * fuseau du serveur (rendu SSR en UTC) ou du navigateur (organisateur en
 * déplacement). Jamais le fuseau de la machine.
 */
export const FUSEAU_PRODUIT = 'Africa/Algiers';

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
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: FUSEAU_PRODUIT }).format(
    toDate(isoUtc),
  );
}

export function formatLocalTime(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium', timeZone: FUSEAU_PRODUIT }).format(
    toDate(isoUtc),
  );
}

/** Story 5.2 — heure locale HH:MM (barrières horaires, listes admin). */
export function formatLocalHeure(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU_PRODUIT,
  }).format(toDate(isoUtc));
}

export function formatLocalDateTime(isoUtc: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: FUSEAU_PRODUIT,
  }).format(toDate(isoUtc));
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

// Heure MURALE du fuseau produit via Intl (formatToParts) — jamais un décalage
// codé en dur ni le fuseau du processus/navigateur (getHours & co. proscrits).
const FORMAT_MURAL = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_PRODUIT,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface PartiesMurales {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  seconde: number;
}

function partiesMurales(date: Date): PartiesMurales {
  const valeurs: Record<string, number> = {};
  for (const partie of FORMAT_MURAL.formatToParts(date)) {
    if (partie.type !== 'literal') {
      valeurs[partie.type] = Number(partie.value);
    }
  }
  return {
    annee: valeurs.year ?? Number.NaN,
    mois: valeurs.month ?? Number.NaN,
    jour: valeurs.day ?? Number.NaN,
    heure: valeurs.hour ?? Number.NaN,
    minute: valeurs.minute ?? Number.NaN,
    seconde: valeurs.second ?? Number.NaN,
  };
}

/** Décalage (ms) du fuseau produit à cet instant : heure murale − UTC. */
function decalageProduit(instantMs: number): number {
  const p = partiesMurales(new Date(instantMs));
  const muralMs = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return muralMs - Math.floor(instantMs / 1000) * 1000;
}

const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** ISO 8601 UTC (…Z) → valeur d'input datetime-local (heure murale du fuseau produit). */
export function isoVersDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const p = partiesMurales(date);
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${p.annee}-${pad(p.mois)}-${pad(p.jour)}T${pad(p.heure)}:${pad(p.minute)}`;
}

/** Valeur datetime-local (heure murale du fuseau produit) → ISO 8601 UTC pour l'API (…Z). */
export function datetimeLocalVersIso(valeur: string): string {
  const morceaux = DATETIME_LOCAL.exec(valeur);
  if (morceaux === null) {
    return '';
  }
  const [, annee, mois, jour, heure, minute, seconde, milli] = morceaux;
  const muralMs = Date.UTC(
    Number(annee),
    Number(mois) - 1,
    Number(jour),
    Number(heure),
    Number(minute),
    Number(seconde ?? 0),
    Number((milli ?? '0').padEnd(3, '0')),
  );
  if (Number.isNaN(muralMs)) {
    return '';
  }
  // Deux passes : le décalage est relu à l'instant obtenu (robuste à un
  // éventuel changement d'heure du fuseau, même si l'Algérie n'en a pas).
  let instantMs = muralMs - decalageProduit(muralMs);
  instantMs = muralMs - decalageProduit(instantMs);
  return new Date(instantMs).toISOString();
}
