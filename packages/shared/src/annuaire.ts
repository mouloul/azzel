// Story 3.4 (AD-8) — contrat versionné de la réplique « annuaire des coureurs ».
// Unique source de vérité inter-apps : l'API volontaires le produit, la PWA le
// persiste en IndexedDB, l'épopée 4 (scan zone blanche) le consomme — jamais
// réinventé localement. Défensif par construction : un payload invalide donne
// null, jamais d'exception.

export const ANNUAIRE_SCHEMA_VERSION = 1 as const;

export type AnnuaireSchemaVersion = typeof ANNUAIRE_SCHEMA_VERSION;

/** Identité minimale pour valider un scan (NFR-7) : dossard + nom + prénom. */
export interface CoureurAnnuaire {
  dossard: number;
  nom: string;
  prenom: string;
}

/** Réplique complète d'une édition, servie par GET /api/volontaires/annuaire. */
export interface AnnuaireEdition {
  version: AnnuaireSchemaVersion;
  editionId: string;
  /** ISO 8601 UTC — fraîcheur affichée hors-ligne (« annuaire du JJ/MM HH:MM »). */
  genereA: string;
  coureurs: CoureurAnnuaire[];
}

/** Libellé annoncé au scan pour un dossard absent de la réplique (épopée 4). */
export const DOSSARD_INCONNU_LABEL = 'DOSSARD INCONNU';

/** Bornes du dossard — symétrie exacte avec le CHECK SQL (migration 0022). */
export const DOSSARD_MIN = 1;
export const DOSSARD_MAX = 9999;

export function estDossardValide(valeur: unknown): valeur is number {
  return (
    typeof valeur === 'number' &&
    Number.isInteger(valeur) &&
    valeur >= DOSSARD_MIN &&
    valeur <= DOSSARD_MAX
  );
}

function estTexteNonVide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.trim().length > 0;
}

// Contrat documenté : ISO 8601 UTC — forme RFC3339 stricte avec suffixe Z
// (même exigence que les horodatages 3.2). « 2026-10-22 », un décalage
// « +02:00 » ou un espace au lieu du T sont refusés : la fraîcheur hors-ligne
// dépend d'une comparaison fiable entre horodatages du même référentiel.
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function estDateIsoUtc(valeur: string): boolean {
  return ISO_UTC_PATTERN.test(valeur) && !Number.isNaN(new Date(valeur).getTime());
}

function estCoureurAnnuaire(valeur: unknown): valeur is CoureurAnnuaire {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    estDossardValide(candidat.dossard) &&
    estTexteNonVide(candidat.nom) &&
    estTexteNonVide(candidat.prenom)
  );
}

/**
 * Garde de schéma du payload annuaire : formes (version, identifiants, ISO,
 * coureurs) ET unicité des dossards. Rejette tout doublon — un annuaire avec
 * deux fois le même dossard ne peut pas servir à valider un scan.
 */
export function estAnnuaireValide(valeur: unknown): valeur is AnnuaireEdition {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  if (candidat.version !== ANNUAIRE_SCHEMA_VERSION) {
    return false;
  }
  if (!estTexteNonVide(candidat.editionId)) {
    return false;
  }
  if (typeof candidat.genereA !== 'string' || !estDateIsoUtc(candidat.genereA)) {
    return false;
  }
  if (!Array.isArray(candidat.coureurs)) {
    return false;
  }
  const vus = new Set<number>();
  for (const coureur of candidat.coureurs) {
    if (!estCoureurAnnuaire(coureur)) {
      return false;
    }
    if (vus.has(coureur.dossard)) {
      return false;
    }
    vus.add(coureur.dossard);
  }
  return true;
}

/**
 * Recherche par dossard dans la réplique. Totale : payload invalide ou dossard
 * hors bornes → null, jamais d'exception. L'épopée 4 affichera
 * DOSSARD_INCONNU_LABEL sur ce null.
 */
export function chercherParDossard(
  annuaire: unknown,
  dossard: number,
): CoureurAnnuaire | null {
  if (!estAnnuaireValide(annuaire) || !estDossardValide(dossard)) {
    return null;
  }
  return annuaire.coureurs.find((coureur) => coureur.dossard === dossard) ?? null;
}
