import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTION_COURTE,
  FONDS_DISPONIBLES,
  FOND_PAR_DEFAUT,
  FOND_TOPO,
  MOTEUR_CARTE,
  RELIEF_TERRARIUM,
  attributionCourte,
  attributions,
  cleArcgisValide,
  exigeUneCle,
  fondSatellite,
  fondsDisponibles,
} from './fonds-carte';

/* Story 11.2 — ces tests épinglent une DÉCISION JURIDIQUE, pas une
 * préférence d'implémentation. Les faire passer en changeant les
 * attendus revient à modifier l'arbitrage : relire d'abord
 * `decision-fond-cartographique-2026-11-05.md` et la note licences. */

describe('fonds de carte — décision du 2026-11-05, amendée', () => {
  // Amendement (même jour) : le satellite est proposé SI ET SEULEMENT SI une
  // clé ArcGIS Location Platform est fournie. Sans clé, rien ne change : un seul
  // fond, aucun appel vers Esri.
  const SANS_CLE = fondsDisponibles(null);

  it('sans clé : aucun fond satellite, le topographique seul', () => {
    expect(SANS_CLE).toEqual([FOND_TOPO]);
    expect(FOND_PAR_DEFAUT).toBe(FOND_TOPO);
  });

  it('sans clé : aucun endpoint Esri ne part, ni le service anonyme ni l’autre', () => {
    const toutesLesUrl = [...SANS_CLE, RELIEF_TERRARIUM].flatMap((s) => s.tuiles);
    for (const url of toutesLesUrl) {
      expect(url).not.toMatch(/arcgis/i);
      expect(url).not.toMatch(/esri/i);
    }
  });

  it('sans clé : aucune source ne réclame de clé', () => {
    for (const source of [...SANS_CLE, RELIEF_TERRARIUM]) {
      expect(exigeUneCle(source)).toBe(false);
    }
  });

  it('les tuiles sont servies en HTTPS', () => {
    const toutesLesUrl = [...fondsDisponibles('cle-de-test'), RELIEF_TERRARIUM].flatMap((s) => s.tuiles);
    for (const url of toutesLesUrl) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('fond satellite — ArcGIS Location Platform, avec clé', () => {
  const CLE = 'AAPK-cle-de-test_123';

  it('avec une clé valide, le satellite est proposé EN PLUS du topographique', () => {
    const fonds = fondsDisponibles(CLE);
    expect(fonds.map((f) => f.id)).toEqual(['topo', 'satellite']);
  });

  it('l’adresse est celle du service À CLÉ, jamais le service anonyme du POC', () => {
    const [url] = fondSatellite(CLE).tuiles;
    expect(url).toContain('ibasemaps-api.arcgis.com');
    expect(url).toContain('World_Imagery');
    // L'endpoint sans clé du POC n'est couvert par aucun contrat : il ne doit
    // JAMAIS réapparaître, même par recopie.
    expect(url).not.toContain('server.arcgisonline.com');
    expect(url).not.toContain('services.arcgisonline.com');
  });

  it('la clé est passée en paramètre `token` de chaque URL de tuile', () => {
    for (const url of fondSatellite(CLE).tuiles) {
      expect(url).toContain(`token=${CLE}`);
    }
  });

  it('ce fond EXIGE une clé : exigeUneCle le reconnaît (le garde-fou voit juste)', () => {
    expect(exigeUneCle(fondSatellite(CLE))).toBe(true);
  });

  it('l’attribution Esri est présente et distincte de celle d’OpenTopoMap', () => {
    const { attribution } = fondSatellite(CLE);
    expect(attribution).toContain('Esri');
    expect(attribution).toContain('Maxar');
    expect(attribution).toContain('Earthstar Geographics');
    expect(attribution).not.toContain('OpenTopoMap');
  });

  it('zoom maximal 18 : l’imagerie s’arrête là sur la zone, au-delà MapLibre sur-échantillonne', () => {
    expect(fondSatellite(CLE).zoomMax).toBe(18);
  });

  it.each([null, undefined, '', '   '])('clé absente ou vide (%j) : pas de satellite', (cle) => {
    expect(fondsDisponibles(cle as string | null | undefined)).toEqual([FOND_TOPO]);
  });

  it.each(['a b', 'x&y=1', 'cle?token=autre', 'cle/../', '<script>', 'é'])(
    'clé « %s » : refusée — une valeur d’environnement ne doit pas pouvoir injecter un paramètre',
    (cle) => {
      expect(cleArcgisValide(cle)).toBe(false);
      expect(fondsDisponibles(cle)).toEqual([FOND_TOPO]);
    },
  );

  it('clé valide : lettres, chiffres, tiret, souligné, point, tilde', () => {
    expect(cleArcgisValide('AAPK0a1B2c-3D_4.5~6')).toBe(true);
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
    for (const fond of fondsDisponibles('cle-de-test')) {
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

  it('satellite actif : le bloc nomme Esri, le relief et le moteur — jamais OpenTopoMap', () => {
    const sat = fondSatellite('cle-de-test');
    const bloc = attributions(sat);
    expect(bloc).toEqual([sat.attribution, RELIEF_TERRARIUM.attribution, MOTEUR_CARTE.attribution]);
    expect(bloc.join(' ')).not.toContain('OpenTopoMap');
  });

  it('la mention courte suit le fond actif', () => {
    expect(attributionCourte(FOND_TOPO)).toContain('OpenTopoMap');
    expect(attributionCourte(fondSatellite('cle-de-test'))).toContain('Esri');
    expect(attributionCourte(fondSatellite('cle-de-test'))).not.toContain('OpenTopoMap');
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
