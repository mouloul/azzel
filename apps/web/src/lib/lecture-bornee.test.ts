import { afterEach, describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';

import { lectureBornee, lectureBorneeOuIndisponible } from './lecture-bornee';

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

describe('lectureBorneeOuIndisponible', () => {
  it('rend la valeur lue quand la base répond à temps', async () => {
    await expect(lectureBorneeOuIndisponible(Promise.resolve('lu'), 'test', 50)).resolves.toBe(
      'lu',
    );
  });

  it('lève DbUnavailableError quand la base ne répond jamais (plus de 504 à 300 s)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const jamais = new Promise<string>(() => {});

    const resultat = lectureBorneeOuIndisponible(jamais, 'session', 8_000);
    const verification = expect(resultat).rejects.toBeInstanceOf(DbUnavailableError);
    await vi.advanceTimersByTimeAsync(8_000);

    await verification;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('session'));
  });

  it('laisse éclater une erreur qui n’est pas un délai', async () => {
    await expect(
      lectureBorneeOuIndisponible(Promise.reject(new Error('bug')), 'test', 50),
    ).rejects.toThrow('bug');
  });
});
