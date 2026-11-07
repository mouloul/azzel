import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import {
  FAMILLE_SCAN,
  LIBELLES_STATUT_INVITATION,
  MISSION_TYPES,
  MAX_EMAIL_LENGTH,
  MAX_NOM_LENGTH,
  hasVolontaireFieldErrors,
  normalizeVolontaireInput,
  validateVolontaireInput,
  validerLigne,
  statutInvitation,
  type LigneFichier,
} from './domain';
import {
  ImportFileInvalidError,
  ImportFileTooLargeError,
  InvalidVolontaireFieldsError,
  VolontaireAffecteError,
  VolontaireDejaActifError,
  VolontaireEmailPrisError,
  VolontaireEmailReserveError,
  VolontaireLieError,
  VolontaireNotFoundError,
  toMissionsApiError,
} from './errors';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LIBELLE,
  MAX_IMPORT_LINES,
  buildModeleXlsx,
  detecterSeparateur,
  extensionFichier,
  parseImportFile,
  parseLigneCsv,
} from './import-format';
import { deleteVolontaire, importVolontaires, updateVolontaire } from './service';
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

describe('statutInvitation — dérivation depuis activated_at + outbox (plus d’expiration)', () => {
  it('première connexion faite (activated_at) → activé, quel que soit le statut outbox', () => {
    for (const outboxStatut of [null, 'pending', 'sent', 'failed', 'cancelled']) {
      expect(statutInvitation({ activatedAt: new Date(), outboxStatut })).toBe('active');
    }
  });

  it('priorité active › aucune › echec › envoyee › en_file', () => {
    expect(statutInvitation({ activatedAt: null, outboxStatut: null })).toBe('aucune');
    expect(statutInvitation({ activatedAt: null, outboxStatut: 'cancelled' })).toBe('aucune');
    expect(statutInvitation({ activatedAt: null, outboxStatut: 'failed' })).toBe('echec');
    expect(statutInvitation({ activatedAt: null, outboxStatut: 'sent' })).toBe('envoyee');
    expect(statutInvitation({ activatedAt: null, outboxStatut: 'pending' })).toBe('en_file');
    expect(statutInvitation({ activatedAt: null, outboxStatut: 'sending' })).toBe('en_file');
  });

  it('libellés : plus de statut « Expirée », « À renvoyer » et « Activé » présents', () => {
    expect(Object.keys(LIBELLES_STATUT_INVITATION).sort()).toEqual(
      ['active', 'aucune', 'echec', 'en_file', 'envoyee'],
    );
    expect(LIBELLES_STATUT_INVITATION.aucune).toBe('À renvoyer');
    expect(LIBELLES_STATUT_INVITATION.active).toBe('Activé');
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

  it('gabarit .xlsx : colonne Téléphone au format texte (numFmt « @ ») — le 0 de tête survit', async () => {
    const classeur = new Workbook();
    await classeur.xlsx.load((await buildModeleXlsx()).buffer as ArrayBuffer);
    const feuille = classeur.worksheets[0];
    expect(feuille?.getColumn(3).numFmt).toBe('@');
    expect(feuille?.getColumn(1).numFmt).toBeUndefined();
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
    const indisponible = (): never => {
      throw new Error('store factice : méthode missions 3.2 non appelée ici');
    };
    return {
      importVolontaires: async () => outcomes,
      listVolontaires: async () => [],
      renvoyerInvitation: async () => {
        throw new VolontaireNotFoundError();
      },
      updateVolontaire: indisponible,
      deleteVolontaire: indisponible,
      findCurrentEdition: indisponible,
      createSecteur: indisponible,
      updateSecteur: indisponible,
      deleteSecteur: indisponible,
      createMission: indisponible,
      updateMission: indisponible,
      deleteMission: indisponible,
      listMissionsEtat: indisponible,
      findVolontaireIdByAccount: indisponible,
      affecter: indisponible,
      desaffecter: indisponible,
      listCoureursAnnuaire: indisponible,
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

  it('email AZZEL_ADMIN_EMAILS : ligne rejetée « adresse réservée à l’organisation », jamais transmise au store', async () => {
    const precedent = process.env.AZZEL_ADMIN_EMAILS;
    process.env.AZZEL_ADMIN_EMAILS = 'Boss@Exemple.dz, autre@exemple.dz';
    try {
      const recues: string[] = [];
      const store = storeFactice([{ ligne: 2, email: 'a@exemple.dz', statut: 'créé' }]);
      store.importVolontaires = async (input) => {
        recues.push(...input.lignes.map((ligne) => ligne.email));
        return [{ ligne: 2, email: 'a@exemple.dz', statut: 'créé' }];
      };
      const csv = 'Nom;Email\nA;a@exemple.dz\nBoss;boss@exemple.dz\n';
      const rapport = await importVolontaires(SESSION as SessionRecord, {
        bytes: new TextEncoder().encode(csv),
        filename: 'v.csv',
      }, { store });
      expect(recues).toEqual(['a@exemple.dz']);
      expect(rapport.lignes[1]).toMatchObject({
        ligne: 3,
        email: 'boss@exemple.dz',
        statut: 'rejeté',
        raison: "adresse réservée à l'organisation",
      });
      expect(rapport.resume).toEqual({ crees: 1, ignores: 0, rejetes: 1, invitationsEnFile: 1 });
    } finally {
      if (precedent === undefined) {
        delete process.env.AZZEL_ADMIN_EMAILS;
      } else {
        process.env.AZZEL_ADMIN_EMAILS = precedent;
      }
    }
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
    // Borne dérivée de MAX_IMPORT_BYTES, jamais codée en dur.
    expect(MAX_IMPORT_LIBELLE).toBe(`${MAX_IMPORT_BYTES / (1024 * 1024)} Mo`);
    expect(apiError.envelope.error.message).toContain(`(${MAX_IMPORT_LIBELLE})`);
  });

  it('enveloppes : introuvable 404, déjà actif 409, interne 500 sans détail', () => {
    expect(toMissionsApiError(new VolontaireNotFoundError()).status).toBe(404);
    expect(toMissionsApiError(new VolontaireDejaActifError()).status).toBe(409);
    const interne = toMissionsApiError(new Error('boom'));
    expect(interne.status).toBe(500);
    expect(interne.envelope.error.message).not.toContain('boom');
  });
});

// Story 3.5 — correction et suppression d'un volontaire. Ici : validation des
// champs, gardes de service (UUID, adresse réservée) et enveloppes d'erreur.
// Les écritures (compte, invitation, codes en vol, cascade) vivent dans
// missions.integration.test.ts.

describe('normalizeVolontaireInput / validateVolontaireInput — champs du formulaire', () => {
  it('normalise : nom trim, email trim + minuscules, téléphone vide → null', () => {
    expect(
      normalizeVolontaireInput({
        nom: '  Kahina Ait  ',
        email: ' Kahina@EXEMPLE.DZ ',
        telephone: '   ',
      }),
    ).toEqual({ nom: 'Kahina Ait', email: 'kahina@exemple.dz', telephone: null });
  });

  it('champs non-chaîne : traités comme absents, jamais de coercition', () => {
    expect(normalizeVolontaireInput({ nom: 42, email: null, telephone: {} })).toEqual({
      nom: '',
      email: '',
      telephone: null,
    });
  });

  it('accepte une saisie complète sans erreur', () => {
    const input = normalizeVolontaireInput({
      nom: 'Kahina Ait',
      email: 'kahina@exemple.dz',
      telephone: '+213 555 010 203',
    });
    expect(validateVolontaireInput(input)).toEqual({});
    expect(hasVolontaireFieldErrors(validateVolontaireInput(input))).toBe(false);
  });

  it('erreurs PAR CHAMP : nom vide/trop long, email absent/malformé/trop long, téléphone invalide', () => {
    const vide = validateVolontaireInput(normalizeVolontaireInput({}));
    expect(vide.nom).toBeTypeOf('string');
    expect(vide.email).toBeTypeOf('string');
    expect(vide.telephone).toBeUndefined();

    expect(
      validateVolontaireInput(
        normalizeVolontaireInput({ nom: 'x'.repeat(MAX_NOM_LENGTH + 1), email: 'a@b.dz' }),
      ).nom,
    ).toContain(String(MAX_NOM_LENGTH));
    expect(
      validateVolontaireInput(normalizeVolontaireInput({ nom: 'A', email: 'pas-un-email' })).email,
    ).toBeTypeOf('string');
    const trop = `${'a'.repeat(MAX_EMAIL_LENGTH)}@exemple.dz`;
    expect(
      validateVolontaireInput(normalizeVolontaireInput({ nom: 'A', email: trop })).email,
    ).toBeTypeOf('string');
    expect(
      validateVolontaireInput(
        normalizeVolontaireInput({ nom: 'A', email: 'a@b.dz', telephone: 'abc' }),
      ).telephone,
    ).toBeTypeOf('string');
  });
});

describe('updateVolontaire / deleteVolontaire — gardes de service (store factice)', () => {
  const SESSION = {
    accountId: 'account-admin',
    organisationId: '00000000-0000-0000-0000-000000000001',
    email: 'organisateur@exemple.dz',
    role: 'organisateur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  } as const satisfies SessionRecord;

  const ID = '11111111-1111-1111-1111-111111111111';

  const SAISIE = { nom: 'Kahina Ait', email: 'kahina@exemple.dz', telephone: null };

  function storeEspion(overrides: Partial<MissionsStore> = {}): {
    store: MissionsStore;
    appels: string[];
  } {
    const appels: string[] = [];
    const indisponible = (): never => {
      throw new Error('store espion : méthode non attendue ici');
    };
    const store: MissionsStore = {
      importVolontaires: indisponible,
      listVolontaires: async () => [],
      renvoyerInvitation: indisponible,
      updateVolontaire: async (volontaireId) => {
        appels.push(`update:${volontaireId}`);
        return {
          volontaire: {
            id: volontaireId,
            nom: SAISIE.nom,
            email: SAISIE.email,
            telephone: null,
            statutInvitation: 'en_file',
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
          },
          invitationRenvoyee: true,
        };
      },
      deleteVolontaire: async (volontaireId) => {
        appels.push(`delete:${volontaireId}`);
        return true;
      },
      findCurrentEdition: indisponible,
      createSecteur: indisponible,
      updateSecteur: indisponible,
      deleteSecteur: indisponible,
      createMission: indisponible,
      updateMission: indisponible,
      deleteMission: indisponible,
      listMissionsEtat: indisponible,
      findVolontaireIdByAccount: indisponible,
      affecter: indisponible,
      desaffecter: indisponible,
      listCoureursAnnuaire: indisponible,
      ...overrides,
    };
    return { store, appels };
  }

  it('id non-UUID : VolontaireNotFoundError AVANT tout appel au store (jamais une 22P02)', async () => {
    const { store, appels } = storeEspion();
    await expect(
      updateVolontaire(SESSION as SessionRecord, 'pas-un-uuid', SAISIE, { store }),
    ).rejects.toBeInstanceOf(VolontaireNotFoundError);
    await expect(
      deleteVolontaire(SESSION as SessionRecord, 'pas-un-uuid', { store }),
    ).rejects.toBeInstanceOf(VolontaireNotFoundError);
    expect(appels).toEqual([]);
  });

  it('champs invalides : InvalidVolontaireFieldsError par champ, store non appelé', async () => {
    const { store, appels } = storeEspion();
    const erreur = await updateVolontaire(SESSION as SessionRecord, ID, { nom: '', email: 'x' }, {
      store,
    }).catch((error: unknown) => error);
    expect(erreur).toBeInstanceOf(InvalidVolontaireFieldsError);
    expect((erreur as InvalidVolontaireFieldsError).fields.nom).toBeTypeOf('string');
    expect((erreur as InvalidVolontaireFieldsError).fields.email).toBeTypeOf('string');
    expect(appels).toEqual([]);
  });

  it('adresse AZZEL_ADMIN_EMAILS : refus explicite, store non appelé (même règle qu’à l’import)', async () => {
    const precedent = process.env.AZZEL_ADMIN_EMAILS;
    process.env.AZZEL_ADMIN_EMAILS = 'Boss@Exemple.dz';
    try {
      const { store, appels } = storeEspion();
      await expect(
        updateVolontaire(
          SESSION as SessionRecord,
          ID,
          { nom: 'Boss', email: 'BOSS@exemple.dz', telephone: null },
          { store },
        ),
      ).rejects.toBeInstanceOf(VolontaireEmailReserveError);
      expect(appels).toEqual([]);
    } finally {
      if (precedent === undefined) {
        delete process.env.AZZEL_ADMIN_EMAILS;
      } else {
        process.env.AZZEL_ADMIN_EMAILS = precedent;
      }
    }
  });

  it('nominal : l’id et la saisie normalisée descendent au store, le renvoi d’invitation remonte', async () => {
    const recues: unknown[] = [];
    const { store } = storeEspion({
      updateVolontaire: async (volontaireId, input) => {
        recues.push({ volontaireId, input });
        return {
          volontaire: {
            id: volontaireId,
            nom: 'Kahina Ait',
            email: 'kahina@exemple.dz',
            telephone: null,
            statutInvitation: 'en_file',
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
          },
          invitationRenvoyee: true,
        };
      },
    });
    const resultat = await updateVolontaire(
      SESSION as SessionRecord,
      ID,
      { nom: '  Kahina Ait ', email: ' Kahina@Exemple.DZ ', telephone: '' },
      { store },
    );
    expect(recues).toEqual([
      {
        volontaireId: ID,
        input: {
          organisationId: SESSION.organisationId,
          nom: 'Kahina Ait',
          email: 'kahina@exemple.dz',
          telephone: null,
        },
      },
    ]);
    expect(resultat.invitationRenvoyee).toBe(true);
    expect(resultat.volontaire).toMatchObject({
      email: 'kahina@exemple.dz',
      statutInvitation: 'en_file',
      statutInvitationLabel: LIBELLES_STATUT_INVITATION.en_file,
    });
  });

  it('volontaire absent du store : 404 métier (null → VolontaireNotFoundError)', async () => {
    const { store } = storeEspion({
      updateVolontaire: async () => null,
      deleteVolontaire: async () => false,
    });
    await expect(
      updateVolontaire(SESSION as SessionRecord, ID, SAISIE, { store }),
    ).rejects.toBeInstanceOf(VolontaireNotFoundError);
    await expect(
      deleteVolontaire(SESSION as SessionRecord, ID, { store }),
    ).rejects.toBeInstanceOf(VolontaireNotFoundError);
  });

  it('suppression nominale : l’organisation de la session borne l’appel', async () => {
    const recues: unknown[] = [];
    const { store } = storeEspion({
      deleteVolontaire: async (volontaireId, organisationId) => {
        recues.push({ volontaireId, organisationId });
        return true;
      },
    });
    await expect(deleteVolontaire(SESSION as SessionRecord, ID, { store })).resolves.toEqual({
      ok: true,
    });
    expect(recues).toEqual([{ volontaireId: ID, organisationId: SESSION.organisationId }]);
  });

  it('enveloppes API : champs 400, adresse prise 409 champ email, réservée 409, affecté 409 chiffré, lié 409', () => {
    const champs = toMissionsApiError(
      new InvalidVolontaireFieldsError({ nom: 'Le nom est obligatoire.' }),
    );
    expect(champs.status).toBe(400);
    expect(champs.envelope.error.code).toBe('admin.volontaires.champs_invalides');
    expect(champs.fields).toEqual({ nom: 'Le nom est obligatoire.' });

    const pris = toMissionsApiError(new VolontaireEmailPrisError());
    expect(pris.status).toBe(409);
    expect(pris.envelope.error.code).toBe('admin.volontaires.email_pris');
    expect((pris.fields as { email?: string }).email).toBeTypeOf('string');
    // Aucune énumération de comptes : le message ne dit PAS à qui l'adresse est.
    for (const mot of ['coureur', 'organisateur', 'volontaire']) {
      expect(pris.envelope.error.message.toLowerCase()).not.toContain(mot);
    }

    const reserve = toMissionsApiError(new VolontaireEmailReserveError());
    expect(reserve.status).toBe(409);
    expect(reserve.envelope.error.code).toBe('admin.volontaires.email_reserve');
    expect((reserve.fields as { email?: string }).email).toBeTypeOf('string');

    const affecte = toMissionsApiError(new VolontaireAffecteError(3));
    expect(affecte.status).toBe(409);
    expect(affecte.envelope.error.code).toBe('admin.volontaires.affecte');
    expect(affecte.envelope.error.message).toContain('3');
    expect(affecte.envelope.error.action).toContain('mission');

    const lie = toMissionsApiError(new VolontaireLieError());
    expect(lie.status).toBe(409);
    expect(lie.envelope.error.code).toBe('admin.volontaires.lie');
  });
});

// Story 4.6 — le regroupement des types par scanner, posé une fois dans le
// domaine : avant, chaque résolveur testait l'égalité de type de son côté et
// rien ne reliait les deux.

describe('FAMILLE_SCAN — quel type ouvre quel scanner', () => {
  it('couvre les SIX types, sans exception', () => {
    expect(Object.keys(FAMILLE_SCAN).sort()).toEqual([...MISSION_TYPES].sort());
  });

  it('un seul type par famille de scan, le reste n’ouvre aucun scanner', () => {
    expect(FAMILLE_SCAN.scan_checkpoint).toBe('chrono');
    expect(FAMILLE_SCAN.distribution_dossards).toBe('retrait');
    const sansScanner = MISSION_TYPES.filter((type) => FAMILLE_SCAN[type] === null);
    expect(sansScanner).toEqual([
      'accueil',
      'securite_troncon',
      'securite_arrivee',
      'communication',
    ]);
  });
});
