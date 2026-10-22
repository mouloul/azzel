// Story 3.3 — générateur d'icônes PWA volontaires, SANS dépendance :
// encodeur PNG maison (IHDR/IDAT/IEND via node:zlib, CRC32 à la main).
// Design volontairement simple : aplat vert Djurdjura (--az-action
// #345E4A des operationsTokens) + chevron sentier blanc — lisible en
// plein soleil, en petit et en masque Android.
// Sortie déterministe : mêmes entrées → mêmes octets (aucun Date/random).
// Régénérer : pnpm -F @azzel/web icons:generate

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vert Djurdjura — operationsTokens.colors.action (palette terrain).
const FOND = [0x34, 0x5e, 0x4a];
const BLANC = [0xff, 0xff, 0xff];

const ICONES = [
  { fichier: 'icon-192.png', taille: 192, echelle: 1 },
  { fichier: 'icon-512.png', taille: 512, echelle: 1 },
  // Maskable : contenu rabattu dans la zone de sécurité (80 % du canvas).
  { fichier: 'icon-maskable-512.png', taille: 512, echelle: 0.8 },
  { fichier: 'apple-touch-icon-180.png', taille: 180, echelle: 1 },
];

// ---------------------------------------------------------------------------
// PNG minimal : RGB 8 bits, filtre 0, un seul IDAT.
// ---------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(octets) {
  let crc = -1;
  for (const octet of octets) {
    crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function morceau(type, donnees) {
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([taille, corps, crc]);
}

function encoderPng(largeur, hauteur, pixels) {
  // pixels : Uint8Array RGB (3 octets/pixel), ligne par ligne.
  const brut = Buffer.alloc((largeur * 3 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (largeur * 3 + 1)] = 0; // filtre « None » sur chaque scanline
    Buffer.from(pixels.buffer, y * largeur * 3, largeur * 3).copy(
      brut,
      y * (largeur * 3 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0; // compression deflate
  ihdr[11] = 0; // filtrage adaptatif
  ihdr[12] = 0; // aucun entrelacement
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Chevron sentier : deux segments épais rejoignant un sommet haut, avec
// anti-aliasing par distance (couverture continue, déterministe).
// ---------------------------------------------------------------------------

function distanceSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const longueurCarree = dx * dx + dy * dy;
  let t = longueurCarree === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / longueurCarree;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function dessinerChevron(taille, echelle) {
  const pixels = new Uint8Array(taille * taille * 3);
  const centre = taille / 2;
  // Géométrie en fraction du canvas, rabattue par `echelle` (zone sûre maskable).
  const demiLargeur = 0.26 * echelle * taille;
  const hauteur = 0.2 * echelle * taille;
  const epaisseur = 0.14 * echelle * taille;
  const sommetY = centre - hauteur;
  const baseY = centre + hauteur;
  const demiEpaisseur = epaisseur / 2;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      // Échantillon au centre du pixel (+0,5) : géométrie stable à toute taille.
      const d = Math.min(
        distanceSegment(x + 0.5, y + 0.5, centre - demiLargeur, baseY, centre, sommetY),
        distanceSegment(x + 0.5, y + 0.5, centre, sommetY, centre + demiLargeur, baseY),
      );
      const couverture = Math.max(0, Math.min(1, demiEpaisseur - d + 0.5));
      const i = (y * taille + x) * 3;
      pixels[i] = Math.round(FOND[0] + (BLANC[0] - FOND[0]) * couverture);
      pixels[i + 1] = Math.round(FOND[1] + (BLANC[1] - FOND[1]) * couverture);
      pixels[i + 2] = Math.round(FOND[2] + (BLANC[2] - FOND[2]) * couverture);
    }
  }
  return pixels;
}

const racineWeb = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cible = path.join(racineWeb, 'public', 'volontaires');
mkdirSync(cible, { recursive: true });

for (const { fichier, taille, echelle } of ICONES) {
  const png = encoderPng(taille, taille, dessinerChevron(taille, echelle));
  writeFileSync(path.join(cible, fichier), png);
  console.info(`${fichier} : ${png.length} octets (${taille}x${taille})`);
}
