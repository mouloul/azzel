import { renderToReadableStream } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { EntreeJournalSync } from '@/lib/idb-volontaires';

import { BandeauSync, VueBandeauSync, libellerBandeauSync } from './bandeau-sync';

// Story 4.5 (UX-DR-8) — tests du bandeau sync : libellés purs par phase
// (◷/⏳/✓/⚠ — jamais la couleur seule), rendu « Appelle le PC » sur révocation
// (lien tel:, PAS de bouton d'envoi), journal en lecture seule (motifs,
// offset horloge), et rendu initial SSR du conteneur sans effets.

const JOURNAL: EntreeJournalSync[] = [
  {
    id: 'entree-1',
    horodatage: '2027-05-16T07:06:10.000Z',
    envoyes: 12,
    dejaConnus: 3,
    rejetes: 1,
    motifs: ['coureur inconnu'],
    offsetMoyenMs: 45_000,
  },
  {
    id: 'entree-2',
    horodatage: '2027-05-16T08:06:10.000Z',
    envoyes: 0,
    dejaConnus: 5,
    rejetes: 0,
    motifs: [],
    offsetMoyenMs: null,
  },
];

async function rendu(element: ReactElement): Promise<string> {
  const flux = await renderToReadableStream(element);
  return await new Response(flux).text();
}

describe('libellerBandeauSync — états ◷/⏳/✓/⚠ (textes intégraux, AD accessibilité)', () => {
  it('attente : « ◷ N passages en attente », envoi : progression, envoyé : file à 0', () => {
    // Story 10.1 — textes exacts du bandeau, verbatim.
    expect(libellerBandeauSync('attente', 217)).toBe('◷ 217 passages en attente');
    expect(libellerBandeauSync('envoi', 12)).toBe('⏳ Envoi en cours — 12 en attente');
    expect(libellerBandeauSync('envoye', 0)).toBe('✓ envoyés — file : 0');
  });

  it('révoqué : « ⚠ Appareil bloqué par le PC » (jamais un simple 401 muet)', () => {
    expect(libellerBandeauSync('revoque', 42)).toBe('⚠ Appareil bloqué par le PC');
  });

  it('comptage initial : label explicite, pas de faux zéro', () => {
    expect(libellerBandeauSync('comptage', 0)).toBe('Sync de la file…');
  });

  it('comptage impossible (stockage illisible) : jamais de « file : 0 » mensonger', () => {
    expect(libellerBandeauSync('comptage-impossible', 0)).toBe('Comptage impossible — réessaie');
  });
});

describe('VueBandeauSync — rendu par phase', () => {
  it('attente : status poli « ◷ 12 en attente », bouton Envoyer maintenant, journal détaillé', async () => {
    const html = await rendu(
      <VueBandeauSync
        phase="attente"
        enAttente={12}
        journal={JOURNAL}
        assistancePhone="+213 555 010 200"
        surEnvoyer={() => undefined}
      />,
    );
    expect(html).toContain('◷ 12 passages en attente');
    expect(html).toContain('id="volontaires-sync-titre"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Envoyer maintenant');
    expect(html).toMatch(/Journal sync \((?:<!-- -->)?2/);
    // Journal : compteurs lisibles, motif du rejet, offset horloge signé.
    expect(html).toContain('12 envoyés');
    expect(html).toContain('3 déjà connus');
    expect(html).toContain('1 rejeté');
    expect(html).toContain('coureur inconnu');
    expect(html).toContain('+45 s vs serveur');
  });

  it('envoyé : « ✓ envoyés — file : 0 » exact', async () => {
    const html = await rendu(
      <VueBandeauSync
        phase="envoye"
        enAttente={0}
        journal={JOURNAL}
        assistancePhone="+213 555 010 200"
        surEnvoyer={() => undefined}
      />,
    );
    expect(html).toContain('✓ envoyés — file : 0');
  });

  it('révoqué : lien « Appelle le PC » (tel:), PAS de bouton d’envoi', async () => {
    const html = await rendu(
      <VueBandeauSync
        phase="revoque"
        enAttente={40}
        journal={[]}
        assistancePhone="+213 555 010 200"
        surEnvoyer={() => undefined}
      />,
    );
    expect(html).toContain('⚠ Appareil bloqué par le PC');
    expect(html).toContain('Appelle le PC — la sync est bloquée');
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).not.toContain('Envoyer maintenant');
    expect(html).toMatch(/Journal sync \((?:<!-- -->)?0/);
    expect(html).toContain('Aucun lot encore parti.');
  });

  it('journal sans offset : la ligne d’offset est absente (pas de faux 0 s)', async () => {
    const html = await rendu(
      <VueBandeauSync
        phase="envoye"
        enAttente={0}
        journal={[JOURNAL[1] as EntreeJournalSync]}
        assistancePhone="+213 555 010 200"
        surEnvoyer={() => undefined}
      />,
    );
    expect(html).not.toContain('vs serveur');
  });
});

describe('BandeauSync — rendu initial (SSR, avant effets)', () => {
  it('le bandeau est TOUJOURS rendu : label initial, bouton, journal — sans casser la page', async () => {
    const html = await rendu(
      <BandeauSync assistancePhone="+213 555 010 200" declenchement={0} />,
    );
    expect(html).toContain('Sync de la file…');
    expect(html).toContain('Envoyer maintenant');
    expect(html).toMatch(/Journal sync \((?:<!-- -->)?0/);
    expect(html).toContain('volontaires-sync');
  });
});
