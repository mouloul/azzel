import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDatabaseOwnerUrl } from './env';

const KEYS = ['DATABASE_URL', 'DATABASE_OWNER_URL', 'AZZEL_OWNER_PASSWORD'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    process.env[key] = '';
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('readDatabaseOwnerUrl — connexions propriétaires (story 1.9)', () => {
  it('URL explicite prioritaire sur toute dérivation', () => {
    process.env.DATABASE_URL = 'postgres://azzel_app:azzel@localhost:54329/azzel';
    process.env.DATABASE_OWNER_URL = 'postgres://proprio:secret@localhost:54330/autre';
    expect(readDatabaseOwnerUrl()).toBe('postgres://proprio:secret@localhost:54330/autre');
  });

  it('fallback : même hôte/port/base, utilisateur azzel et mot de passe AZZEL_OWNER_PASSWORD', () => {
    process.env.DATABASE_URL = 'postgres://azzel_app:app-secret@localhost:54329/azzel';
    process.env.AZZEL_OWNER_PASSWORD = 'proprio-secret';
    expect(readDatabaseOwnerUrl()).toBe('postgres://azzel:proprio-secret@localhost:54329/azzel');
  });

  it('fallback sans AZZEL_OWNER_PASSWORD : mot de passe dev « azzel »', () => {
    process.env.DATABASE_URL = 'postgres://azzel_app:app@localhost:54329/azzel';
    expect(readDatabaseOwnerUrl()).toBe('postgres://azzel:azzel@localhost:54329/azzel');
  });

  it('null sans DATABASE_URL ni URL explicite', () => {
    expect(readDatabaseOwnerUrl()).toBeNull();
  });

  it('null si DATABASE_URL invalide (sans URL owner explicite)', () => {
    process.env.DATABASE_URL = 'pas-une-url';
    expect(readDatabaseOwnerUrl()).toBeNull();
  });
});
