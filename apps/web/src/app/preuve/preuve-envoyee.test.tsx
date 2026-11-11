import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PreuveSummary } from '@/modules/inscriptions/proof-service';

import { PreuveEnvoyee, type VarianteEnvoi } from './preuve-envoyee';

const PREUVE: PreuveSummary = {
  id: 'preuve-1',
  depositedAt: '2026-11-11T21:56:00.000Z',
  sizeBytes: 102_400,
  mime: 'image/png',
  format: 'PNG',
  numeroTransaction: 'UHGF42567U',
};

async function rendre(variante: VarianteEnvoi, preuve: PreuveSummary = PREUVE): Promise<string> {
  const flux = await renderToReadableStream(
    <PreuveEnvoyee preuve={preuve} variante={variante} onRemplacer={() => {}} />,
  );
  return await new Response(flux).text();
}

describe('PreuveEnvoyee — accusé de réception après dépôt', () => {
  it('premier dépôt : confirme la réception, annonce la validation et la suite', async () => {
    const html = await rendre('premiere');
    expect(html).toContain('Ta preuve de paiement a bien été reçue.');
    expect(html).not.toContain('C’est bon');
    expect(html).toContain('<strong>en validation</strong>');
    expect(html).toContain('Tu reçois un email dès sa décision');
    expect(html).toContain('N° de transaction : UHGF42567U');
  });

  it('remplacement : dit que la nouvelle preuve remplace la précédente', async () => {
    const html = await rendre('remplacement');
    expect(html).toContain('Ta nouvelle preuve a bien été reçue. Elle remplace la précédente.');
  });

  it('même fichier renvoyé : n’annonce aucun remplacement', async () => {
    const html = await rendre('deja-recue');
    expect(html).toContain('Cette preuve était déjà enregistrée');
    expect(html).not.toContain('remplace la précédente');
  });

  it('preuve sans numéro de transaction (dépôt ancien) : pas de mention vide', async () => {
    const html = await rendre('premiere', { ...PREUVE, numeroTransaction: null });
    expect(html).not.toContain('N° de transaction');
  });

  it('propose la suite : voir le dossier, ou remplacer la preuve', async () => {
    const html = await rendre('premiere');
    expect(html).toMatch(/<a class="btn-action" href="\/espace-coureur">Voir mon dossier<\/a>/);
    expect(html).toContain('Remplacer ma preuve');
  });

  it('annoncé par le focus : focalisable et nommé par son message, sans région live', async () => {
    const html = await rendre('premiere');
    expect(html).toMatch(/tabindex="-1"/i);
    expect(html).toContain('aria-labelledby="preuve-envoyee-message"');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });
});
