import { describe, expect, it } from 'vitest';

import {
  EDOSSARD_PAYLOAD_PREFIX,
  EDOSSARD_PAYLOAD_VERSION,
  JETON_EDOSSARD_LENGTH,
  decoderPayloadEdossard,
  encoderPayloadEdossard,
  estJetonEdossardValide,
} from './edossard';

// Story 4.1 — tests du contrat payload QR (AD-8) : le consommateur (scanneur
// épopée 4) ne doit pouvoir compter QUE sur ces garanties — préfixe versionné
// exact, roundtrip encode/decode, décode total (null, jamais d'exception),
// jeton base64url de 22 caractères (symétrie du CHECK SQL 0023).

const JETON = 'AbCdEf0123456789-_XyZa'; // 22 caractères base64url

function jeton(longueur: number): string {
  return 'A'.repeat(longueur);
}

describe('contrat payload e-dossard — constantes', () => {
  it('version e1, préfixe azzel-e1:, jeton de 22 caractères', () => {
    expect(EDOSSARD_PAYLOAD_VERSION).toBe('e1');
    expect(EDOSSARD_PAYLOAD_PREFIX).toBe('azzel-e1:');
    expect(JETON_EDOSSARD_LENGTH).toBe(22);
  });
});

describe('encoderPayloadEdossard / decoderPayloadEdossard — roundtrip', () => {
  it('encode `azzel-e1:<jeton>` — JAMAIS le dossard nu', () => {
    expect(encoderPayloadEdossard(JETON)).toBe(`azzel-e1:${JETON}`);
    expect(encoderPayloadEdossard(JETON)).not.toContain('74');
  });

  it('roundtrip : ce qui est encodé se décode à l’identique', () => {
    expect(decoderPayloadEdossard(encoderPayloadEdossard(JETON))).toBe(JETON);
  });

  it('encode échoue fort sur un jeton mal formé (bug serveur à attraper)', () => {
    expect(() => encoderPayloadEdossard(jeton(21))).toThrow(TypeError);
    expect(() => encoderPayloadEdossard(jeton(23))).toThrow(TypeError);
    expect(() => encoderPayloadEdossard('pas/base64+url=')).toThrow(TypeError);
    expect(() => encoderPayloadEdossard('')).toThrow(TypeError);
  });
});

describe('decoderPayloadEdossard — total (null, jamais d’exception)', () => {
  it('payloads invalides → null', () => {
    expect(decoderPayloadEdossard(null)).toBeNull();
    expect(decoderPayloadEdossard(undefined)).toBeNull();
    expect(decoderPayloadEdossard(42)).toBeNull();
    expect(decoderPayloadEdossard('')).toBeNull();
    // Pas de préfixe / autre version du contrat.
    expect(decoderPayloadEdossard(JETON)).toBeNull();
    expect(decoderPayloadEdossard(`azzel-e2:${JETON}`)).toBeNull();
    expect(decoderPayloadEdossard(`azzel-e0:${JETON}`)).toBeNull();
    expect(decoderPayloadEdossard(`e1:${JETON}`)).toBeNull();
  });

  it('préfixe bon mais jeton mal formé → null (longueur, alphabet)', () => {
    expect(decoderPayloadEdossard(`azzel-e1:${jeton(21)}`)).toBeNull();
    expect(decoderPayloadEdossard(`azzel-e1:${jeton(23)}`)).toBeNull();
    expect(decoderPayloadEdossard(`azzel-e1:${jeton(21)}=`)).toBeNull();
    expect(decoderPayloadEdossard('azzel-e1:pas+base64/url!')).toBeNull();
  });

  it('le dossard nu n’est pas un payload décodable (défense FR-7)', () => {
    expect(decoderPayloadEdossard('74')).toBeNull();
    expect(decoderPayloadEdossard('azzel-e1:74')).toBeNull();
  });
});

describe('estJetonEdossardValide — garde de forme', () => {
  it('accepte base64url de 22 caractères (tiret et souligné inclus)', () => {
    expect(estJetonEdossardValide(JETON)).toBe(true);
    expect(estJetonEdossardValide('-_'.repeat(11))).toBe(true);
  });

  it('refuse autres formes', () => {
    expect(estJetonEdossardValide(jeton(21))).toBe(false);
    expect(estJetonEdossardValide(jeton(23))).toBe(false);
    expect(estJetonEdossardValide('avec espace dans le jeton!')).toBe(false);
    expect(estJetonEdossardValide(null)).toBe(false);
    expect(estJetonEdossardValide(22)).toBe(false);
  });
});
