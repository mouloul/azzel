import { describe, expect, it } from 'vitest';

import { JETON_EDOSSARD_LENGTH } from './edossard';
import {
  RETRAIT_SCHEMA_VERSION,
  RETRAIT_TERRAIN_TYPE,
  cleIdempotenceRetrait,
  estRetraitValide,
  type RetraitTerrain,
} from './terrain';

// Story 4.3 — tests du contrat d'événement terrain « retrait » (AD-2, AD-8,
// NFR-7) : garde défensive complète (version, type, identifiants, jeton,
// horodatage ISO UTC) et clé d'idempotence générée par shared uniquement.
// Le consommateur (outbox IndexedDB, sync 4.5) ne doit pouvoir compter QUE sur
// ces garanties.

const JETON = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 caractères base64url

function retraitValide(surcharge: Partial<RetraitTerrain> = {}): RetraitTerrain {
  return {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId: 'edition-1',
    jeton: JETON,
    horodatage: '2027-05-16T06:12:30.000Z',
    appareilId: 'appareil-1',
    ...surcharge,
  };
}

describe('contrat retrait — constantes', () => {
  it('version 1, type « retrait », jeton symétrique du contrat e-dossard', () => {
    expect(RETRAIT_SCHEMA_VERSION).toBe(1);
    expect(RETRAIT_TERRAIN_TYPE).toBe('retrait');
    expect(JETON).toHaveLength(JETON_EDOSSARD_LENGTH);
  });
});

describe('estRetraitValide — garde défensive du contrat', () => {
  it('accepte un événement exactement de la bonne forme', () => {
    expect(estRetraitValide(retraitValide())).toBe(true);
  });

  it('payload minimal (NFR-7) : six champs, AUCUN nom de coureur', () => {
    const evenement = retraitValide();
    expect(Object.keys(evenement).sort()).toEqual([
      'appareilId',
      'editionId',
      'horodatage',
      'jeton',
      'type',
      'version',
    ]);
  });

  it('refuse version inconnue ou type étranger (le Passage 4.4 n’est pas un retrait)', () => {
    expect(estRetraitValide(retraitValide({ version: 2 as RetraitTerrain['version'] }))).toBe(
      false,
    );
    expect(estRetraitValide(retraitValide({ version: 0 as RetraitTerrain['version'] }))).toBe(
      false,
    );
    expect(estRetraitValide(retraitValide({ type: 'passage' as RetraitTerrain['type'] }))).toBe(
      false,
    );
  });

  it('refuse identifiants vides, jeton mal formé, horodatage hors ISO UTC', () => {
    expect(estRetraitValide(retraitValide({ editionId: '' }))).toBe(false);
    expect(estRetraitValide(retraitValide({ appareilId: '  ' }))).toBe(false);
    expect(estRetraitValide(retraitValide({ jeton: 'court' }))).toBe(false);
    expect(estRetraitValide(retraitValide({ horodatage: '2027-05-16T06:12:30+02:00' }))).toBe(
      false,
    );
    expect(estRetraitValide(retraitValide({ horodatage: '2027-05-16 06:12:30Z' }))).toBe(false);
    expect(estRetraitValide(retraitValide({ horodatage: 'nimporte' }))).toBe(false);
  });

  it('refuse non-objets sans exception (défense en profondeur)', () => {
    expect(estRetraitValide(null)).toBe(false);
    expect(estRetraitValide(undefined)).toBe(false);
    expect(estRetraitValide('retrait')).toBe(false);
    expect(estRetraitValide(42)).toBe(false);
  });
});

describe('cleIdempotenceRetrait — appareil + édition + jeton (AD-2)', () => {
  it('déterministe : mêmes entrées, même clé', () => {
    expect(cleIdempotenceRetrait('app-1', 'edition-1', JETON)).toBe(
      cleIdempotenceRetrait('app-1', 'edition-1', JETON),
    );
  });

  it('chaque composant discrimine : appareil, édition, coureur', () => {
    const base = cleIdempotenceRetrait('app-1', 'edition-1', JETON);
    expect(cleIdempotenceRetrait('app-2', 'edition-1', JETON)).not.toBe(base);
    expect(cleIdempotenceRetrait('app-1', 'edition-2', JETON)).not.toBe(base);
    expect(cleIdempotenceRetrait('app-1', 'edition-1', 'ZyXwVuTsRqPoNmLkJiHgFe')).not.toBe(base);
  });

  it('porte le type et la version : le futur Passage (4.4) ne collisionne jamais', () => {
    expect(cleIdempotenceRetrait('app-1', 'edition-1', JETON)).toBe(
      `retrait:v1:app-1:edition-1:${JETON}`,
    );
  });
});
