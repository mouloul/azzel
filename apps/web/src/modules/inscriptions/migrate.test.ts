import { describe, expect, it, vi } from 'vitest';

import { injectAppPassword } from './migrate';

const CONTENT = "CREATE ROLE azzel_app LOGIN PASSWORD '__AZZEL_APP_PASSWORD__';";

describe('injectAppPassword — mot de passe du rôle applicatif (story 1.9)', () => {
  it('AZZEL_APP_PASSWORD posée : injectée et échappée', () => {
    vi.stubEnv('AZZEL_APP_PASSWORD', "secret'avec'quotes");
    try {
      expect(injectAppPassword(CONTENT)).toBe(
        "CREATE ROLE azzel_app LOGIN PASSWORD 'secret''avec''quotes';",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('développement sans variable : repli documenté sur « azzel »', () => {
    vi.stubEnv('AZZEL_APP_PASSWORD', '');
    vi.stubEnv('NODE_ENV', 'development');
    try {
      expect(injectAppPassword(CONTENT)).toBe("CREATE ROLE azzel_app LOGIN PASSWORD 'azzel';");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('production sans variable : échec explicite, aucun repli silencieux', () => {
    vi.stubEnv('AZZEL_APP_PASSWORD', '');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => injectAppPassword(CONTENT)).toThrowError(/AZZEL_APP_PASSWORD/);
      expect(() => injectAppPassword(CONTENT)).not.toThrowError(/'azzel'/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('migration sans placeholder : inchangée, même en production sans variable', () => {
    vi.stubEnv('AZZEL_APP_PASSWORD', '');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(injectAppPassword('ALTER TABLE session FORCE ROW LEVEL SECURITY;')).toBe(
        'ALTER TABLE session FORCE ROW LEVEL SECURITY;',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
