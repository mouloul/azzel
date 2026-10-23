import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CarteCourse,
  LIBELLE_SANS_POSITION,
  LIBELLE_TUILES_ECHEC,
  interpreterPayloadPositions,
  interpreterPayloadTraces,
  libelleLignePosition,
  libellePastille,
} from './carte-course';

import type { PositionPublique } from '@azzel/shared';

// Story 7.3 — tests du composant carte : PURES (interprétation des payloads,
// libellés de pastille — calque resultats-live.test.tsx) + rendu SSR de la
// section FERMÉE. PARE-CHemin-CRITIQUE : le HTML initial ne contient AUCUNE
// référence carto (leaflet, tuile, openstreetmap) tant que la carte n'est pas
// activée — le bouton seul vit dans la page. Le montage Leaflet lui-même vit
// dans les effets (jamais exécutés en SSR) derrière l'import dynamique.

const MAINTENANT = new Date('2027-03-26T10:00:00.000Z');

const POSITION_RECENTE: PositionPublique = {
  dossard: 201,
  epreuveSlug: 'longue',
  epreuveNom: 'La Longue — 35 km',
  lat: 36.5512,
  lon: 4.3601,
  capteA: '2027-03-26T09:41:00.000Z',
  estompée: false,
};

const POSITION_ESTOMPEE: PositionPublique = {
  ...POSITION_RECENTE,
  dossard: 202,
  capteA: '2027-03-26T08:12:00.000Z',
  estompée: true,
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<CarteCourse />);
  return await new Response(flux).text();
}

/** Le composant ne doit JAMAIS référencer la carto avant activation. */
const REFERENCES_CARTO = /leaflet|openstreetmap|tile\.|tile\.openstreetmap|\{z\}\/\{x\}/i;

describe('interpreterPayloadPositions — défense de forme (pure)', () => {
  it('payload valide : positions + genereA acceptés tels quels', () => {
    const resultat = interpreterPayloadPositions({
      ok: true,
      positions: [POSITION_RECENTE],
      genereA: '2027-03-26T10:00:05.000Z',
    });
    expect(resultat).toEqual({
      ok: true,
      positions: [POSITION_RECENTE],
      genereA: '2027-03-26T10:00:05.000Z',
    });
  });

  it('ok:false, positions non-tableau, genereA absent/illisible, payload non objet : échec', () => {
    expect(interpreterPayloadPositions({ ok: false, positions: [], genereA: 'x' }).ok).toBe(false);
    expect(
      interpreterPayloadPositions({ ok: true, positions: 'pas-un-tableau', genereA: 'x' }).ok,
    ).toBe(false);
    expect(interpreterPayloadPositions({ ok: true, positions: [] }).ok).toBe(false);
    expect(
      interpreterPayloadPositions({ ok: true, positions: [], genereA: 'pas-une-date' }).ok,
    ).toBe(false);
    expect(interpreterPayloadPositions(null).ok).toBe(false);
    expect(interpreterPayloadPositions('texte').ok).toBe(false);
  });

  it('revue 7.3 — UN item pourri → payload ENTIER refusé : dossard hors 1–9999', () => {
    for (const dossardPourri of [0, -1, 10000, 1.5, '201', null]) {
      const resultat = interpreterPayloadPositions({
        ok: true,
        positions: [{ ...POSITION_RECENTE, dossard: dossardPourri }],
        genereA: '2027-03-26T10:00:05.000Z',
      });
      expect(resultat.ok).toBe(false);
    }
    // Dossard aux bornes exactes : valides.
    expect(
      interpreterPayloadPositions({
        ok: true,
        positions: [{ ...POSITION_RECENTE, dossard: 1 }, { ...POSITION_RECENTE, dossard: 9999 }],
        genereA: '2027-03-26T10:00:05.000Z',
      }).ok,
    ).toBe(true);
  });

  it('revue 7.3 — UN item pourri → payload ENTIER refusé : lat/lon non bornés, capteA/estompée mal typés', () => {
    const itemsPourris: unknown[] = [
      { ...POSITION_RECENTE, lat: 91 },
      { ...POSITION_RECENTE, lat: -91 },
      { ...POSITION_RECENTE, lon: 181 },
      { ...POSITION_RECENTE, lat: '36.5' },
      { ...POSITION_RECENTE, lon: null },
      { ...POSITION_RECENTE, capteA: 123 },
      { ...POSITION_RECENTE, estompée: 'true' },
      { ...POSITION_RECENTE, estompée: undefined },
      'pas-un-objet',
      null,
    ];
    for (const item of itemsPourris) {
      const resultat = interpreterPayloadPositions({
        ok: true,
        positions: [POSITION_RECENTE, item],
        genereA: '2027-03-26T10:00:05.000Z',
      });
      expect(resultat.ok).toBe(false);
    }
  });
});

describe('interpreterPayloadTraces — défense de forme (pure)', () => {
  it('payload valide : traces acceptées ; toute dérive : échec', () => {
    expect(
      interpreterPayloadTraces({
        ok: true,
        traces: [{ epreuveSlug: 'longue', epreuveNom: 'La Longue', points: [] }],
      }).ok,
    ).toBe(true);
    expect(interpreterPayloadTraces({ ok: false, traces: [] }).ok).toBe(false);
    expect(interpreterPayloadTraces({ ok: true, traces: null }).ok).toBe(false);
    expect(interpreterPayloadTraces(undefined).ok).toBe(false);
  });

  it('revue 7.3 — item pourri → payload ENTIER refusé : points non-objets, lat/lon non finis, slug absent', () => {
    const tracesPourries: unknown[] = [
      { epreuveSlug: 'longue', epreuveNom: 'La Longue', points: 'pas-un-tableau' },
      { epreuveSlug: 'longue', epreuveNom: 'La Longue', points: [{ lat: 1, lon: 2 }, 'x'] },
      { epreuveSlug: 'longue', epreuveNom: 'La Longue', points: [{ lat: '1', lon: 2 }] },
      { epreuveSlug: 'longue', epreuveNom: 'La Longue', points: [{ lat: 1 }] },
      { epreuveSlug: 'longue', epreuveNom: 'La Longue', points: [{ lon: 2 }] },
      { epreuveNom: 'La Longue', points: [] },
      { epreuveSlug: 'longue', points: [] },
      'pas-un-objet',
    ];
    for (const trace of tracesPourries) {
      const resultat = interpreterPayloadTraces({ ok: true, traces: [trace] });
      expect(resultat.ok).toBe(false);
    }
  });
});

describe('libellePastille — anonymat et « dernière position connue » (pure)', () => {
  it('position récente : dossard qualifié par épreuve — jamais un nom', () => {
    expect(libellePastille(POSITION_RECENTE, MAINTENANT)).toBe('201 — La Longue — 35 km');
  });

  it('position estompée : « Dernière position connue il y a X » — sobre, jamais alarmiste', () => {
    expect(libellePastille(POSITION_ESTOMPEE, MAINTENANT)).toBe(
      'Dernière position connue il y a 1 h',
    );
  });
});

describe('libelleLignePosition — liste texte accessible (revue 7.3, pure)', () => {
  it('position récente : dossard + épreuve + âge', () => {
    expect(libelleLignePosition(POSITION_RECENTE, MAINTENANT)).toBe(
      '201 — La Longue — 35 km — il y a 19 min',
    );
  });

  it('position estompée : « dernière position connue » en toutes lettres', () => {
    expect(libelleLignePosition(POSITION_ESTOMPEE, MAINTENANT)).toBe(
      '202 — La Longue — 35 km — dernière position connue il y a 1 h',
    );
  });
});

describe('LIBELLE_TUILES_ECHEC — message de secours tuiles (revue 7.3)', () => {
  it('sobre, oriente vers la liste texte, jamais alarmiste', () => {
    expect(LIBELLE_TUILES_ECHEC).toBe(
      'Les fonds de carte ne se chargent pas — les positions restent lisibles ci-dessous.',
    );
  });
});

describe('CarteCourse — section fermée par défaut (SSR, pare-chemin-critique)', () => {
  it('section « Carte de la course » + bouton « Afficher la carte », aria-expanded=false', async () => {
    const html = await rendu();
    expect(html).toContain('Carte de la course');
    expect(html).toContain('Afficher la carte');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('carte-course-bouton');
  });

  it('AUCUNE référence carto dans le HTML initial (lib, tuiles, OSM)', async () => {
    const html = await rendu();
    expect(html).not.toMatch(REFERENCES_CARTO);
    expect(html).not.toContain('src="/_next/static/chunk');
  });

  it('le composant ne référence Leaflet que par import dynamique (source : aucun import statique)', async () => {
    const sourceCarte = readFileSync(
      fileURLToPath(new URL('./carte-course.tsx', import.meta.url)),
      'utf8',
    );
    expect(sourceCarte).toMatch(/import\('\.\/carte-leaflet'\)/);
    expect(sourceCarte).not.toMatch(/^import\s+L\s+from\s+'leaflet'/m);
    expect(sourceCarte).not.toContain("from 'leaflet/dist/leaflet.css'");
  });

  it('état vide doux : le libellé « les résultats racontent la course » existe (verbatim spec)', () => {
    expect(LIBELLE_SANS_POSITION).toBe(
      'Aucune position partagée — les résultats racontent la course',
    );
  });
});
