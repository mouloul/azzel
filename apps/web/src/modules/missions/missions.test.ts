import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import {
  LIBELLES_STATUT_INVITATION,
  validerLigne,
  statutInvitation,
  type LigneFichier,
} from './domain';
import {
  ImportFileInvalidError,
  ImportFileTooLargeError,
  VolontaireDejaActifError,
  VolontaireNotFoundError,
  toMissionsApiError,
} from './errors';
import {
  MAX_IMPORT_LINES,
  buildModeleXlsx,
  detecterSeparateur,
  extensionFichier,
  parseImportFile,
  parseLigneCsv,
} from './import-format';
import { importVolontaires } from './service';
import type { ImportLigneOutcome, MissionsStore } from './store';

// Story 3.1 — tests unitaires missions : parsing (xlsx/csv), validation ligne,
// doublons, limite 500. Les comportements base (transaction, RLS, invitations)
// vivent dans missions.integration.test.ts.

async function xlsx(rows: (string | number)[][]): Promise<Uint8Array> {
  const classeur = new Workbook();
  const feuille = classeur.addWorksheet('Volontaires');
  for (const row of rows) {
    feuille.addRow(row);
  }
  return new Uint8Array((await classeur.xlsx.writeBuffer()) as ArrayBuffer);
}

const enTete = ['Nom', 'Email', 'Téléphone'];

function ligne(overrides: Partial<LigneFichier> = {}): LigneFichier {
  return { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '', ...overrides };
}

describe('validerLigne — validation des colonnes (nom, email, téléphone facultatif)', () => {
  it('accepte une ligne complète et une ligne sans téléphone', () => {
    expect(validerLigne(ligne({ telephone: '+213 555 010 203' }))).toEqual({
      ok: true,
      valeur: { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '+213 555 010 203' },
    });
    expect(validerLigne(ligne())).toEqual({
      ok: true,
      valeur: { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: null },
    });
  });

  it('normalise l’email (trim + minuscules) et le nom (trim)', () => {
    const verdict = validerLigne(ligne({ nom: '  Kahina  ', email: ' Kahina@EXEMPLE.DZ ' }));
    expect(verdict.ok && verdict.valeur.email).toBe('kahina@exemple.dz');
    expect(verdict.ok && verdict.valeur.nom).toBe('Kahina');
  });

  it('rejette nom vide, email absent/malformé, téléphone invalide', () => {
    expect(validerLigne(ligne({ nom: '   ' }))).toMatchObject({ ok: false, raison: 'nom manquant' });
    expect(validerLigne(ligne({ nom: 'x'.repeat(121) }))).toMatchObject({
      ok: false,
      raison: expect.stringContaining('120'),
    });
    expect(validerLigne(ligne({ email: '' }))).toMatchObject({ ok: false, raison: 'email manquant' });
    expect(validerLigne(ligne({ email: 'pas-un-email' }))).toMatchObject({
      ok: false,
      raison: 'email invalide',
    });
    expect(validerLigne(ligne({ telephone: 'abc' }))).toMatchObject({
      ok: false,
      raison: 'téléphone invalide',
    });
  });
});

describe('statutInvitation — dérivation depuis l’outbox + expiration', () => {
  const base = { passwordSetAt: null, invitation: { consommeLe: null, expireLe: new Date('2030-01-01T00:00:00.000Z'), outboxStatut: 'pending' } };

  it('mot de passe posé ou invitation consommée → activé', () => {
    expect(statutInvitation({ ...base, passwordSetAt: new Date() })).toBe('active');
    expect(statutInvitation({ ...base, invitation: { ...base.invitation, consommeLe: new Date() } })).toBe('active');
  });

  it('expiration puis échec d’envoi puis envoyée puis en file', () => {
    const maintenant = new Date('2026-10-22T10:00:00.000Z');
    expect(statutInvitation({ ...base, invitation: { ...base.invitation, expireLe: maintenant }, maintenant })).toBe('expiree');
    expect(statutInvitation({ ...base, invitation: { ...base.invitation, outboxStatut: 'failed' } })).toBe('echec');
    expect(statutInvitation({ ...base, invitation: { ...base.invitation, outboxStatut: 'sent' } })).toBe('envoyee');
    expect(statutInvitation(base)).toBe('en_file');
    expect(statutInvitation({ ...base, invitation: null })).toBe('aucune');
  });

  it('chaque statut a un libellé affichable', () => {
    for (const libelle of Object.values(LIBELLES_STATUT_INVITATION)) {
      expect(libelle.length).toBeGreaterThan(0);
    }
  });
});

describe('parseImportFile — csv (séparateurs ; et ,) et xlsx', () => {
  it('csv point-virgule avec en-tête : en-tête ignoré, lignes numérotées dans le fichier', async () => {
    const csv = 'Nom;Email;Téléphone\nKahina;kahina@exemple.dz;+213 555 010 203\n\nYani;yani@exemple.dz;\n';
    const lignes = await parseImportFile(new TextEncoder().encode(csv), 'volontaires.csv');
    expect(lignes).toEqual([
      { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '+213 555 010 203' },
      { ligne: 4, nom: 'Yani', email: 'yani@exemple.dz', telephone: '' },
    ]);
  });

  it('csv virgule sans en-tête : accepté, colonnes fixes nom/email/téléphone', async () => {
    const csv = 'Kahina,kahina@exemple.dz,\n';
    const lignes = await parseImportFile(new TextEncoder().encode(csv), 'v.csv');
    expect(lignes).toEqual([{ ligne: 1, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '' }]);
  });

  it('en-tête insensible à la casse (EMAIL) et guillemets CSV', async () => {
    const csv = '"nom","EMAIL","telephone"\n"Doe Jane",jane@exemple.dz,"+213 555"\n';
    const lignes = await parseImportFile(new TextEncoder().encode(csv), 'v.csv');
    expect(lignes).toEqual([{ ligne: 2, nom: 'Doe Jane', email: 'jane@exemple.dz', telephone: '+213 555' }]);
  });

  it('en-tête : au moins 2 cellules-clés exigées — une ligne de données « Nom ; … » reste une donnée', async () => {
    // Une seule cellule-clé ('nom') : ligne de DONNÉE, visible dans le rapport.
    const csv = 'Nom;kahina@exemple.dz;\n';
    const lignes = await parseImportFile(new TextEncoder().encode(csv), 'v.csv');
    expect(lignes).toEqual([{ ligne: 1, nom: 'Nom', email: 'kahina@exemple.dz', telephone: '' }]);
    // Deux cellules-clés ('nom', 'email') : en-tête, ignoré.
    const avecEnTete = await parseImportFile(
      new TextEncoder().encode('nom;email\nKahina;kahina@exemple.dz;\n'),
      'v.csv',
    );
    expect(avecEnTete).toEqual([{ ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '' }]);
  });

  it('CSV Windows-1252 (octet isolé 0xE9) : refus ImportFileInvalidError, pas de mojibake silencieux', async () => {
    const octets1252 = new Uint8Array([
      ...new TextEncoder().encode('Nom;Email;Téléphone\nKahina;kahina@exemple.dz;'),
      0xe9, // « é » en Windows-1252 : invalide en UTF-8
    ]);
    await expect(parseImportFile(octets1252, 'v.csv')).rejects.toBeInstanceOf(
      ImportFileInvalidError,
    );
    const apiError = toMissionsApiError(new ImportFileInvalidError());
    expect(apiError.envelope.error.action).toContain('UTF-8');
  });

  it('CSV UTF-8 accentué : noms préservés', async () => {
    const csv = 'Nom;Email\nCéline;celine@exemple.dz\n';
    const lignes = await parseImportFile(new TextEncoder().encode(csv), 'v.csv');
    expect(lignes[0]?.nom).toBe('Céline');
  });

  it('xlsx généré par exceljs : en-tête ignoré, numéros de ligne Excel conservés', async () => {
    const bytes = await xlsx([enTete, ['Kahina', 'kahina@exemple.dz', ''], [], ['Yani', 'yani@exemple.dz', '0555 010 203']]);
    const lignes = await parseImportFile(bytes, 'volontaires.xlsx');
    expect(lignes).toEqual([
      { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', telephone: '' },
      { ligne: 4, nom: 'Yani', email: 'yani@exemple.dz', telephone: '0555 010 203' },
    ]);
  });

  it('xlsx corrompu (extension .xlsx, contenu non zip) : ImportFileInvalidError', async () => {
    await expect(
      parseImportFile(new TextEncoder().encode('pas un zip'), 'v.xlsx'),
    ).rejects.toBeInstanceOf(ImportFileInvalidError);
  });

  it('extension inconnue ou fichier vide : ImportFileInvalidError', async () => {
    await expect(parseImportFile(new Uint8Array([1, 2]), 'v.docx')).rejects.toBeInstanceOf(
      ImportFileInvalidError,
    );
    await expect(parseImportFile(new Uint8Array(0), 'v.csv')).rejects.toBeInstanceOf(
      ImportFileInvalidError,
    );
  });

  it('csv sans aucune ligne de données (en-tête seul) : liste vide', async () => {
    const lignes = await parseImportFile(new TextEncoder().encode('Nom;Email;Téléphone\n'), 'v.csv');
    expect(lignes).toEqual([]);
  });

  it('détection de séparateur et parsing CSV unitaires', () => {
    expect(detecterSeparateur('a;b;c')).toBe(';');
    expect(detecterSeparateur('a,b,c')).toBe(',');
    expect(detecterSeparateur('"a;b",c')).toBe(',');
    expect(parseLigneCsv('"x""y";z', ';')).toEqual(['x"y', 'z']);
    expect(extensionFichier('VOLONTAIRES.XLSX')).toBe('xlsx');
  });

  it('gabarit .xlsx : se relit lui-même, en-tête reconnu → aucune ligne de données', async () => {
    const modele = await buildModeleXlsx();
    expect(modele.length).toBeGreaterThan(100);
    await expect(parseImportFile(modele, 'volontaires-modele.xlsx')).resolves.toEqual([]);
  });
});

describe('importVolontaires — service (store factice)', () => {
  const SESSION = {
    accountId: 'account-admin',
    organisationId: '00000000-0000-0000-0000-000000000001',
    email: 'organisateur@exemple.dz',
    role: 'organisateur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  } as const satisfies SessionRecord;

  function storeFactice(outcomes: ImportLigneOutcome[]): MissionsStore {
    return {
      importVolontaires: async () => outcomes,
      listVolontaires: async () => [],
      renvoyerInvitation: async () => {
        throw new VolontaireNotFoundError();
      },
    };
  }

  it('fichier 0 ligne de données : 400 enveloppe (vérifie le fichier)', async () => {
    const csv = 'Nom;Email;Téléphone\n';
    await expect(
      importVolontaires(SESSION as SessionRecord, {
        bytes: new TextEncoder().encode(csv),
        filename: 'v.csv',
      }),
    ).rejects.toBeInstanceOf(ImportFileInvalidError);
  });

  it('fichier vide (0 octet) : ImportFileInvalidError, pas le message « 2 Mo »', async () => {
    await expect(
      importVolontaires(SESSION as SessionRecord, {
        bytes: new Uint8Array(0),
        filename: 'v.csv',
      }),
    ).rejects.toBeInstanceOf(ImportFileInvalidError);
  });

  it('nominal : 3 créés, résumé exact, ordre des lignes du fichier conservé', async () => {
    const csv = 'Nom;Email;Téléphone\nA;a@exemple.dz;\nB;b@exemple.dz;0555 010 204\nC;c@exemple.dz;\n';
    const rapport = await importVolontaires(SESSION as SessionRecord, {
      bytes: new TextEncoder().encode(csv),
      filename: 'v.csv',
    }, { store: storeFactice([
      { ligne: 2, email: 'a@exemple.dz', statut: 'créé' },
      { ligne: 3, email: 'b@exemple.dz', statut: 'créé' },
      { ligne: 4, email: 'c@exemple.dz', statut: 'créé' },
    ]) });
    expect(rapport.resume).toEqual({ crees: 3, ignores: 0, rejetes: 0, invitationsEnFile: 3 });
    expect(rapport.lignes.map((l) => l.statut)).toEqual(['créé', 'créé', 'créé']);
  });

  it('doublon dans le fichier : première créé, deuxième rejetée avec la raison', async () => {
    const csv = 'Nom;Email\nA;a@exemple.dz\nA bis;a@exemple.dz\n';
    const rapport = await importVolontaires(SESSION as SessionRecord, {
      bytes: new TextEncoder().encode(csv),
      filename: 'v.csv',
    }, { store: storeFactice([{ ligne: 2, email: 'a@exemple.dz', statut: 'créé' }]) });
    expect(rapport.resume).toEqual({ crees: 1, ignores: 0, rejetes: 1, invitationsEnFile: 1 });
    expect(rapport.lignes[1]).toMatchObject({ ligne: 3, statut: 'rejeté', raison: 'doublon dans le fichier' });
  });

  it('lignes invalides rapportées, valides importées quand même', async () => {
    const csv = 'Nom;Email\n;b@exemple.dz\nA;a@exemple.dz\nC;pas-un-email\n';
    const rapport = await importVolontaires(SESSION as SessionRecord, {
      bytes: new TextEncoder().encode(csv),
      filename: 'v.csv',
    }, { store: storeFactice([{ ligne: 3, email: 'a@exemple.dz', statut: 'créé' }]) });
    expect(rapport.lignes).toEqual([
      { ligne: 2, nom: '', email: 'b@exemple.dz', statut: 'rejeté', raison: 'nom manquant' },
      { ligne: 3, nom: 'A', email: 'a@exemple.dz', statut: 'créé' },
      { ligne: 4, nom: 'C', email: 'pas-un-email', statut: 'rejeté', raison: 'email invalide' },
    ]);
  });

  it('décisions base (ignoré / rejeté autre rôle) fusionnées dans le rapport', async () => {
    const csv = 'Nom;Email\nA;a@exemple.dz\nB;b@exemple.dz\nC;c@exemple.dz\n';
    const rapport = await importVolontaires(SESSION as SessionRecord, {
      bytes: new TextEncoder().encode(csv),
      filename: 'v.csv',
    }, { store: storeFactice([
      { ligne: 2, email: 'a@exemple.dz', statut: 'créé' },
      { ligne: 3, email: 'b@exemple.dz', statut: 'ignoré', raison: 'déjà volontaire — invitation non renvoyée' },
      { ligne: 4, email: 'c@exemple.dz', statut: 'rejeté', raison: 'un compte coureur existe déjà' },
    ]) });
    expect(rapport.resume).toEqual({ crees: 1, ignores: 1, rejetes: 1, invitationsEnFile: 1 });
    expect(rapport.lignes[1]?.raison).toContain('déjà volontaire');
    expect(rapport.lignes[2]?.raison).toContain('coureur');
  });

  it('au-delà de 500 lignes : rejet ligne par ligne, les 500 premières traitées', async () => {
    const rows = [enTete.join(';')];
    const outcomes: ImportLigneOutcome[] = [];
    for (let index = 1; index <= MAX_IMPORT_LINES + 2; index += 1) {
      rows.push(`V${index};v${index}@exemple.dz;`);
      if (index <= MAX_IMPORT_LINES) {
        outcomes.push({ ligne: index + 1, email: `v${index}@exemple.dz`, statut: 'créé' });
      }
    }
    const rapport = await importVolontaires(SESSION as SessionRecord, {
      bytes: new TextEncoder().encode(rows.join('\n')),
      filename: 'v.csv',
    }, { store: storeFactice(outcomes) });
    expect(rapport.resume.crees).toBe(MAX_IMPORT_LINES);
    expect(rapport.resume.rejetes).toBe(2);
    expect(rapport.lignes.at(-1)?.raison).toContain('500');
  });

  it('fichier trop lourd : ImportFileTooLargeError → enveloppe 400 dédiée', async () => {
    await expect(
      importVolontaires(SESSION as SessionRecord, {
        bytes: new Uint8Array(2 * 1024 * 1024 + 1),
        filename: 'v.csv',
      }),
    ).rejects.toBeInstanceOf(ImportFileTooLargeError);
    const apiError = toMissionsApiError(new ImportFileTooLargeError(2 * 1024 * 1024));
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.error.code).toBe('admin.volontaires.import_trop_lourd');
  });

  it('enveloppes : introuvable 404, déjà actif 409, interne 500 sans détail', () => {
    expect(toMissionsApiError(new VolontaireNotFoundError()).status).toBe(404);
    expect(toMissionsApiError(new VolontaireDejaActifError()).status).toBe(409);
    const interne = toMissionsApiError(new Error('boom'));
    expect(interne.status).toBe(500);
    expect(interne.envelope.error.message).not.toContain('boom');
  });
});
