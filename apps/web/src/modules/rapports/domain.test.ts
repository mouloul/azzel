import { describe, expect, it } from 'vitest';

import { TSHIRT_SIZES } from '@/modules/inscriptions/domain';

import {
  BOM_UTF8,
  MENTION_ZERO_STOCK,
  construireCsv,
  dateCivileAlger,
  encoderCelluleCsv,
  formaterHorodatageRapport,
  formaterTempsRapport,
  lignesCommande,
  sanitizerNomFichier,
} from './domain';

// Story 7.4 — pures du module rapports : encodeur CSV RFC 4180 sortant
// (PRÉFIXE anti-formule + échappement, BOM, CRLF, en-tête « Généré le »),
// formats de temps/horodatage en fuseau course (Africa/Algiers), lignes de
// commande jointes par SLUG, sanitisation du nom de fichier servi.

describe('encoderCelluleCsv — RFC 4180 + préfixe anti-formule', () => {
  it('texte simple et nombres : tels quels, null → vide', () => {
    expect(encoderCelluleCsv('simple')).toBe('simple');
    expect(encoderCelluleCsv(42)).toBe('42');
    expect(encoderCelluleCsv(0)).toBe('0');
    expect(encoderCelluleCsv(null)).toBe('');
    expect(encoderCelluleCsv('')).toBe('');
  });

  it('cellule avec séparateur, guillemet ou saut de ligne : quotée', () => {
    expect(encoderCelluleCsv('a;b')).toBe('"a;b"');
    expect(encoderCelluleCsv('ligne\nsuivante')).toBe('"ligne\nsuivante"');
    expect(encoderCelluleCsv('retour\rchariot')).toBe('"retour\rchariot"');
  });

  it('guillemets DOUBLÉS dans une cellule quotée (RFC 4180)', () => {
    expect(encoderCelluleCsv('il a dit "stop"')).toBe('"il a dit ""stop"""');
  });

  it('PRÉFIXE anti-formule : `=`, `+`, `-`, `@` en tête → apostrophe AVANT encodage', () => {
    expect(encoderCelluleCsv('=SOMME(A1:A2)')).toBe("'=SOMME(A1:A2)");
    expect(encoderCelluleCsv('+1')).toBe("'+1");
    expect(encoderCelluleCsv('-2')).toBe("'-2");
    expect(encoderCelluleCsv('@x')).toBe("'@x");
  });

  it('texte normal NON préfixé (l’apostrophe n’altère pas les données saines)', () => {
    expect(encoderCelluleCsv('ok')).toBe('ok');
    expect(encoderCelluleCsv('Col 1200')).toBe('Col 1200');
    expect(encoderCelluleCsv('_km 12')).toBe('_km 12');
  });

  it('préfixe AVANT l’échappement : une formule avec séparateur reste quotée', () => {
    expect(encoderCelluleCsv('=A1;B2')).toBe('"\'=A1;B2"');
  });

  it('cellule malveillante `" ; =SOMME(...)` : échappée ET neutralisée', () => {
    expect(encoderCelluleCsv('" ; =SOMME(A1:A2)')).toBe('""" ; =SOMME(A1:A2)"');
    // La formule vit DANS la zone quotée : un lecteur RFC 4180 (guillemets
    // doublés) y voit UNE cellule — rien ne fuit vers les suivantes.
    const encode = encoderCelluleCsv('" ; =SOMME(A1:A2)');
    expect(encode.startsWith('"')).toBe(true);
    expect(encode.endsWith('"')).toBe(true);
    expect(encode.replaceAll('""', '')).toBe('" ; =SOMME(A1:A2)"');
  });

  it('temps négatif (signe U+2212, PAS un tiret ASCII) : jamais préfixé', () => {
    expect(formaterTempsRapport(-1_000)).toBe('−00:00:01');
    expect(encoderCelluleCsv(formaterTempsRapport(-1_000))).toBe('−00:00:01');
  });
});

describe('construireCsv — BOM UTF-8, CRLF, en-tête, sections', () => {
  it('BOM UTF-8 en tête, lignes en CRLF, ligne vide ENTRE sections', () => {
    const csv = construireCsv([
      { titre: 'Section A', lignes: [['x', 1]] },
      { titre: 'Section B', lignes: [] },
    ]);
    expect(csv).toBe(
      '\uFEFFSection A\r\nx;1\r\n\r\nSection B',
    );
  });

  it('en-tête « Généré le » : première ligne du fichier, ligne vide avant la première section', () => {
    const csv = construireCsv([{ titre: 'Synthèse', lignes: [['x', 1]] }], 'Généré le 26/03/2027');
    expect(csv).toBe('\uFEFFGénéré le 26/03/2027\r\n\r\nSynthèse\r\nx;1');
  });

  it('chaque cellule passe par l’encodeur (préfixe + échappement dans le fichier final)', () => {
    const csv = construireCsv([
      {
        titre: 'Abandons',
        lignes: [
          ['Col 1200 "km 12"; ravitaillement', 'Épuisement'],
          ['=SOMME(A1:A2)', 'ok'],
        ],
      },
    ]);
    expect(csv).toBe(
      '\uFEFFAbandons\r\n"Col 1200 ""km 12""; ravitaillement";Épuisement\r\n\'=SOMME(A1:A2);ok',
    );
  });
});

describe('formaterTempsRapport — HH:MM:SS ou « — »', () => {
  it('null → « — » (jamais de temps faux)', () => {
    expect(formaterTempsRapport(null)).toBe('—');
  });

  it('durées formatées HH:MM:SS', () => {
    expect(formaterTempsRapport(0)).toBe('00:00:00');
    expect(formaterTempsRapport(59_000)).toBe('00:00:59');
    expect(formaterTempsRapport(3_661_000)).toBe('01:01:01');
    expect(formaterTempsRapport(7_323_000)).toBe('02:02:03');
  });

  it('valeur non finie : erreur de programmation, jamais silencée', () => {
    expect(() => formaterTempsRapport(Number.NaN)).toThrow();
  });
});

describe('formaterHorodatageRapport — fuseau EXPLICITE Africa/Algiers', () => {
  it('null → « — »', () => {
    expect(formaterHorodatageRapport(null)).toBe('—');
  });

  it('heure locale de la course (UTC+1), indépendante du fuseau du serveur', () => {
    // 08:10 UTC → 09:10 à Alger, jour inchangé.
    expect(formaterHorodatageRapport(new Date('2027-03-26T08:10:00.000Z'))).toBe(
      '26/03/2027 09:10:00',
    );
    // 23:45 UTC → 00:45 le LENDEMAIN à Alger (bascule de jour civile).
    expect(formaterHorodatageRapport(new Date('2027-03-26T23:45:00.000Z'))).toBe(
      '27/03/2027 00:45:00',
    );
  });
});

describe('dateCivileAlger — date civile du nom de fichier (calque dateAujourdhui J-7)', () => {
  it('YYYY-MM-DD lu à l’heure de la course, pas du serveur', () => {
    expect(dateCivileAlger(new Date('2027-03-26T10:00:00.000Z'))).toBe('2027-03-26');
    // 23:30 UTC → déjà le lendemain à Alger.
    expect(dateCivileAlger(new Date('2027-03-26T23:30:00.000Z'))).toBe('2027-03-27');
  });
});

describe('sanitizerNomFichier — Content-Disposition', () => {
  it('nom sain : inchangé', () => {
    expect(sanitizerNomFichier('azzel-rapport-post-course-2027-2026-10-24.csv')).toBe(
      'azzel-rapport-post-course-2027-2026-10-24.csv',
    );
  });

  it('slug piégé : tout caractère hors [\\w.-] devient `-` — aucune injection d’en-tête', () => {
    expect(sanitizerNomFichier('azzel-rapport-post-course-20 27\r\nX-Evil: 1-x.csv')).toBe(
      'azzel-rapport-post-course-20-27--X-Evil--1-x.csv',
    );
    expect(sanitizerNomFichier('azzel-commande-"2027".csv')).toBe('azzel-commande--2027-.csv');
    expect(sanitizerNomFichier('azzel-rapport-édition-2027.csv')).toBe(
      'azzel-rapport--dition-2027.csv',
    );
  });
});

describe('lignesCommande — épreuve × taille + totaux + médailles (jointure par SLUG)', () => {
  it('matrice complète : une ligne par épreuve (zéros compris), totaux toutes tailles, médailles', () => {
    const commande = lignesCommande({
      epreuves: [
        { slug: 'longue', nom: 'La Grande Boucle — 35 km' },
        { slug: 'moyenne', nom: 'La Boucle Moyenne — 12 km' },
      ],
      decomptes: [
        { epreuveSlug: 'longue', taille: 'XS', total: 1 },
        { epreuveSlug: 'longue', taille: 'M', total: 2 },
        { epreuveSlug: 'longue', taille: 'XL', total: 1 },
        { epreuveSlug: 'moyenne', taille: 'L', total: 3 },
      ],
    });
    expect(commande.tshirts).toEqual([
      ['Épreuve', ...TSHIRT_SIZES, 'Total'],
      ['La Grande Boucle — 35 km', 1, 0, 2, 0, 1, 0, 4],
      ['La Boucle Moyenne — 12 km', 0, 0, 0, 3, 0, 0, 3],
      ['Toutes épreuves', 1, 0, 2, 3, 1, 0, 7],
    ]);
    expect(commande.medailles).toEqual([
      ['Épreuve', 'Médailles (1 par coureur validé)'],
      ['La Grande Boucle — 35 km', 4],
      ['La Boucle Moyenne — 12 km', 3],
      ['Total', 7],
    ]);
  });

  it('deux épreuves HOMONYMES ne fusionnent pas : la jointure se fait par slug', () => {
    const commande = lignesCommande({
      epreuves: [
        { slug: 'longue-a', nom: 'La Grande Boucle' },
        { slug: 'longue-b', nom: 'La Grande Boucle' },
      ],
      decomptes: [
        { epreuveSlug: 'longue-a', taille: 'M', total: 2 },
        { epreuveSlug: 'longue-b', taille: 'M', total: 1 },
      ],
    });
    expect(commande.tshirts).toEqual([
      ['Épreuve', ...TSHIRT_SIZES, 'Total'],
      ['La Grande Boucle', 0, 0, 2, 0, 0, 0, 2],
      ['La Grande Boucle', 0, 0, 1, 0, 0, 0, 1],
      ['Toutes épreuves', 0, 0, 3, 0, 0, 0, 3],
    ]);
    expect(commande.medailles).toEqual([
      ['Épreuve', 'Médailles (1 par coureur validé)'],
      ['La Grande Boucle', 2],
      ['La Grande Boucle', 1],
      ['Total', 3],
    ]);
  });

  it('commande sans validé : zéros lisibles, aucune ligne fantôme', () => {
    const commande = lignesCommande({
      epreuves: [{ slug: 'sprint', nom: 'Le Sprint — 5 km' }],
      decomptes: [],
    });
    expect(commande.tshirts).toEqual([
      ['Épreuve', ...TSHIRT_SIZES, 'Total'],
      ['Le Sprint — 5 km', 0, 0, 0, 0, 0, 0, 0],
      ['Toutes épreuves', 0, 0, 0, 0, 0, 0, 0],
    ]);
    expect(commande.medailles).toEqual([
      ['Épreuve', 'Médailles (1 par coureur validé)'],
      ['Le Sprint — 5 km', 0],
      ['Total', 0],
    ]);
  });

  it('mention zéro stock : la constante porte « commandé = validé »', () => {
    expect(MENTION_ZERO_STOCK).toContain('Zéro stock');
    expect(MENTION_ZERO_STOCK).toContain('commandé = validé');
  });
});
