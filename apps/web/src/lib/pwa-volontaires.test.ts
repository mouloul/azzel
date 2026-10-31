import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../../next.config';

import {
  MESSAGE_RECHAUFFER_SHELL,
  SW_VOLONTAIRES_SCOPE,
  SW_VOLONTAIRES_URL,
  demanderStockagePersistant,
  enregistrerSwVolontaires,
  rechaufferShellVolontaires,
} from './pwa-volontaires';

// Revue 3.3 — enregistrement du SW volontaires : chemin et scope croisés
// avec le fichier servi, le manifeste (scope / start_url) et l'en-tête
// Service-Worker-Allowed de next.config — un désaccord tuerait le hors-ligne
// en silence. Échec d'enregistrement : false + journal, jamais d'exception.

const DOSSIER_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enregistrerSwVolontaires', () => {
  it('enregistre /sw-volontaires.js avec le scope /volontaires', async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    await expect(enregistrerSwVolontaires({ register })).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('/sw-volontaires.js', { scope: '/volontaires' });
  });

  it('refus du navigateur : false + journal, jamais d’exception', async () => {
    const avertissement = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const register = vi.fn(async () => {
      throw new Error('SecurityError');
    });
    await expect(enregistrerSwVolontaires({ register })).resolves.toBe(false);
    expect(avertissement).toHaveBeenCalledTimes(1);
  });

  it('sans service worker (SSR, vieux navigateur) : false', async () => {
    await expect(enregistrerSwVolontaires(undefined)).resolves.toBe(false);
  });
});

describe('cohérence chemin / scope / manifeste / Service-Worker-Allowed', () => {
  it('le script enregistré existe dans public/', () => {
    expect(existsSync(path.join(DOSSIER_PUBLIC, SW_VOLONTAIRES_URL.slice(1)))).toBe(true);
  });

  it('scope du SW = scope du manifeste, start_url dans le scope', () => {
    const manifeste = JSON.parse(
      readFileSync(path.join(DOSSIER_PUBLIC, 'volontaires/manifest.webmanifest'), 'utf8'),
    ) as { scope: string; start_url: string };
    expect(manifeste.scope).toBe(SW_VOLONTAIRES_SCOPE);
    expect(manifeste.start_url.startsWith(SW_VOLONTAIRES_SCOPE)).toBe(true);
  });

  it('next.config sert le script avec Service-Worker-Allowed = scope enregistré', async () => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find(({ source }) => source === SW_VOLONTAIRES_URL);
    expect(regle).toBeDefined();
    const entetes = new Map(regle?.headers.map(({ key, value }) => [key, value]));
    expect(entetes.get('Service-Worker-Allowed')).toBe(SW_VOLONTAIRES_SCOPE);
  });

  it('le SW comprend le message de réchauffage du shell', () => {
    const sw = readFileSync(path.join(DOSSIER_PUBLIC, SW_VOLONTAIRES_URL.slice(1)), 'utf8');
    expect(sw).toContain(`'${MESSAGE_RECHAUFFER_SHELL}'`);
  });
});

describe('demanderStockagePersistant', () => {
  it('déjà persistant : true sans redemander', async () => {
    const persist = vi.fn(async () => true);
    await expect(
      demanderStockagePersistant({ persisted: async () => true, persist }),
    ).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('non persistant : la demande est faite, sa réponse est rendue', async () => {
    const persist = vi.fn(async () => false);
    await expect(
      demanderStockagePersistant({ persisted: async () => false, persist }),
    ).resolves.toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('API absente ou en échec : false, jamais d’exception', async () => {
    await expect(demanderStockagePersistant(undefined)).resolves.toBe(false);
    await expect(demanderStockagePersistant({})).resolves.toBe(false);
    await expect(
      demanderStockagePersistant({
        persist: async () => {
          throw new Error('refus');
        },
      }),
    ).resolves.toBe(false);
  });
});

describe('rechaufferShellVolontaires', () => {
  it('poste le message au SW contrôleur ; sans contrôleur : false', () => {
    const postMessage = vi.fn();
    expect(rechaufferShellVolontaires({ postMessage })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: MESSAGE_RECHAUFFER_SHELL });
    expect(rechaufferShellVolontaires(null)).toBe(false);
  });
});
