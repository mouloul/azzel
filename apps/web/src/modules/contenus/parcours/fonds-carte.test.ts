import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTION_COURTE,
  FONDS_DISPONIBLES,
  FOND_PAR_DEFAUT,
  FOND_TOPO,
  MOTEUR_CARTE,
  RELIEF_TERRARIUM,
  attributions,
  exigeUneCle,
} from './fonds-carte';

/* Story 11.2 — ces tests épinglent une DÉCISION JURIDIQUE, pas une
 * préférence d'implémentation. Les faire passer en changeant les
 * attendus revient à modifier l'arbitrage : relire d'abord
 * `decision-fond-cartographique-2026-11-05.md` et la note licences. */

describe('fonds de carte — décision du 2026-11-05', () => {
  it('aucun fond satellite n’est proposé', () => {
    expect(FONDS_DISPONIBLES).toHaveLength(1);
    expect(FOND_PAR_DEFAUT).toBe(FOND_TOPO);
  });

  it('aucun endpoint Esri ne part en production', () => {
    const toutesLesUrl = [...FONDS_DISPONIBLES, RELIEF_TERRARIUM].flatMap((s) => s.tuiles);
    for (const url of toutesLesUrl) {
      expect(url).not.toMatch(/arcgis/i);
      expect(url).not.toMatch(/esri/i);
    }
  });

  it('aucune source ne réclame de clé : rien à tenir hors du dépôt', () => {
    for (const source of [...FONDS_DISPONIBLES, RELIEF_TERRARIUM]) {
      expect(exigeUneCle(source)).toBe(false);
    }
  });

  it('les tuiles sont servies en HTTPS', () => {
    const toutesLesUrl = [...FONDS_DISPONIBLES, RELIEF_TERRARIUM].flatMap((s) => s.tuiles);
    for (const url of toutesLesUrl) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('attributions (FR-32, §5 de la note licences)', () => {
  it('le texte d’OpenTopoMap est reproduit mot pour mot', () => {
    expect(FOND_TOPO.attribution).toBe(
      'Données cartographiques : © Contributeurs OpenStreetMap, SRTM | Rendu : © OpenTopoMap (CC-BY-SA)',
    );
  });

  it('le crédit USGS exigé par le relief est présent', () => {
    expect(RELIEF_TERRARIUM.attribution).toContain('U.S. Geological Survey');
    expect(RELIEF_TERRARIUM.attribution).toContain('Tilezen');
  });

  it('le relief est crédité quel que soit le fond actif', () => {
    for (const fond of FONDS_DISPONIBLES) {
      expect(attributions(fond)).toContain(RELIEF_TERRARIUM.attribution);
    }
  });

  it('le bloc nomme le fond actif, le relief et le moteur, dans cet ordre', () => {
    expect(attributions(FOND_TOPO)).toEqual([
      FOND_TOPO.attribution,
      RELIEF_TERRARIUM.attribution,
      MOTEUR_CARTE.attribution,
    ]);
  });

  it('la mention courte nomme chaque ayant droit', () => {
    for (const ayantDroit of ['OpenStreetMap', 'OpenTopoMap', 'USGS', 'MapLibre']) {
      expect(ATTRIBUTION_COURTE).toContain(ayantDroit);
    }
  });
});

describe('exigeUneCle', () => {
  it('repère une clé dans une URL de tuiles', () => {
    const base = { ...FOND_TOPO };
    expect(
      exigeUneCle({ ...base, tuiles: ['https://ex.dz/{z}/{x}/{y}.png?api_key=abc'] }),
    ).toBe(true);
    expect(
      exigeUneCle({ ...base, tuiles: ['https://ex.dz/{z}/{x}/{y}.png?access_token=abc'] }),
    ).toBe(true);
    expect(exigeUneCle({ ...base, tuiles: ['https://ex.dz/{key}/{z}/{x}/{y}.png'] })).toBe(true);
    expect(exigeUneCle({ ...base, tuiles: ['https://ex.dz/{z}/{x}/{y}.png'] })).toBe(false);
  });
});
