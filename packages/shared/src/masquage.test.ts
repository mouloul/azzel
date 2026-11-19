import { describe, expect, it } from 'vitest';

import { MASQUE, masquerDonneesPersonnelles } from './masquage';

describe('masquerDonneesPersonnelles — par valeur', () => {
  it('masque les emails dans un texte', () => {
    expect(masquerDonneesPersonnelles('échec pour jean.dupont+x@example.fr ici')).toBe(
      `échec pour ${MASQUE} ici`,
    );
  });

  it.each([
    '+213 555 12 34 56',
    '0555 12 34 56',
    '0555123456',
    '+33 6 12 34 56 78',
    '06 12 34 56 78',
    '0033612345678',
  ])('masque le téléphone %s', (tel) => {
    expect(masquerDonneesPersonnelles(`appel ${tel} échoué`)).toBe(`appel ${MASQUE} échoué`);
  });

  it('masque une clé de preuve', () => {
    const cle = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b.pdf';
    expect(masquerDonneesPersonnelles(`lecture ${cle} impossible`)).toBe(
      `lecture ${MASQUE} impossible`,
    );
  });

  it('masque JWT et Bearer', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
    expect(masquerDonneesPersonnelles(`jeton ${jwt} refusé`)).toBe(`jeton ${MASQUE} refusé`);
    expect(masquerDonneesPersonnelles('Authorization: Bearer abc.def-123')).toBe(
      `Authorization: ${MASQUE}`,
    );
  });

  it('laisse intact un texte sans donnée personnelle', () => {
    expect(masquerDonneesPersonnelles('relation "dossiers" does not exist, code 42P01')).toBe(
      'relation "dossiers" does not exist, code 42P01',
    );
  });
});

describe('masquerDonneesPersonnelles — par nom de clé', () => {
  it('masque les clés sensibles à tout niveau, casse et accents ignorés', () => {
    const sortie = masquerDonneesPersonnelles({
      Email: 'a',
      extra: { telephone: '1', Prénom: 'x', nom: 'y', liste: [{ latitude: 36.7, lon: 3.1 }] },
      password: 'p',
      token: 't',
      jeton: 'j',
      cookie: 'c',
      authorization: 'z',
      lat: 1,
      longitude: 2,
      garde: 'ok',
    });
    expect(sortie).toEqual({
      Email: MASQUE,
      extra: {
        telephone: MASQUE,
        Prénom: MASQUE,
        nom: MASQUE,
        liste: [{ latitude: MASQUE, lon: MASQUE }],
      },
      password: MASQUE,
      token: MASQUE,
      jeton: MASQUE,
      cookie: MASQUE,
      authorization: MASQUE,
      lat: MASQUE,
      longitude: MASQUE,
      garde: 'ok',
    });
  });
});

describe('masquerDonneesPersonnelles — structure', () => {
  it('ne mute pas l’entrée', () => {
    const entree = { email: 'a@b.fr', imbrique: { texte: 'a@b.fr' } };
    const copie = structuredClone(entree);
    const sortie = masquerDonneesPersonnelles(entree);
    expect(entree).toEqual(copie);
    expect(sortie).not.toBe(entree);
  });

  it('gère les références circulaires et les primitives', () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    const sortie = masquerDonneesPersonnelles(a);
    expect((sortie.self as unknown) === sortie).toBe(true);
    expect(masquerDonneesPersonnelles(null)).toBeNull();
    expect(masquerDonneesPersonnelles(3)).toBe(3);
  });

  it('masque le message d’une Error en gardant son type', () => {
    const sortie = masquerDonneesPersonnelles(new TypeError('échec pour a@b.fr'));
    expect(sortie).toBeInstanceOf(TypeError);
    expect(sortie.message).toBe(`échec pour ${MASQUE}`);
  });
});

describe('masquerDonneesPersonnelles — robustesse', () => {
  it('masque les clés composées, avec séparateurs ou accents', () => {
    const sortie = masquerDonneesPersonnelles({
      access_token: 'a',
      'client-secret': 'b',
      session_id: 'c',
      phone: 'd',
      name: 'e',
      adresse: 'f',
      ip_address: 'g',
      mot_de_passe: 'h',
      userEmail: 'i',
      Prénom: 'j',
      date_naissance: 'k',
    });
    for (const valeur of Object.values(sortie)) {
      expect(valeur).toBe(MASQUE);
    }
  });

  it('laisse intactes les clés légitimes', () => {
    const entree = { module: 'chrono', event_id: 'abc', level: 'error', filename: 'x.ts' };
    expect(masquerDonneesPersonnelles(entree)).toEqual(entree);
  });

  it('ne mord pas un identifiant hexadécimal de 32 caractères', () => {
    const id = '0555123456abcdef0555123456abcdef';
    expect(masquerDonneesPersonnelles(id)).toBe(id);
    expect(masquerDonneesPersonnelles(`event ${'a0555123456'}b`)).toBe('event a0555123456b');
  });

  it('traite 100 000 caractères sans @ en temps borné et sans les altérer', () => {
    const long = 'a'.repeat(100_000);
    const debut = Date.now();
    expect(masquerDonneesPersonnelles(long)).toBe(long);
    expect(Date.now() - debut).toBeLessThan(2_000);
  });
});
