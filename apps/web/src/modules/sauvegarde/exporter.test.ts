import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';

import {
  ExportPreuvesError,
  MANIFESTE_FICHIER,
  PREUVES_SOUS_DOSSIER,
  ecrireExport,
  type Inventaire,
  type Manifeste,
} from './exporter';

// Story 12.2 — export des preuves : matrice I/O de la spec sur un vrai
// LocalDiskProofStore (fichiers sur disque), inventaire fourni en mémoire.
// La lecture SQL de l'inventaire est couverte par exporter.integration.test.ts.

function pdf(contenu: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${contenu}\n%%EOF\n`);
}

describe('sauvegarde — ecrireExport', () => {
  let racine: string;
  let store: LocalDiskProofStore;
  let dossier: string;

  beforeEach(async () => {
    racine = await mkdtemp(path.join(tmpdir(), 'azzel-export-'));
    store = new LocalDiskProofStore(path.join(racine, 'stockage'));
    dossier = path.join(racine, 'export');
  });

  afterEach(async () => {
    await rm(racine, { recursive: true, force: true });
  });

  function inventaire(preuves: Inventaire['preuves']): Inventaire {
    return {
      derniereMigration: '0045_delai_preuve_heures.sql',
      comptages: { coureur: 3, preuve: preuves.length },
      preuves,
    };
  }

  async function lireManifeste(): Promise<Manifeste> {
    return JSON.parse(await readFile(path.join(dossier, MANIFESTE_FICHIER), 'utf8')) as Manifeste;
  }

  async function manifesteAbsent(): Promise<boolean> {
    return stat(path.join(dossier, MANIFESTE_FICHIER)).then(
      () => false,
      () => true,
    );
  }

  it('nominal : chaque preuve est écrite sous sa clé, à l’octet près, et décrite au manifeste', async () => {
    const active = await store.put(pdf('active'), 'pdf');
    const remplacee = await store.put(pdf('remplacee'), 'pdf');
    const maintenant = new Date('2026-11-14T02:30:00.000Z');

    const manifeste = await ecrireExport(
      inventaire([
        { storageKey: remplacee.storageKey, sha256: remplacee.sha256, status: 'replaced' },
        { storageKey: active.storageKey, sha256: active.sha256, status: 'active' },
      ]),
      store,
      dossier,
      maintenant,
    );

    const fichiers = (await readdir(path.join(dossier, PREUVES_SOUS_DOSSIER))).sort();
    expect(fichiers).toEqual([active.storageKey, remplacee.storageKey].sort());
    const relue = await readFile(path.join(dossier, PREUVES_SOUS_DOSSIER, active.storageKey));
    expect(new Uint8Array(relue)).toEqual(pdf('active'));

    expect(manifeste).toEqual({
      version: 1,
      horodatage: '2026-11-14T02:30:00.000Z',
      derniereMigration: '0045_delai_preuve_heures.sql',
      comptages: { coureur: 3, preuve: 2 },
      preuves: [
        { cle: remplacee.storageKey, sha256: remplacee.sha256, statut: 'replaced' },
        { cle: active.storageKey, sha256: active.sha256, statut: 'active' },
      ],
      avertissements: [],
    });
    expect(await lireManifeste()).toEqual(manifeste);
  });

  it('preuve active manquante : export refusé, clé nommée, aucun manifeste', async () => {
    const cle = `${randomUUID()}.pdf`;
    const presente = await store.put(pdf('presente'), 'pdf');

    const echec = ecrireExport(
      inventaire([
        { storageKey: presente.storageKey, sha256: presente.sha256, status: 'active' },
        { storageKey: cle, sha256: 'a'.repeat(64), status: 'active' },
      ]),
      store,
      dossier,
    );

    await expect(echec).rejects.toBeInstanceOf(ExportPreuvesError);
    await expect(echec).rejects.toThrow(cle);
    expect(await manifesteAbsent()).toBe(true);
  });

  it('preuve remplacée manquante : avertissement au manifeste, l’export continue', async () => {
    const cle = `${randomUUID()}.jpg`;
    const active = await store.put(pdf('active'), 'pdf');

    const manifeste = await ecrireExport(
      inventaire([
        { storageKey: cle, sha256: 'b'.repeat(64), status: 'replaced' },
        { storageKey: active.storageKey, sha256: active.sha256, status: 'active' },
      ]),
      store,
      dossier,
    );

    expect(manifeste.avertissements).toEqual([`preuve replaced sans fichier : ${cle}`]);
    expect(manifeste.preuves.map((preuve) => preuve.cle)).toEqual([active.storageKey]);
    expect((await lireManifeste()).avertissements).toHaveLength(1);
  });

  it('preuve refusée manquante : traitée comme une preuve non active (avertissement)', async () => {
    const cle = `${randomUUID()}.png`;

    const manifeste = await ecrireExport(
      inventaire([{ storageKey: cle, sha256: 'c'.repeat(64), status: 'refusée' }]),
      store,
      dossier,
    );

    expect(manifeste.avertissements).toEqual([`preuve refusée sans fichier : ${cle}`]);
  });

  it('sha256 divergent : export refusé, clé nommée, aucun manifeste', async () => {
    const preuve = await store.put(pdf('octets'), 'pdf');

    const echec = ecrireExport(
      inventaire([{ storageKey: preuve.storageKey, sha256: 'd'.repeat(64), status: 'replaced' }]),
      store,
      dossier,
    );

    await expect(echec).rejects.toBeInstanceOf(ExportPreuvesError);
    await expect(echec).rejects.toThrow(`sha256 divergent pour la preuve replaced : ${preuve.storageKey}`);
    expect(await manifesteAbsent()).toBe(true);
  });

  it('clé hors motif : jamais écrite hors du dossier, traitée comme un fichier absent', async () => {
    const cle = '../../evasion.pdf';

    const echec = ecrireExport(
      inventaire([{ storageKey: cle, sha256: 'e'.repeat(64), status: 'active' }]),
      store,
      dossier,
    );

    await expect(echec).rejects.toThrow(`preuve active sans fichier : ${cle}`);
    expect(await readdir(path.join(dossier, PREUVES_SOUS_DOSSIER))).toEqual([]);
    expect(await readdir(racine)).not.toContain('evasion.pdf');
  });

  it('aucune preuve : manifeste écrit avec une liste vide', async () => {
    const manifeste = await ecrireExport(inventaire([]), store, dossier);

    expect(manifeste.preuves).toEqual([]);
    expect(await readdir(path.join(dossier, PREUVES_SOUS_DOSSIER))).toEqual([]);
    expect(await manifesteAbsent()).toBe(false);
  });
});
