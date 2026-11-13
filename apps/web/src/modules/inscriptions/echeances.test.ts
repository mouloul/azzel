import { describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';
import type { OutboxRow, OutboxStore } from '@/modules/notifications/outbox-store';

import { balayerEcheances, type DepsEcheances, type ProgressionEcheances } from './echeances';

// Balayage des échéances — logique unique partagée par la commande
// `inscriptions:echeances` et la route `GET /api/cron/echeances`. Stores
// stubbés : l'idempotence réelle (statut, index uniques partiels) est prouvée
// par les suites d'intégration du store (cycle-de-vie, inscriptions).

const MAINTENANT = new Date('2027-02-10T06:00:00.000Z');

function ligne(id: string, type: 'rappel_preuve' | 'inscription_expiree'): OutboxRow {
  return {
    id,
    organisationId: 'org-1',
    destinataire: `${id}@exemple.dz`,
    type,
    payload:
      type === 'rappel_preuve'
        ? { coureurId: id, prenom: 'Amel', limite: '2027-02-11T05:00:00.000Z', echeance: '2027-02-11T05:00:00.000Z' }
        : { coureurId: id, prenom: 'Amel', edition: 'Trail Azzel 2027', echeance: '2027-02-09T05:00:00.000Z' },
    statut: 'pending',
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    sentAt: null,
    createdAt: new Date('2027-02-10T05:59:00.000Z'),
  };
}

function depots(options: { rappels?: number; expirees?: number; emailsExpiration?: number; file?: OutboxRow[] } = {}) {
  const journal: string[] = [];
  const file = options.file ?? [];
  const inscriptions = {
    enfilerRappelsPreuve: vi.fn(async () => {
      journal.push('rappels');
      return options.rappels ?? 0;
    }),
    expirerInscriptionsEchues: vi.fn(async () => {
      journal.push('expirations');
      return { expirees: options.expirees ?? 0, emailsEnfiles: options.emailsExpiration ?? 0 };
    }),
  };
  const outbox = {
    listOrganisationIds: vi.fn(async () => {
      journal.push('envoi');
      return ['org-1'];
    }),
    listOutstanding: vi.fn(async (_org: string, limite: number) => file.slice(0, limite)),
    claimOutboxRow: vi.fn(async () => true),
    markOutboxSent: vi.fn(async () => undefined),
    markOutboxFailed: vi.fn(async () => undefined),
    countDeadLetters: vi.fn(async () => 0),
    insertRappelJ7: vi.fn(async () => true),
  } satisfies OutboxStore;
  const send = vi.fn(async () => undefined);
  const deps: DepsEcheances = { inscriptions, outbox, send };
  return { deps, inscriptions, outbox, send, journal };
}

describe('balayerEcheances', () => {
  it('rappels, PUIS expirations, PUIS file d’envoi — à la même date de référence', async () => {
    const { deps, inscriptions, journal } = depots();
    await balayerEcheances(deps, MAINTENANT);
    expect(journal).toEqual(['rappels', 'expirations', 'envoi']);
    expect(inscriptions.enfilerRappelsPreuve).toHaveBeenCalledWith(MAINTENANT);
    expect(inscriptions.expirerInscriptionsEchues).toHaveBeenCalledWith(MAINTENANT);
  });

  it('bilan complet : valeurs distinctes, la file déjà en attente comptée dans l’envoi', async () => {
    // 1 rappel, 4 expirées dont 2 avis (doublons absorbés), 2 emails déjà en
    // attente : 5 lignes dans la file, 1 en échec.
    const file = [
      ligne('attente-1', 'rappel_preuve'),
      ligne('attente-2', 'rappel_preuve'),
      ligne('r1', 'rappel_preuve'),
      ligne('e1', 'inscription_expiree'),
      ligne('e2', 'inscription_expiree'),
    ];
    const { deps, send } = depots({ rappels: 1, expirees: 4, emailsExpiration: 2, file });
    send.mockRejectedValueOnce(new Error('SMTP 421'));
    const bilan = await balayerEcheances(deps, MAINTENANT);
    expect(bilan).toEqual({
      rappels: 1,
      expirees: 4,
      emailsExpiration: 2,
      envoi: { processed: 5, sent: 4, failed: 1, storeError: null },
    });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('limite de la file : ce qui vient d’être enfilé PLUS la marge habituelle (20)', async () => {
    const { deps, outbox } = depots({ rappels: 4, emailsExpiration: 3 });
    await balayerEcheances(deps, MAINTENANT);
    expect(outbox.listOutstanding).toHaveBeenCalledWith('org-1', 27);
  });

  it('limite de la file plafonnée (500) même sur une vague d’échéances', async () => {
    const { deps, outbox } = depots({ rappels: 400, emailsExpiration: 300 });
    await balayerEcheances(deps, MAINTENANT);
    expect(outbox.listOutstanding).toHaveBeenCalledWith('org-1', 500);
  });

  it('plafond de l’appelant : borne la file, le reste attend le passage suivant', async () => {
    const file = Array.from({ length: 45 }, (_, i) => ligne(`e${i}`, 'inscription_expiree'));
    const { deps, outbox, send } = depots({ rappels: 5, expirees: 45, emailsExpiration: 40, file });
    const bilan = await balayerEcheances(deps, MAINTENANT, { plafondEnvoi: 30 });
    expect(outbox.listOutstanding).toHaveBeenCalledWith('org-1', 30);
    expect(bilan.envoi).toEqual({ processed: 30, sent: 30, failed: 0, storeError: null });
    expect(send).toHaveBeenCalledTimes(30);
  });

  it('plafond de l’appelant au-dessus du besoin : sans effet', async () => {
    const { deps, outbox } = depots({ rappels: 4, emailsExpiration: 3 });
    await balayerEcheances(deps, MAINTENANT, { plafondEnvoi: 30 });
    expect(outbox.listOutstanding).toHaveBeenCalledWith('org-1', 27);
  });

  it('progression : signalée après chaque étape, dans l’ordre, avec ses chiffres', async () => {
    const { deps } = depots({ rappels: 1, expirees: 4, emailsExpiration: 2 });
    const etapes: ProgressionEcheances[] = [];
    await balayerEcheances(deps, MAINTENANT, { progression: (e) => etapes.push(e) });
    expect(etapes).toEqual([
      { etape: 'rappels', rappels: 1 },
      { etape: 'expirations', expirees: 4, emailsExpiration: 2 },
      { etape: 'envoi', envoi: { processed: 0, sent: 0, failed: 0, storeError: null } },
    ]);
  });

  it('expirations en échec : les rappels déjà faits ont été signalés avant l’erreur', async () => {
    const { deps, inscriptions, outbox } = depots({ rappels: 3 });
    inscriptions.expirerInscriptionsEchues.mockRejectedValueOnce(new DbUnavailableError());
    const etapes: ProgressionEcheances[] = [];
    await expect(
      balayerEcheances(deps, MAINTENANT, { progression: (e) => etapes.push(e) }),
    ).rejects.toBeInstanceOf(DbUnavailableError);
    expect(etapes).toEqual([{ etape: 'rappels', rappels: 3 }]);
    expect(outbox.listOrganisationIds).not.toHaveBeenCalled();
  });

  it('base injoignable aux rappels : l’erreur remonte, rien d’autre n’est tenté', async () => {
    const { deps, inscriptions, outbox } = depots();
    inscriptions.enfilerRappelsPreuve.mockRejectedValueOnce(new DbUnavailableError());
    await expect(balayerEcheances(deps, MAINTENANT)).rejects.toBeInstanceOf(DbUnavailableError);
    expect(inscriptions.expirerInscriptionsEchues).not.toHaveBeenCalled();
    expect(outbox.listOrganisationIds).not.toHaveBeenCalled();
  });

  it('file injoignable : rapportée dans le bilan, jamais levée (rappels et expirations faits)', async () => {
    const { deps, outbox } = depots({ rappels: 1, expirees: 4, emailsExpiration: 2 });
    outbox.listOrganisationIds.mockRejectedValueOnce(new Error('connexion perdue'));
    const bilan = await balayerEcheances(deps, MAINTENANT);
    expect(bilan).toEqual({
      rappels: 1,
      expirees: 4,
      emailsExpiration: 2,
      envoi: { processed: 0, sent: 0, failed: 0, storeError: 'connexion perdue' },
    });
  });
});
