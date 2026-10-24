// Story 7.4 — domaine rapports : l'ENCODEUR CSV sortant (RFC 4180, UTF-8 BOM,
// CRLF — s'ouvre proprement dans Excel FR). Le parseur ENTRANT vit côté
// missions (import-format) : jamais les deux dans le même fichier, l'encodeur
// est pur et sans dépendance. Les détails servis restent au niveau DOSSARD —
// jamais un nom ni un contact de coureur dans un CSV (le directoire les fait
// circuler) ; l'auteur d'un abandon est un organisateur, son email reste.

import { DEFAULT_LOCALE } from '@azzel/shared';

import { TSHIRT_SIZES } from '@/modules/inscriptions/domain';

/** Séparateur local : point-virgule (Excel FR lit le CSV sans import). */
export const SEPARATEUR_CSV = ';';

/** BOM UTF-8 : Excel FR décode les accents sans deviner l'encodage. */
export const BOM_UTF8 = '\uFEFF';

/** Fuseau de la course : les horodatages et dates civiles du rapport s'y lisent. */
export const FUSEAU_COURSE = 'Africa/Algiers';

/** Fin de ligne RFC 4180 : CRLF, sur toutes les plateformes. */
export const FIN_DE_LIGNE_CSV = '\r\n';

/** Cellule CSV sérialisable : texte, nombre ou vide (null → ''). */
export type CelluleCsv = string | number | null;

/**
 * Échappe une cellule selon la RFC 4180 : guillemets doublés, la cellule est
 * quotée si elle contient un guillemet, le séparateur ou un saut de ligne.
 * ANTI-FORMULE : une cellule commençant par `=`, `+`, `-` ou `@` est
 * préfixée d'une apostrophe AVANT l'encodage — Excel n'exécutera jamais le
 * contenu (défense en profondeur au-delà du seul échappement).
 */
export function encoderCelluleCsv(valeur: CelluleCsv): string {
  const texte = valeur === null ? '' : typeof valeur === 'number' ? String(valeur) : valeur;
  const securisee = /^[=+\-@]/.test(texte) ? `'${texte}` : texte;
  if (/[";\r\n]/.test(securisee)) {
    return `"${securisee.replaceAll('"', '""')}"`;
  }
  return securisee;
}

/** Une section titrée du fichier : le titre, puis des lignes de cellules. */
export interface SectionCsv {
  titre: string;
  lignes: CelluleCsv[][];
}

/**
 * Assemble le fichier : BOM UTF-8 + en-tête optionnel (« Généré le … ») +
 * sections titrées reliées par une ligne vide, chaque ligne en CRLF. Chaque
 * cellule passe par l'encodeur RFC 4180.
 */
export function construireCsv(sections: readonly SectionCsv[], enTete?: string): string {
  const debut =
    enTete === undefined ? [] : [encoderCelluleCsv(enTete) + FIN_DE_LIGNE_CSV + FIN_DE_LIGNE_CSV];
  const blocs = sections.map((section) => {
    const lignes = [
      encoderCelluleCsv(section.titre),
      ...section.lignes.map((ligne) => ligne.map(encoderCelluleCsv).join(SEPARATEUR_CSV)),
    ];
    return lignes.join(FIN_DE_LIGNE_CSV);
  });
  return BOM_UTF8 + debut.join('') + blocs.join(FIN_DE_LIGNE_CSV + FIN_DE_LIGNE_CSV);
}

/**
 * Temps de course du rapport : HH:MM:SS (le calcul 7.1 est repris TEL QUEL,
 * jamais recalculé ici — null = « — », un temps négatif reste honnête, signe
 * U+2212 affiché — PAS un tiret ASCII : le préfixe anti-formule ne le touche
 * jamais — jamais clampé).
 */
export function formaterTempsRapport(tempsMs: number | null): string {
  if (tempsMs === null) {
    return '—';
  }
  if (!Number.isFinite(tempsMs)) {
    throw new Error('formaterTempsRapport : le temps doit être un nombre fini (ms)');
  }
  const signe = tempsMs < 0 ? '−' : '';
  const totalSecondes = Math.floor(Math.abs(tempsMs) / 1000);
  const heures = Math.floor(totalSecondes / 3600);
  const minutes = Math.floor((totalSecondes % 3600) / 60);
  const secondes = totalSecondes % 60;
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${signe}${pad(heures)}:${pad(minutes)}:${pad(secondes)}`;
}

/**
 * Horodatage lisible du rapport (abandons — heure déclarative du terrain,
 * en-tête « Généré le ») : date courte + heure en fuseau EXPLICITE
 * Africa/Algiers (heure locale de la course, indépendante du serveur),
 * null → « — ». ISO en base, affichage local course.
 */
export function formaterHorodatageRapport(horodatage: Date | null): string {
  if (horodatage === null) {
    return '—';
  }
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: FUSEAU_COURSE,
  }).format(horodatage);
}

/**
 * Date civile YYYY-MM-DD en fuseau Africa/Algiers (calque dateAujourdhui du
 * rappel J-7 : « aujourd'hui » se lit à l'heure de la course, pas du serveur
 * — le nom de fichier porte la date que vit l'organisateur). Repli UTC si
 * Intl est indisponible (environnement exotique).
 */
export function dateCivileAlger(instant: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: FUSEAU_COURSE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Nom de fichier servi en Content-Disposition : tout caractère hors
 * `[\w.-]` devient `-` (le slug d'édition est une base libre — aucun CRLF,
 * aucun guillemet, aucune injection d'en-tête ne peut passer).
 */
export function sanitizerNomFichier(nom: string): string {
  return nom.replaceAll(/[^\w.-]/g, '-');
}

/** Décompte VALIDÉ par (épreuve, taille) — la commande ne part QUE de là. */
export interface DecompteValideCommande {
  /** Identifiant stable de l'épreuve : deux épreuves homonymes ne fusionnent jamais. */
  epreuveSlug: string;
  taille: string;
  total: number;
}

/** Entrée de lignesCommande : épreuves de l'édition + décomptes validés. */
export interface ValidesCommande {
  /** Épreuves de l'édition (slug + nom d'affichage), ordre du rapport — zéros compris. */
  epreuves: readonly { slug: string; nom: string }[];
  decomptes: readonly DecompteValideCommande[];
}

/** Lignes prêtes pour deux sections CSV : t-shirts (matrice) et médailles. */
export interface LignesCommande {
  tshirts: CelluleCsv[][];
  medailles: CelluleCsv[][];
}

export const MENTION_ZERO_STOCK =
  'Zéro stock : commandé = validé — chaque t-shirt et chaque médaille correspond à un coureur VALIDÉ, rien n’est commandé pour les autres.';

/**
 * Lignes de l'export commande : épreuve × taille (XS–XXL, zéros lisibles)
 * + totaux t-shirts toutes tailles + médailles (1 par coureur validé par
 * épreuve) + total. La jointure se fait par SLUG (jamais par nom : deux
 * épreuves homonymes ne fusionnent pas). Une édition sans validé rend des
 * zéros, jamais de ligne fantôme.
 */
export function lignesCommande(
  valides: ValidesCommande,
  tailles: readonly string[] = TSHIRT_SIZES,
): LignesCommande {
  const parEpreuveTaille = new Map<string, number>();
  for (const decompte of valides.decomptes) {
    const cle = `${decompte.epreuveSlug}\u0000${decompte.taille}`;
    parEpreuveTaille.set(cle, (parEpreuveTaille.get(cle) ?? 0) + decompte.total);
  }

  const tshirts: CelluleCsv[][] = [
    ['Épreuve', ...tailles, 'Total'],
    ...valides.epreuves.map((epreuve) => {
      const cellules = tailles.map(
        (taille) => parEpreuveTaille.get(`${epreuve.slug}\u0000${taille}`) ?? 0,
      );
      const total = cellules.reduce((somme, valeur) => somme + valeur, 0);
      return [epreuve.nom, ...cellules, total];
    }),
  ];
  const totauxTailles = tailles.map((taille) =>
    valides.decomptes
      .filter((decompte) => decompte.taille === taille)
      .reduce((somme, decompte) => somme + decompte.total, 0),
  );
  const totalGeneral = totauxTailles.reduce((somme, valeur) => somme + valeur, 0);
  tshirts.push(['Toutes épreuves', ...totauxTailles, totalGeneral]);

  const totalParSlug = new Map<string, number>();
  for (const decompte of valides.decomptes) {
    totalParSlug.set(
      decompte.epreuveSlug,
      (totalParSlug.get(decompte.epreuveSlug) ?? 0) + decompte.total,
    );
  }
  const medailles: CelluleCsv[][] = [
    ['Épreuve', 'Médailles (1 par coureur validé)'],
    ...valides.epreuves.map((epreuve) => [epreuve.nom, totalParSlug.get(epreuve.slug) ?? 0]),
  ];
  medailles.push(['Total', totalGeneral]);

  return { tshirts, medailles };
}
