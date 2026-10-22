import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PHOTOS_DIR = fileURLToPath(
  new URL('../../public/charte/photos-2026', import.meta.url),
);

const PHOTOS = [
  'aitaissi-2026-celebration-montagne',
  'aitaissi-2026-ligne-depart',
  'aitaissi-2026-arrivee-groupe-medailles',
];

function chemin(nom: string, largeur: number): string {
  return `${PHOTOS_DIR}/${nom}-${largeur}.webp`;
}

/** Lit la taille canvas réelle dans l'en-tête WebP (VP8X, VP8 ou VP8L). */
function lireTaillesWebP(tampon: Buffer): { largeur: number; hauteur: number } {
  if (tampon.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error('en-tête RIFF absent');
  }
  if (tampon.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('signature WEBP absente');
  }
  const format = tampon.subarray(12, 16).toString('ascii');
  if (format === 'VP8X') {
    return {
      largeur: 1 + tampon.readUIntLE(24, 3),
      hauteur: 1 + tampon.readUIntLE(27, 3),
    };
  }
  if (format === 'VP8 ') {
    return {
      largeur: tampon.readUInt16LE(26),
      hauteur: tampon.readUInt16LE(28),
    };
  }
  if (format === 'VP8L') {
    const bits = tampon.readUInt32LE(21);
    return {
      largeur: 1 + (bits & 0x3fff),
      hauteur: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  throw new Error(`chunk WebP inattendu : ${JSON.stringify(format)}`);
}

describe('photos 2026 — assets WebP 640/1280', () => {
  it('répertoire réel : 3 photos max, aucun fichier « enfants », aucun fichier étranger', () => {
    expect(existsSync(PHOTOS_DIR)).toBe(true);
    const fichiers = readdirSync(PHOTOS_DIR).sort();
    expect(fichiers.join(' ')).not.toMatch(/enfants/i);
    expect(fichiers).toEqual(
      PHOTOS.flatMap((nom) => [`${nom}-1280.webp`, `${nom}-640.webp`]).sort(),
    );
  });

  for (const nom of PHOTOS) {
    describe(nom, () => {
      for (const largeurAttendue of [640, 1280]) {
        it(`${largeurAttendue} : présent, WebP valide, taille déclarée == taille fichier`, () => {
          const fichier = chemin(nom, largeurAttendue);
          expect(existsSync(fichier)).toBe(true);
          const tampon = readFileSync(fichier);
          expect(tampon.subarray(0, 4).toString('ascii')).toBe('RIFF');
          expect(tampon.subarray(8, 12).toString('ascii')).toBe('WEBP');
          expect(tampon.readUInt32LE(4) + 8).toBe(statSync(fichier).size);
        });

        it(`${largeurAttendue} : largeur canvas réelle lue dans l’en-tête`, () => {
          const tailles = lireTaillesWebP(readFileSync(chemin(nom, largeurAttendue)));
          expect(tailles.largeur).toBe(largeurAttendue);
        });

        it(`${largeurAttendue} : hauteur canvas = 9/16 de la largeur (ratios cohérents)`, () => {
          const tailles = lireTaillesWebP(readFileSync(chemin(nom, largeurAttendue)));
          expect(tailles.hauteur).toBe((largeurAttendue * 9) / 16);
        });
      }

      it('640 ≤ 100 Ko', () => {
        expect(statSync(chemin(nom, 640)).size).toBeLessThanOrEqual(100 * 1024);
      });

      it('1280 ≤ 120 Ko', () => {
        expect(statSync(chemin(nom, 1280)).size).toBeLessThanOrEqual(120 * 1024);
      });
    });
  }
});
