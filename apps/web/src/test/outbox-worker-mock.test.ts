import { describe, expect, it, vi } from 'vitest';

import { createSilentOutboxWorker } from './outbox-worker-mock';

describe('createSilentOutboxWorker — helper de mock partagé', () => {
  it('processOutbox est une fonction moquée résolvant le résumé silencieux', async () => {
    const worker = createSilentOutboxWorker();
    expect(vi.isMockFunction(worker.processOutbox)).toBe(true);
    await expect(worker.processOutbox()).resolves.toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
      storeError: null,
    });
    expect(worker.processOutbox).toHaveBeenCalledTimes(1);
  });

  it('chaque appel crée une instance indépendante (isolation par fichier de test)', () => {
    const first = createSilentOutboxWorker();
    const second = createSilentOutboxWorker();
    expect(first.processOutbox).not.toBe(second.processOutbox);
  });
});
