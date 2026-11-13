import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Pilote MapLibre — surcouche noms et chemins (OpenFreeMap) sur le satellite.
 *
 * MapLibre exige WebGL : on le remplace par une carte factice qui tient la
 * pile ordonnée des couches, leurs visibilités et les sources. Comme
 * MapLibre 4.7.1, elle n'émet `load` que si TOUTES les sources du style
 * initial sont chargées ; une source décrite par TileJSON (`url`) n'y est
 * jamais chargée, comme un TileJSON lent ou injoignable. Ce qu'on vérifie
 * ici, c'est le PILOTE (quand il ajoute la surcouche, où, et ce qu'il
 * bascule), pas le moteur.
 */

type Ecouteur = (evenement: Record<string, unknown>) => void;
type CoucheStyle = { id: string; layout?: { visibility?: string } };
type StyleInitial = { layers: CoucheStyle[]; sources: Record<string, { url?: string }> };

class CarteFactice {
  static derniere: CarteFactice | null = null;
  /** Pile des couches, du bas vers le haut. */
  readonly couches: string[] = [];
  readonly visibilite = new Map<string, string>();
  readonly sources = new Map<string, { charge: boolean; spec: Record<string, unknown> }>();
  readonly sourcesAjoutees: string[] = [];
  readonly couchesAjoutees: { id: string; avant: string | undefined }[] = [];
  readonly ecouteurs = new Map<string, Ecouteur[]>();

  constructor(options: { style: StyleInitial }) {
    for (const couche of options.style.layers) {
      this.couches.push(couche.id);
      this.visibilite.set(couche.id, couche.layout?.visibility ?? 'visible');
    }
    for (const [id, spec] of Object.entries(options.style.sources)) {
      // Source TileJSON : jamais chargée ici (TileJSON qui ne répond pas).
      this.sources.set(id, { charge: spec.url === undefined, spec });
    }
    CarteFactice.derniere = this;
    setTimeout(() => {
      if ([...this.sources.values()].every((s) => s.charge)) this.emettre('load');
    }, 0);
  }

  on(type: string, ecouteur: Ecouteur) {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), ecouteur]);
    return this;
  }
  emettre(type: string, evenement: Record<string, unknown> = {}) {
    for (const ecouteur of this.ecouteurs.get(type) ?? []) ecouteur(evenement);
  }
  addControl() {}
  setTerrain() {}
  getTerrain() {
    return null;
  }
  fitBounds() {}
  easeTo() {}
  resize() {}
  remove() {}
  addSource(id: string, spec: Record<string, unknown>) {
    if (this.sources.has(id)) throw new Error(`source déjà présente : ${id}`);
    this.sources.set(id, { charge: false, spec });
    this.sourcesAjoutees.push(id);
  }
  addLayer(couche: CoucheStyle & { source?: string }, avant?: string) {
    if (this.visibilite.has(couche.id)) throw new Error(`couche déjà présente : ${couche.id}`);
    if (couche.source !== undefined && !this.sources.has(couche.source)) {
      throw new Error(`source inconnue : ${couche.source}`);
    }
    const rang = avant === undefined ? this.couches.length : this.couches.indexOf(avant);
    if (rang < 0) throw new Error(`couche de référence absente : ${String(avant)}`);
    this.couches.splice(rang, 0, couche.id);
    this.visibilite.set(couche.id, couche.layout?.visibility ?? 'visible');
    this.couchesAjoutees.push({ id: couche.id, avant });
  }
  setLayoutProperty(id: string, propriete: string, valeur: string) {
    if (!this.visibilite.has(id)) throw new Error(`couche inexistante : ${id}`);
    if (propriete === 'visibility') this.visibilite.set(id, valeur);
  }
}

vi.mock('maplibre-gl', () => ({
  default: {
    Map: CarteFactice,
    NavigationControl: class {},
    ScaleControl: class {},
    Marker: class {},
    Popup: class {},
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const { ouvrirCarte } = await import('./carte-maplibre');
const { IDS } = await import('@/modules/contenus/parcours/carte');
const { fondSatellite, urlPorteUneCle, SURCOUCHE_OSM } = await import(
  '@/modules/contenus/parcours/fonds-carte'
);
const { COUCHES_LIBELLES_SURCOUCHE, COUCHES_LIGNES_SURCOUCHE, COUCHES_SURCOUCHE, IDS_SURCOUCHE } =
  await import('@/modules/contenus/parcours/surcouche-osm');

const COULEURS = { trace: 'a', halo: 'b', cielHaut: 'c', cielHorizon: 'd' };
const TRACE = {
  points: [
    [4, 36, 100],
    [4.01, 36.01, 120],
  ] as [number, number, number][],
  distancesM: [0, 1400],
};

/** La promesse d'ouverture se résout-elle (la carte a-t-elle reçu `load`) ? */
async function resolueSousPeu<T>(promesse: Promise<T>): Promise<T> {
  return Promise.race([
    promesse,
    new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error('carte jamais ouverte')), 200)),
  ]);
}

async function ouvrir(satelliteInitial: boolean, avecSatellite = true) {
  const pilote = await resolueSousPeu(
    ouvrirCarte({
      conteneur: {} as HTMLElement,
      trace: TRACE as never,
      couleurs: COULEURS,
      reperes: [],
      satellite: avecSatellite ? fondSatellite('CLE_DE_TEST_12345') : null,
      satelliteInitial,
      mouvementReduit: true,
    }),
  );
  const carte = CarteFactice.derniere;
  if (carte === null) throw new Error('carte non créée');
  return { carte, pilote };
}

const visibilites = (carte: CarteFactice) =>
  [IDS.coucheSatellite, ...COUCHES_SURCOUCHE].map((id) => carte.visibilite.get(id));

beforeEach(() => {
  CarteFactice.derniere = null;
});

/* HYPOTHÈSE de la carte factice, pas une preuve sur MapLibre : ce test ne
 * vérifie que le mock. Le comportement imité (une source TileJSON du style
 * initial non lue retient `load`) a été vérifié À LA MAIN dans les sources de
 * maplibre-gl 4.7.1, version épinglée dans apps/web/package.json. À
 * revalider à toute montée de version de maplibre-gl. */
describe('carte factice — hypothèse : un TileJSON non lu retient `load` (maplibre-gl 4.7.1)', () => {
  it('la carte factice n’émet pas `load` tant qu’une source TileJSON du style initial n’est pas chargée', async () => {
    const carte = new CarteFactice({
      style: { layers: [], sources: { s: { url: SURCOUCHE_OSM.tilejson } } },
    });
    let charge = false;
    carte.on('load', () => {
      charge = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(charge).toBe(false);
  });
});

describe('ouverture — `load` ne dépend jamais d’OpenFreeMap', () => {
  it.each([true, false])('satellite initial = %s : la carte s’ouvre', async (satelliteInitial) => {
    const { carte } = await ouvrir(satelliteInitial);
    expect(carte.couches).toContain(IDS.coucheTrace);
  });

  it('ouverture en topo : aucun ajout de la surcouche (openfreemap.org jamais contacté)', async () => {
    const { carte } = await ouvrir(false);
    expect(carte.sourcesAjoutees).toEqual([]);
    for (const id of COUCHES_SURCOUCHE) expect(carte.couches).not.toContain(id);
    expect(JSON.stringify([...carte.sources.values()].map((s) => s.spec))).not.toContain('openfreemap');
  });

  it('sans clé : aucune surcouche, même en demandant le satellite', async () => {
    const { carte, pilote } = await ouvrir(true, false);
    pilote.definirFond('satellite');
    expect(carte.sourcesAjoutees).toEqual([]);
    expect(carte.couches).not.toContain(IDS.coucheSatellite);
  });
});

describe('ajout paresseux de la surcouche', () => {
  it('ouverture sur le satellite : source et couches ajoutées après `load`, à leur place', async () => {
    const { carte } = await ouvrir(true);
    expect(carte.sourcesAjoutees).toEqual([IDS_SURCOUCHE.source]);
    for (const id of COUCHES_LIGNES_SURCOUCHE) {
      expect(carte.couchesAjoutees).toContainEqual({ id, avant: IDS.coucheHalo });
    }
    for (const id of COUCHES_LIBELLES_SURCOUCHE) {
      expect(carte.couchesAjoutees).toContainEqual({ id, avant: undefined });
    }
    expect(visibilites(carte).every((v) => v === 'visible')).toBe(true);
  });

  it('ordre : satellite < routes et chemins < halo + tracé < libellés', async () => {
    const { carte } = await ouvrir(true);
    const rang = (id: string) => carte.couches.indexOf(id);
    for (const ligne of COUCHES_LIGNES_SURCOUCHE) {
      expect(rang(IDS.coucheSatellite)).toBeLessThan(rang(ligne));
      expect(rang(ligne)).toBeLessThan(rang(IDS.coucheHalo));
    }
    expect(rang(IDS.coucheHalo)).toBeLessThan(rang(IDS.coucheTrace));
    for (const libelle of COUCHES_LIBELLES_SURCOUCHE) {
      expect(rang(IDS.coucheTrace)).toBeLessThan(rang(libelle));
    }
  });

  it('URL de la source ajoutée : TileJSON OpenFreeMap, sans clé', async () => {
    const { carte } = await ouvrir(true);
    const url = String(carte.sources.get(IDS_SURCOUCHE.source)?.spec.url);
    expect(url).toBe(SURCOUCHE_OSM.tilejson);
    expect(urlPorteUneCle(url)).toBe(false);
  });

  it('ouverture en topo puis satellite : ajout au premier affichage, une seule fois', async () => {
    const { carte, pilote } = await ouvrir(false);
    pilote.definirFond('satellite');
    expect(carte.sourcesAjoutees).toEqual([IDS_SURCOUCHE.source]);
    expect(visibilites(carte).every((v) => v === 'visible')).toBe(true);
    for (const id of COUCHES_LIGNES_SURCOUCHE) {
      expect(carte.couchesAjoutees).toContainEqual({ id, avant: IDS.coucheHalo });
    }

    pilote.definirFond('topo');
    pilote.definirFond('satellite');
    pilote.definirFond('satellite');
    expect(carte.sourcesAjoutees).toEqual([IDS_SURCOUCHE.source]);
    expect(carte.couchesAjoutees).toHaveLength(COUCHES_SURCOUCHE.length);
  });
});

describe('definirFond — la surcouche suit le satellite', () => {
  it('bascule topo : satellite ET surcouche masqués ; retour satellite : réaffichés', async () => {
    const { carte, pilote } = await ouvrir(true);
    expect(visibilites(carte).every((v) => v === 'visible')).toBe(true);

    pilote.definirFond('topo');
    expect(visibilites(carte).every((v) => v === 'none')).toBe(true);

    pilote.definirFond('satellite');
    expect(visibilites(carte).every((v) => v === 'visible')).toBe(true);
    expect(carte.sourcesAjoutees).toEqual([IDS_SURCOUCHE.source]);
  });

  it('topo seul (surcouche jamais affichée) : la bascule topo ne touche qu’au satellite', async () => {
    const { carte, pilote } = await ouvrir(false);
    expect(() => pilote.definirFond('topo')).not.toThrow();
    expect(carte.visibilite.get(IDS.coucheSatellite)).toBe('none');
    expect(carte.sourcesAjoutees).toEqual([]);
  });
});

describe('erreurs de MapLibre', () => {
  it('aucun écouteur `error` : MapLibre garde son `console.error`', async () => {
    const { carte, pilote } = await ouvrir(true);
    pilote.definirFond('topo');
    pilote.definirFond('satellite');
    expect(carte.ecouteurs.has('error')).toBe(false);
  });
});
