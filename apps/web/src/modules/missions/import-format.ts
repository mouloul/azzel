// Story 3.1 — lecture du fichier d'import volontaires : .xlsx (exceljs) et
// .csv (séparateur ; ou ,), en-tête détecté et ignoré (insensible casse),
// téléphone facultatif. Serveur uniquement : exceljs ne doit JAMAIS être
// importé côté client (budget accueil inchangé).

import { Workbook } from 'exceljs';

import type { LigneFichier } from './domain';
import {
  IMPORT_ACCEPT_ATTRIBUTE,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LINES,
} from './domain';
import { ImportFileInvalidError } from './errors';

// Constantes d'import définies dans le domaine (client-safe) : réexportées ici
// pour les appelants serveur. Ce fichier importe exceljs — SERVEUR UNIQUEMENT.
export { IMPORT_ACCEPT_ATTRIBUTE, MAX_IMPORT_BYTES, MAX_IMPORT_LINES };

export const IMPORT_EXTENSIONS = ['xlsx', 'csv'] as const;

// En-têtes reconnus (insensible casse) — colonnes fixes : Nom, Email, Téléphone.
const MOTS_EN_TETE = ['nom', 'email', 'téléphone', 'telephone', 'phone', 'tel'];

export function extensionFichier(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point === -1 ? '' : nom.slice(point + 1).toLowerCase();
}

function estEnTete(valeurs: string[]): boolean {
  const cellules = valeurs.map((valeur) => valeur.trim().toLowerCase());
  const cles = cellules.filter(
    (cellule) => cellule.length > 0 && MOTS_EN_TETE.includes(cellule),
  );
  // Au moins DEUX cellules-clés reconnues : une ligne de DONNÉE du type
  // « Nom ; kahina@… » (une seule cellule-clé) ne doit pas être avalée comme
  // en-tête — sinon elle disparaît du rapport (import silencieux).
  return cles.length >= 2;
}

function versTexte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) {
    return '';
  }
  if (typeof valeur === 'string') {
    return valeur;
  }
  if (typeof valeur === 'number' || typeof valeur === 'boolean') {
    return String(valeur);
  }
  if (typeof valeur === 'object') {
    const cellule = valeur as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (typeof cellule.text === 'string') {
      return cellule.text;
    }
    if (cellule.richText !== undefined) {
      return cellule.richText.map((partie) => partie.text).join('');
    }
    if (cellule.result !== undefined) {
      return versTexte(cellule.result);
    }
  }
  return '';
}

// --- CSV -----------------------------------------------------------------------

/** Séparateur détecté sur la première ligne non vide : le plus fréquent. */
export function detecterSeparateur(premiereLigne: string): ';' | ',' {
  let pointsVirgules = 0;
  let virgules = 0;
  let entreGuillemets = false;
  for (const caractere of premiereLigne) {
    if (caractere === '"') {
      entreGuillemets = !entreGuillemets;
    } else if (!entreGuillemets) {
      if (caractere === ';') {
        pointsVirgules += 1;
      } else if (caractere === ',') {
        virgules += 1;
      }
    }
  }
  return pointsVirgules >= virgules ? ';' : ',';
}

export function parseLigneCsv(ligne: string, separateur: ';' | ','): string[] {
  const valeurs: string[] = [];
  let courante = '';
  let entreGuillemets = false;
  for (let index = 0; index < ligne.length; index += 1) {
    const caractere = ligne[index];
    if (caractere === '"') {
      if (entreGuillemets && ligne[index + 1] === '"') {
        courante += '"';
        index += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (caractere === separateur && !entreGuillemets) {
      valeurs.push(courante);
      courante = '';
    } else {
      courante += caractere;
    }
  }
  valeurs.push(courante);
  return valeurs;
}

function parseCsv(contenu: string): LigneFichier[] {
  const lignes: LigneFichier[] = [];
  const lignesBrutes = contenu.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  let separateur: ';' | ',' | null = null;
  let enTeteIgnore = false;
  for (let index = 0; index < lignesBrutes.length; index += 1) {
    const brute = lignesBrutes[index] ?? '';
    if (brute.trim().length === 0) {
      continue;
    }
    if (separateur === null) {
      separateur = detecterSeparateur(brute);
    }
    const cellules = parseLigneCsv(brute, separateur).map((cellule) => cellule.trim());
    if (!enTeteIgnore && estEnTete(cellules)) {
      enTeteIgnore = true;
      continue;
    }
    lignes.push({
      ligne: index + 1,
      nom: cellules[0] ?? '',
      email: cellules[1] ?? '',
      telephone: cellules[2] ?? '',
    });
  }
  return lignes;
}

// --- XLSX ----------------------------------------------------------------------

async function parseXlsx(bytes: Uint8Array): Promise<LigneFichier[]> {
  const classeur = new Workbook();
  try {
    // exceljs attend un ArrayBuffer (son type Buffer étend ArrayBuffer) :
    // copie défensive au cas où la vue porterait un offset.
    await classeur.xlsx.load(new Uint8Array(bytes).buffer as ArrayBuffer);
  } catch {
    throw new ImportFileInvalidError();
  }
  const feuille = classeur.worksheets[0];
  if (!feuille) {
    throw new ImportFileInvalidError();
  }
  const lignes: LigneFichier[] = [];
  let enTeteIgnore = false;
  feuille.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cellules = [1, 2, 3].map((colonne) => versTexte(row.getCell(colonne).value).trim());
    if (cellules.every((cellule) => cellule.length === 0)) {
      return;
    }
    if (!enTeteIgnore && estEnTete(cellules)) {
      enTeteIgnore = true;
      return;
    }
    lignes.push({
      ligne: rowNumber,
      nom: cellules[0] ?? '',
      email: cellules[1] ?? '',
      telephone: cellules[2] ?? '',
    });
  });
  return lignes;
}

// --- Entrée du service ----------------------------------------------------------

/**
 * Lit le fichier importé et retourne les lignes de données (en-tête ignoré,
 * lignes vides ignorées). Aucune limite de lignes ici : la règle « 500 lignes
 * maximum » est une décision de validation rapportée ligne par ligne.
 */
export async function parseImportFile(bytes: Uint8Array, filename: string): Promise<LigneFichier[]> {
  if (bytes.length === 0) {
    throw new ImportFileInvalidError();
  }
  const extension = extensionFichier(filename);
  if (extension === 'xlsx') {
    return parseXlsx(bytes);
  }
  if (extension === 'csv') {
    // Décodage UTF-8 FATAL : un CSV Windows-1252 (export Excel par défaut)
    // contient des octets invalides — on refuse le fichier au lieu de stocker
    // des noms accentués en mojibake silencieux.
    let contenu: string;
    try {
      contenu = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new ImportFileInvalidError();
    }
    return parseCsv(contenu);
  }
  throw new ImportFileInvalidError();
}

/** Gabarit .xlsx téléchargeable : une en-tête Nom / Email / Téléphone. */
export async function buildModeleXlsx(): Promise<Uint8Array> {
  const classeur = new Workbook();
  const feuille = classeur.addWorksheet('Volontaires');
  feuille.columns = [
    { header: 'Nom', width: 32 },
    { header: 'Email', width: 40 },
    { header: 'Téléphone', width: 20 },
  ];
  const tampon = await classeur.xlsx.writeBuffer();
  return new Uint8Array(tampon as ArrayBuffer);
}
