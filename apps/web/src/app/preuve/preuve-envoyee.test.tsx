import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PreuveSummary } from '@/modules/inscriptions/proof-service';

import { PreuveEnvoyee } from './preuve-envoyee';

const PREUVE: PreuveSummary = {
  id: 'preuve-1',
  depositedAt: '2026-11-11T21:56:00.000Z',
  sizeBytes: 102_400,
  mime: 'image/png',
  format: 'PNG',
  numeroTransaction: 'UHGF42567U',
};

async function rendre(preuve: PreuveSummary = PREUVE): Promise<string> {
  const flux = await renderToReadableStream(<PreuveEnvoyee preuve={preuve} assistancePhone="+213 555 010 200" />);
  return await new Response(flux).text();
}

describe('PreuveEnvoyee — accusé de réception après dépôt', () => {
  it('premier dépôt : confirme la réception, annonce la validation et la suite', async () => {
    const html = await rendre();
    expect(html).toContain('Ta preuve de paiement a bien été reçue.');
    expect(html).not.toContain('C’est bon');
    expect(html).toContain('<strong>en validation</strong>');
    expect(html).toContain('Tu reçois un email dès sa décision');
    expect(html).toContain('N° de transaction : UHGF42567U');
  });

  it('preuve sans numéro de transaction (dépôt ancien) : pas de mention vide', async () => {
    const html = await rendre({ ...PREUVE, numeroTransaction: null });
    expect(html).not.toContain('N° de transaction');
  });

  it('seule suite proposée : voir le dossier — aucun remplacement (dossier figé en validation)', async () => {
    const html = await rendre();
    expect(html).toMatch(/<a class="btn-action" href="\/espace-coureur">Voir mon dossier<\/a>/);
    expect(html).not.toContain('Remplacer');
    expect(html).not.toContain('<button');
  });

  it('erreur de fichier : orientation vers l’organisation et bouton d’assistance', async () => {
    const html = await rendre();
    expect(html).toContain('Tu t’es trompé de fichier ? Appelle l’organisation');
    expect(html).toContain('Modifier mon inscription');
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('Appeler l’équipe');
  });

  it('annoncé par le focus : focalisable et nommé par son message, sans région live', async () => {
    const html = await rendre();
    expect(html).toMatch(/tabindex="-1"/i);
    expect(html).toContain('aria-labelledby="preuve-envoyee-message"');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });
});
