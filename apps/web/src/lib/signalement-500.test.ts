import { beforeEach, describe, expect, it, vi } from 'vitest';

const signaler = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observabilite', () => ({ signalerErreurInattendue: signaler }));

import { toVolontairesApiError } from '@/app/api/volontaires/guard';
import {
  toChronoAdminApiError,
  toChronoApiError,
  toCartePubliqueApiError,
  toCourseApiError,
  toResultatsPublicApiError,
} from '@/modules/chrono/errors';
import { toContenusApiError } from '@/modules/contenus/errors';
import { DbUnavailableError, toApiError as toIamApiError } from '@/modules/iam/errors';
import {
  toAcceptancesApiError,
  toAdminApiError,
  toApiError as toInscriptionsApiError,
  toPreuveApiError,
} from '@/modules/inscriptions/errors';
import { toMissionsApiError } from '@/modules/missions/errors';
import { toRapportsApiError } from '@/modules/rapports/errors';
import { toRetourImagesApiError } from '@/modules/retour-images/errors';
import { toSponsorsApiError } from '@/modules/sponsors/errors';
import { toTrackingApiError } from '@/modules/tracking/errors';

// Câblage des points qui produisent un 500 générique (story 12.1) : une erreur
// inconnue est signalée avec le bon module ; une erreur classée ne l'est pas.

const MAPPERS: ReadonlyArray<[string, (e: unknown) => { status: number }, string]> = [
  ['iam', toIamApiError, 'iam'],
  ['contenus', toContenusApiError, 'contenus'],
  ['inscriptions', toInscriptionsApiError, 'inscriptions'],
  ['acceptances', toAcceptancesApiError, 'acceptances'],
  ['preuve', toPreuveApiError, 'preuve'],
  ['admin', toAdminApiError, 'admin'],
  ['chrono', toChronoApiError, 'chrono'],
  ['chrono admin', toChronoAdminApiError, 'chrono'],
  ['course', toCourseApiError, 'chrono'],
  ['résultats publics', toResultatsPublicApiError, 'chrono'],
  ['carte publique', toCartePubliqueApiError, 'chrono'],
  ['retour-images', toRetourImagesApiError, 'retour-images'],
  ['sponsors', toSponsorsApiError, 'sponsors'],
  ['rapports', toRapportsApiError, 'rapports'],
  ['missions', toMissionsApiError, 'missions'],
  ['volontaires', toVolontairesApiError, 'volontaires'],
  ['tracking', toTrackingApiError, 'tracking'],
];

beforeEach(() => {
  signaler.mockReset();
});

describe.each(MAPPERS)('mapper %s', (_nom, mapper, module) => {
  it('signale une erreur inconnue avec le bon module', () => {
    const erreur = new Error('inconnue');
    expect(mapper(erreur).status).toBe(500);
    expect(signaler).toHaveBeenCalledTimes(1);
    expect(signaler).toHaveBeenCalledWith(module, erreur);
  });

  it('ne signale pas une base indisponible (503)', () => {
    expect(mapper(new DbUnavailableError(new Error('x'))).status).toBe(503);
    expect(signaler).not.toHaveBeenCalled();
  });
});
