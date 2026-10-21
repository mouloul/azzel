import { vi } from 'vitest';

// Worker factieux silencieux : processOutbox ne touche ni la base ni le SMTP.
// Utilisé via vi.mock dans les tests qui exercent les services SANS vouloir
// déclencher le vrai worker (intégrations Postgres, unitaires service).
//
//   vi.mock('@/modules/notifications/worker', async () => {
//     const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
//     return createSilentOutboxWorker();
//   });
//
// Poignée d'assertions : importer processOutbox depuis le module moqué puis
// vi.mocked(processOutbox).
export function createSilentOutboxWorker() {
  return {
    processOutbox: vi.fn(
      async (): Promise<{
        processed: number;
        sent: number;
        failed: number;
        storeError: string | null;
      }> => ({ processed: 0, sent: 0, failed: 0, storeError: null }),
    ),
  };
}
