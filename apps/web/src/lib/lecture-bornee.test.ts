import { afterEach, describe, expect, it, vi } from 'vitest';

import { lectureBornee } from './lecture-bornee';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('lectureBornee', () => {
  it('rend la valeur lue quand la base répond à temps', async () => {
    await expect(lectureBornee(Promise.resolve('lu'), 'repli', 'test', 50)).resolves.toBe('lu');
  });

  it('rend le repli quand la base ne répond jamais (prérendu borné)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const jamais = new Promise<string>(() => {});

    const resultat = lectureBornee(jamais, 'repli', 'partenaires', 8_000);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(resultat).resolves.toBe('repli');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('partenaires'));
  });

  it('laisse éclater une erreur qui n’est pas un délai', async () => {
    await expect(
      lectureBornee(Promise.reject(new Error('bug')), 'repli', 'test', 50),
    ).rejects.toThrow('bug');
  });
});
