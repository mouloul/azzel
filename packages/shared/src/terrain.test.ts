import { describe, expect, it } from 'vitest';

import { JETON_EDOSSARD_LENGTH } from './edossard';
import {
  PASSAGE_SCHEMA_VERSION,
  PASSAGE_TERRAIN_TYPE,
  RETRAIT_SCHEMA_VERSION,
  RETRAIT_TERRAIN_TYPE,
  cleIdempotencePassage,
  cleIdempotenceRetrait,
  estPassageValide,
  estRetraitValide,
  type PassageTerrain,
  type RetraitTerrain,
} from './terrain';

// Story 4.3 — tests du contrat d'événement terrain « retrait » (AD-2, AD-8,
// NFR-7) : garde défensive complète (version, type, identifiants, jeton,
// horodatage ISO UTC) et clé d'idempotence générée par shared uniquement.
// Le consommateur (outbox IndexedDB, sync 4.5) ne doit pouvoir compter QUE sur
// ces garanties.
// Story 4.4 — même gabarit pour le contrat « passage » : la clé NATURELLE
// (édition, coureur, checkpoint) et la clé locale (appareil en plus, AD-2)
// ne doivent JAMAIS collisionner avec les retraits.

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

// ---------------------------------------------------------------------------
// Story 4.4 — contrat passage : même gabarit, checkpoint en plus.
// ---------------------------------------------------------------------------

const CHECKPOINT = 'mission-scan-km12';

function passageValide(surcharge: Partial<PassageTerrain> = {}): PassageTerrain {
  return {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId: 'edition-1',
    jeton: JETON,
    checkpointId: CHECKPOINT,
    horodatage: '2027-05-16T07:05:09.000Z',
    appareilId: 'appareil-1',
    ...surcharge,
  };
}

describe('contrat passage — constantes', () => {
  it('version 1, type « passage », même jeton que le contrat e-dossard', () => {
    expect(PASSAGE_SCHEMA_VERSION).toBe(1);
    expect(PASSAGE_TERRAIN_TYPE).toBe('passage');
    expect(JETON).toHaveLength(JETON_EDOSSARD_LENGTH);
  });
});

describe('estPassageValide — garde défensive du contrat', () => {
  it('accepte un événement exactement de la bonne forme', () => {
    expect(estPassageValide(passageValide())).toBe(true);
  });

  it('payload minimal (NFR-7) : sept champs, AUCUN nom de coureur', () => {
    const evenement = passageValide();
    expect(Object.keys(evenement).sort()).toEqual([
      'appareilId',
      'checkpointId',
      'editionId',
      'horodatage',
      'jeton',
      'type',
      'version',
    ]);
  });

  it('refuse version inconnue ou type étranger (le retrait n’est pas un passage)', () => {
    expect(estPassageValide(passageValide({ version: 2 as PassageTerrain['version'] }))).toBe(
      false,
    );
    expect(estPassageValide(passageValide({ version: 0 as PassageTerrain['version'] }))).toBe(
      false,
    );
    expect(estPassageValide(passageValide({ type: 'retrait' as PassageTerrain['type'] }))).toBe(
      false,
    );
    // Symétrie : un retrait valide n'est pas un passage.
    expect(
      estPassageValide({
        version: RETRAIT_SCHEMA_VERSION,
        type: RETRAIT_TERRAIN_TYPE,
        editionId: 'edition-1',
        jeton: JETON,
        horodatage: '2027-05-16T07:05:09.000Z',
        appareilId: 'appareil-1',
      }),
    ).toBe(false);
  });

  it('refuse identifiants vides (checkpointId inclus), jeton mal formé, horodatage hors ISO UTC', () => {
    expect(estPassageValide(passageValide({ editionId: '' }))).toBe(false);
    expect(estPassageValide(passageValide({ checkpointId: '  ' }))).toBe(false);
    expect(estPassageValide(passageValide({ appareilId: '' }))).toBe(false);
    expect(estPassageValide(passageValide({ jeton: 'court' }))).toBe(false);
    expect(estPassageValide(passageValide({ horodatage: '2027-05-16T07:05:09+02:00' }))).toBe(
      false,
    );
    expect(estPassageValide(passageValide({ horodatage: '2027-05-16 07:05:09Z' }))).toBe(false);
    expect(estPassageValide(passageValide({ horodatage: 'nimporte' }))).toBe(false);
  });

  it('refuse non-objets sans exception (défense en profondeur)', () => {
    expect(estPassageValide(null)).toBe(false);
    expect(estPassageValide(undefined)).toBe(false);
    expect(estPassageValide('passage')).toBe(false);
    expect(estPassageValide(42)).toBe(false);
  });
});

describe('cleIdempotencePassage — appareil + édition + jeton + checkpoint (AD-2, AD-6)', () => {
  it('déterministe : mêmes entrées, même clé', () => {
    expect(cleIdempotencePassage('app-1', 'edition-1', JETON, CHECKPOINT)).toBe(
      cleIdempotencePassage('app-1', 'edition-1', JETON, CHECKPOINT),
    );
  });

  it('chaque composant discrimine : appareil, édition, coureur, checkpoint', () => {
    const base = cleIdempotencePassage('app-1', 'edition-1', JETON, CHECKPOINT);
    expect(cleIdempotencePassage('app-2', 'edition-1', JETON, CHECKPOINT)).not.toBe(base);
    expect(cleIdempotencePassage('app-1', 'edition-2', JETON, CHECKPOINT)).not.toBe(base);
    expect(cleIdempotencePassage('app-1', 'edition-1', 'ZyXwVuTsRqPoNmLkJiHgFe', CHECKPOINT)).not.toBe(
      base,
    );
    expect(cleIdempotencePassage('app-1', 'edition-1', JETON, 'mission-scan-km30')).not.toBe(base);
  });

  it('porte le type et la version : JAMAIS de collision avec les clés retrait', () => {
    expect(cleIdempotencePassage('app-1', 'edition-1', JETON, CHECKPOINT)).toBe(
      `passage:v1:app-1:edition-1:${JETON}:${CHECKPOINT}`,
    );
    // Même appareil, même édition, même coureur : les préfixes distincts
    // espace le MÊME store outbox (coexistence 4.3/4.4).
    expect(cleIdempotencePassage('app-1', 'edition-1', JETON, CHECKPOINT)).not.toBe(
      cleIdempotenceRetrait('app-1', 'edition-1', JETON),
    );
    // Cas pathologique : un checkpointId qui ressemble à un jeton ne crée
    // toujours pas de collision (préfixe type+version en tête).
    expect(
      cleIdempotencePassage('app-1', 'edition-1', JETON, 'ZyXwVuTsRqPoNmLkJiHgFe'),
    ).not.toBe(cleIdempotenceRetrait('app-1', 'edition-1', 'ZyXwVuTsRqPoNmLkJiHgFe'));
  });
});
