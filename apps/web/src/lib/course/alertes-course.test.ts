import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HEURE_ALERTE_ATTENTE,
  LIBELLE_ACTION_ABANDON,
  LIBELLE_CONTACT_NON_RENSEIGNE,
  NOTE_SANS_ALERTE,
  lienAppelerSecteur,
  libelleAlerte,
  libelleDepuisAttente,
  libelleDepuisBarriere,
  trierAlertesCourse,
} from './alertes-course';

// Story 5.2 — dérivations d'affichage des alertes hors-délais : libellé
// « depuis HH:MM » en heure LOCALE, tri dossard croissant, action tel: du
// contact secteur (normalisée ou libellé inactif). Pures, hors effets.

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

describe('libelleDepuisBarriere — heure locale HH:MM', () => {
  it('« depuis HH:MM » à partir de l’ISO serveur (heure d’Alger, fuseau produit — jamais celle du poste)', () => {
    // Processus épinglé à UTC : 10:00 Z s'affiche 11:00 (Alger, UTC+1).
    expect(libelleDepuisBarriere('2027-05-16T10:00:00.000Z')).toBe('depuis 11:00');
    expect(libelleDepuisBarriere('2027-05-16T23:59:00.000Z')).toBe('depuis 00:59');
  });

  it('ISO illisible : emplacement d’attente, jamais d’exception au rendu', () => {
    expect(libelleDepuisBarriere('pas-une-date')).toBe(`depuis ${HEURE_ALERTE_ATTENTE}`);
    expect(libelleDepuisAttente()).toBe('depuis --:--');
  });
});

describe('trierAlertesCourse — dossard croissant, ordre stable', () => {
  it('tri par dossard croissant, tie-break checkpointId', () => {
    const alertes = [
      { dossard: 102, checkpointId: 'cp-b' },
      { dossard: 101, checkpointId: 'cp-b' },
      { dossard: 101, checkpointId: 'cp-a' },
    ];
    expect(trierAlertesCourse(alertes).map((a) => [a.dossard, a.checkpointId])).toEqual([
      [101, 'cp-a'],
      [101, 'cp-b'],
      [102, 'cp-b'],
    ]);
  });

  it('copie : le tableau source n’est pas muté', () => {
    const alertes = [
      { dossard: 102, checkpointId: 'cp-b' },
      { dossard: 101, checkpointId: 'cp-a' },
    ];
    trierAlertesCourse(alertes);
    expect(alertes.map((a) => a.dossard)).toEqual([102, 101]);
  });
});

describe('lienAppelerSecteur — tel: normalisé ou null', () => {
  it('contact lisible : chiffres conservés, espaces/points/tirets retirés', () => {
    expect(lienAppelerSecteur('+213 555 010 203')).toBe('tel:+213555010203');
    expect(lienAppelerSecteur('0555-010-203')).toBe('tel:0555010203');
    expect(lienAppelerSecteur('0555.010.203')).toBe('tel:0555010203');
  });

  it('contact absent, muet ou SANS CHIFFRE : null — le libellé inactif prend le relais', () => {
    expect(lienAppelerSecteur(null)).toBeNull();
    expect(lienAppelerSecteur('—')).toBeNull();
    // '+' seul n'est pas un numéro : jamais de tel:+ mort.
    expect(lienAppelerSecteur('+')).toBeNull();
    expect(lienAppelerSecteur('+ - +')).toBeNull();
    expect(LIBELLE_CONTACT_NON_RENSEIGNE).toContain('contact du secteur non renseigné');
  });
});

describe('libelleAlerte — texte intégral (jamais la couleur seule)', () => {
  it('assemble dossard, checkpoint et « depuis » reçu', () => {
    expect(
      libelleAlerte({ dossard: 101, checkpointTitre: 'Scan km 12' }, 'depuis 10:00'),
    ).toBe('⚠ Dossard 101 — pas vu à Scan km 12 depuis 10:00');
    expect(
      libelleAlerte({ dossard: 7, checkpointTitre: 'Scan col 1200' }, libelleDepuisAttente()),
    ).toBe('⚠ Dossard 7 — pas vu à Scan col 1200 depuis --:--');
  });

  it('libellés produit : action abandon ACTIVE (story 5.3), note sans alerte sans numéro de story', () => {
    expect(LIBELLE_ACTION_ABANDON).toBe('Saisir l’abandon');
    expect(NOTE_SANS_ALERTE).toContain('Aucune alerte hors-délais');
    expect(NOTE_SANS_ALERTE).toContain('suivi GPS');
    // Jamais de numéro de story/épopée visible côté produit.
    expect(NOTE_SANS_ALERTE).not.toMatch(/épopée|story|\d+\.\d+/);
    expect(LIBELLE_ACTION_ABANDON).not.toMatch(/\d+\.\d+/);
  });
});
