import { describe, expect, it, vi } from 'vitest';

import { dateCourseAffichee, libelleEpreuve } from './domain';
import { getDateCourseVitrine } from './service';
import type { InscriptionsStore } from './store';

describe('dateCourseAffichee — ce que le public lit de la date de course', () => {
  it('date cachée : la saison et l’année, jamais le jour', () => {
    const date = dateCourseAffichee('2027-03-26', false);
    expect(date.libelle).toBe('printemps 2027');
    expect(date.phrase).toBe('au printemps 2027');
    expect(date.libelle).not.toMatch(/26|mars/);
  });

  it('date publiée : le jour, le mois et l’année', () => {
    const date = dateCourseAffichee('2027-03-26', true);
    expect(date.libelle).toBe('26 mars 2027');
    expect(date.phrase).toBe('le 26 mars 2027');
  });

  it('la saison suit la date réelle, pas un « printemps » écrit en dur', () => {
    expect(dateCourseAffichee('2027-07-10', false).libelle).toBe('été 2027');
    expect(dateCourseAffichee('2027-10-10', false).libelle).toBe('automne 2027');
    expect(dateCourseAffichee('2027-01-15', false).libelle).toBe('hiver 2027');
  });

  it('chaque saison a la bonne préposition', () => {
    expect(dateCourseAffichee('2027-04-10', false).phrase).toBe('au printemps 2027');
    expect(dateCourseAffichee('2027-07-10', false).phrase).toBe('en été 2027');
    expect(dateCourseAffichee('2027-10-10', false).phrase).toBe('en automne 2027');
    expect(dateCourseAffichee('2027-01-15', false).phrase).toBe('en hiver 2027');
  });

  it('bornes des saisons : 20 mars printemps, 19 mars hiver, 21 juin été', () => {
    expect(dateCourseAffichee('2027-03-19', false).libelle).toBe('hiver 2027');
    expect(dateCourseAffichee('2027-03-20', false).libelle).toBe('printemps 2027');
    expect(dateCourseAffichee('2027-06-20', false).libelle).toBe('printemps 2027');
    expect(dateCourseAffichee('2027-06-21', false).libelle).toBe('été 2027');
    expect(dateCourseAffichee('2027-09-22', false).libelle).toBe('été 2027');
    expect(dateCourseAffichee('2027-09-23', false).libelle).toBe('automne 2027');
    expect(dateCourseAffichee('2027-12-20', false).libelle).toBe('automne 2027');
    expect(dateCourseAffichee('2027-12-21', false).libelle).toBe('hiver 2027');
  });

  it('date illisible : repli sur « prochainement » plutôt qu’une date inventée', () => {
    expect(dateCourseAffichee('pas-une-date', false).libelle).toBe('prochainement');
    expect(dateCourseAffichee('pas-une-date', true).libelle).toBe('prochainement');
  });
});

describe('libelleEpreuve — la distance n’est dite qu’une fois', () => {
  it('le nom contient déjà la distance : rien n’est ajouté', () => {
    expect(libelleEpreuve('La Grande Boucle — 35 km', 35)).toBe('La Grande Boucle — 35 km');
  });

  it('le nom ne la contient pas : elle est ajoutée', () => {
    expect(libelleEpreuve('La Grande Boucle', 35)).toBe('La Grande Boucle (35 km)');
  });

  it('distance décimale', () => {
    expect(libelleEpreuve('Le Court — 12.5 km', 12.5)).toBe('Le Court — 12.5 km');
    expect(libelleEpreuve('Le Court', 12.5)).toBe('Le Court (12.5 km)');
  });

  it('une autre distance dans le nom n’est pas confondue avec celle de l’épreuve', () => {
    expect(libelleEpreuve('Trail 135 km', 35)).toBe('Trail 135 km (35 km)');
  });
});

describe('getDateCourseVitrine — la date lue par l’accueil, sans session', () => {
  const magasin = (valeur: unknown) =>
    ({
      readDefaultOrgDateCourse: vi.fn().mockResolvedValue(valeur),
    }) as unknown as InscriptionsStore;

  it('date cachée : la saison seulement', async () => {
    const date = await getDateCourseVitrine({
      store: magasin({ raceDate: '2027-03-26', publique: false }),
    });
    expect(date.libelle).toBe('printemps 2027');
    expect(date.phrase).toBe('au printemps 2027');
  });

  it('date publiée par l’organisation : le jour exact', async () => {
    const date = await getDateCourseVitrine({
      store: magasin({ raceDate: '2027-03-26', publique: true }),
    });
    expect(date.libelle).toBe('26 mars 2027');
  });

  it('aucune édition : « prochainement », jamais une date inventée', async () => {
    const date = await getDateCourseVitrine({ store: magasin(null) });
    expect(date.libelle).toBe('prochainement');
  });

  it('base indisponible : « prochainement » — on ne devine pas une date publique', async () => {
    // Le repli est volontairement le plus discret : si la base ne répond pas,
    // on ne sait pas si l'organisation a publié la date, donc on n'en dit rien.
    const store = {
      readDefaultOrgDateCourse: vi.fn().mockRejectedValue(new Error('base muette')),
    } as unknown as InscriptionsStore;
    const date = await getDateCourseVitrine({ store });
    expect(date.libelle).toBe('prochainement');
    expect(date.libelle).not.toMatch(/\d{2}\s/);
  });
});
