import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// Story 7.1 — rendu serveur de la carte « Heures de départ » (pattern
// course-live.test.tsx) : une ligne par épreuve (nom, distance, datetime-local
// prérempli depuis l'ISO serveur), heure locale enregistrée affichée, note
// « non configurée », bouton Enregistrer, aucun aria-invalid sans erreur.

import { HeuresDepart } from './heures-depart';

const EPREUVES = [
  {
    epreuveId: 'ep-longue',
    epreuveNom: 'La Grande Boucle — 35 km',
    distanceKm: 35,
    heureDepart: '2027-05-16T08:00:00.000Z',
  },
  {
    epreuveId: 'ep-moyenne',
    epreuveNom: 'La Boucle Moyenne — 12 km',
    distanceKm: 12,
    heureDepart: null,
  },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<HeuresDepart epreuvesInitiales={EPREUVES} />);
  return await new Response(flux).text();
}

describe('HeuresDepart — rendu serveur (story 7.1)', () => {
  it('titre de carte + une ligne par épreuve : nom, distance, input datetime-local avec id/label stables', async () => {
    const html = await rendu();
    expect(html).toContain('Heures de départ');
    expect(html).toContain('id="course-heures-titre"');
    for (const epreuve of EPREUVES) {
      const id = `heures-depart-${epreuve.epreuveId}`;
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(epreuve.epreuveNom);
    }
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('35 km');
    expect(html).toContain('12 km');
  });

  it('heure configurée : input PRÉREMPLI (datetime-local local) + heure enregistrée affichée en heure locale', async () => {
    const html = await rendu();
    expect(html).toMatch(/name="heures-depart-ep-longue"[^>]*value="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
    expect(html).toContain('Enregistrée :');
    expect(html).toContain('(heure locale)');
    expect(html).toContain('id="heures-depart-ep-longue-enregistree"');
  });

  it('heure ABSENTE : input vide + note « non configurée » (classement indisponible)', async () => {
    const html = await rendu();
    expect(html).toMatch(/name="heures-depart-ep-moyenne"[^>]*value=""/);
    expect(html).toContain('Non configurée');
    expect(html).toContain('classement indisponible');
  });

  it('bouton Enregistrer présent ; sans erreur : aucun aria-invalid ni field-error', async () => {
    const html = await rendu();
    expect(html).toContain('Enregistrer les heures de départ');
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('field-error');
  });

  it('liste VIDE : la carte ne rend rien (aucune épreuve à configurer)', async () => {
    const flux = await renderToReadableStream(<HeuresDepart epreuvesInitiales={[]} />);
    const html = await new Response(flux).text();
    expect(html).not.toContain('Heures de départ');
  });
});
