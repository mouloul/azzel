import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Story 3.3 — les icônes PWA sont commitées (le générateur
// scripts/gen-pwa-icons.mjs ne sert qu'à la régénération) : ce test protège
// les fichiers DU DÉPÔT — signature PNG, dimensions IHDR, fond vert
// Djurdjura et chevron blanc — plus manifeste et service worker présents.

const DOSSIER_PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public',
);
const DOSSIER_VOLONTAIRES = path.join(DOSSIER_PUBLIC, 'volontaires');

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngDecodé {
  largeur: number;
  hauteur: number;
  profondeur: number;
  typeCouleur: number;
  scanlines: Buffer;
}

function decoderPng(fichier: string): PngDecodé {
  const octets = readFileSync(path.join(DOSSIER_VOLONTAIRES, fichier));
  expect(octets.subarray(0, 8).equals(SIGNATURE_PNG)).toBe(true);
  let offset = 8;
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset < octets.length) {
    const taille = octets.readUInt32BE(offset);
    const type = octets.subarray(offset + 4, offset + 8).toString('ascii');
    const donnees = octets.subarray(offset + 8, offset + 8 + taille);
    if (type === 'IHDR') {
      ihdr = donnees;
    } else if (type === 'IDAT') {
      idat.push(donnees);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + taille;
  }
  if (ihdr === null || ihdr.length !== 13) {
    throw new Error(`${fichier} : IHDR absent ou malformé`);
  }
  return {
    largeur: ihdr.readUInt32BE(0),
    hauteur: ihdr.readUInt32BE(4),
    profondeur: ihdr[8] ?? -1,
    typeCouleur: ihdr[9] ?? -1,
    scanlines: inflateSync(Buffer.concat(idat)),
  };
}

function pixel(png: PngDecodé, x: number, y: number): [number, number, number] {
  const debut = y * (png.largeur * 3 + 1) + 1 + x * 3;
  const canal = (index: number): number => {
    const valeur = png.scanlines[debut + index];
    if (valeur === undefined) {
      throw new Error(`pixel hors tampon (${x},${y})`);
    }
    return valeur;
  };
  return [canal(0), canal(1), canal(2)];
}

function filtreScanline(png: PngDecodé, y: number): number {
  const valeur = png.scanlines[y * (png.largeur * 3 + 1)];
  if (valeur === undefined) {
    throw new Error(`scanline hors tampon (${y})`);
  }
  return valeur;
}

function compterBlancs(png: PngDecodé): number {
  let blancs = 0;
  for (let y = 0; y < png.hauteur; y++) {
    // Filtre « None » sur chaque scanline (contrat de notre encodeur).
    expect(filtreScanline(png, y)).toBe(0);
    for (let x = 0; x < png.largeur; x++) {
      const [r, g, b] = pixel(png, x, y);
      if (r > 200 && g > 200 && b > 200) {
        blancs += 1;
      }
    }
  }
  return blancs;
}

const FOND_DJURDJURA: [number, number, number] = [0x34, 0x5e, 0x4a];

describe('icônes PWA commitées (public/volontaires)', () => {
  const CAS: Array<{ fichier: string; taille: number }> = [
    { fichier: 'icon-192.png', taille: 192 },
    { fichier: 'icon-512.png', taille: 512 },
    { fichier: 'icon-maskable-512.png', taille: 512 },
    { fichier: 'apple-touch-icon-180.png', taille: 180 },
  ];

  it('signature PNG, dimensions exactes, RGB 8 bits sans alpha', () => {
    for (const { fichier, taille } of CAS) {
      const png = decoderPng(fichier);
      expect(png.largeur, fichier).toBe(taille);
      expect(png.hauteur, fichier).toBe(taille);
      expect(png.profondeur, fichier).toBe(8);
      expect(png.typeCouleur, fichier).toBe(2);
    }
  });

  it('aplat vert Djurdjura (#345E4A) en fond, chevron blanc dessiné', () => {
    for (const { fichier, taille } of CAS) {
      const png = decoderPng(fichier);
      expect(pixel(png, 0, 0), fichier).toEqual(FOND_DJURDJURA);
      expect(pixel(png, taille - 1, taille - 1), fichier).toEqual(FOND_DJURDJURA);
      expect(compterBlancs(png), fichier).toBeGreaterThan(taille);
    }
  });

  it('maskable : contenu rabattu dans la zone de sécurité (moins de blanc)', () => {
    const normale = decoderPng('icon-512.png');
    const maskable = decoderPng('icon-maskable-512.png');
    expect(compterBlancs(maskable)).toBeLessThan(compterBlancs(normale));
  });
});

describe('manifeste et service worker commités', () => {
  it('manifeste : standalone, start_url /volontaires, scope /volontaires, icônes présentes', () => {
    const manifeste = JSON.parse(
      readFileSync(path.join(DOSSIER_VOLONTAIRES, 'manifest.webmanifest'), 'utf8'),
    ) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifeste.name).toBe('Azzel Volontaires');
    expect(manifeste.start_url).toBe('/volontaires');
    expect(manifeste.scope).toBe('/volontaires');
    expect(manifeste.display).toBe('standalone');
    expect(manifeste.icons.some((icone) => icone.purpose === 'maskable')).toBe(true);
    for (const icone of manifeste.icons) {
      expect(() => readFileSync(path.join(DOSSIER_PUBLIC, icone.src.slice(1)))).not.toThrow();
    }
  });

  // Liens manifest / apple-touch-icon du layout : vérifiés sur le RENDU du
  // layout (layout.test.tsx), pas ici.

  it('service worker : présent, précache /volontaires, intercepte l’état et rien d’autre', () => {
    const sw = readFileSync(path.join(DOSSIER_PUBLIC, 'sw-volontaires.js'), 'utf8');
    expect(sw).toContain("'/volontaires'");
    expect(sw).toContain("'/api/volontaires/etat'");
    expect(sw).toContain('/_next/static/');
    // Aucune interception de la vitrine/admin/coureur : les routes admises
    // sont nommées explicitement.
    expect(sw).not.toContain("'*'");
  });
});
