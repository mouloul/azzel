import { describe, expect, it } from 'vitest';

import { normaliserNumeroTransaction } from './numero-transaction';

describe('normaliserNumeroTransaction', () => {
  it('retire les espaces et met en majuscules', () => {
    expect(normaliserNumeroTransaction(' 0125 9424 6237 ')).toEqual({
      ok: true,
      numero: '012594246237',
    });
    expect(normaliserNumeroTransaction('ab-12/cd34')).toEqual({ ok: true, numero: 'AB-12/CD34' });
  });

  it.each([undefined, null, 42, '', '   ', '12345', 'x'.repeat(31), 'ABC 12#45'])(
    'refuse %j',
    (valeur) => {
      expect(normaliserNumeroTransaction(valeur).ok).toBe(false);
    },
  );
});
