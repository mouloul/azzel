import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { EntreeJournalSync } from '@/lib/idb-volontaires';

import {
  BandeauSync,
  VueBandeauSync,
  libellerBandeauSync,
  phaseApresSync,
} from './bandeau-sync';

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
    // Revue épopées 3/4 — accord au singulier : « 1 passages » se lisait au
    // guichet. Le gabarit « N passages » de la story notait le pluriel par
    // défaut, il n'imposait pas un pluriel invariable.
    expect(libellerBandeauSync('attente', 1)).toBe('◷ 1 passage en attente');
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

describe('phaseApresSync — une révocation ne se lève qu’au PC (revue épopées 3/4)', () => {
  // AD-5 : « un appareil révoqué reçoit un 401 dédié, le client affiche
  // Appelle le PC ». Le ternaire restant > 0 écrasait cette phase dès qu'un
  // déclenchement ultérieur échouait autrement (réseau) : le lien disparaissait
  // et le volontaire relançait un appareil bloqué au lieu d'appeler.
  it('révocation signalée : phase revoque, quel que soit le restant', () => {
    expect(phaseApresSync('envoi', 'appareil-revoque', 0)).toBe('revoque');
    expect(phaseApresSync('envoi', 'appareil-revoque', 7)).toBe('revoque');
  });

  it('déjà révoqué : AUCUN statut ultérieur ne remet le bandeau en attente', () => {
    for (const statut of ['reseau-indisponible', 'envoye', 'rien-a-envoyer', 'sans-jeton'] as const) {
      expect(phaseApresSync('revoque', statut, 0)).toBe('revoque');
      expect(phaseApresSync('revoque', statut, 4)).toBe('revoque');
    }
  });

  it('hors révocation : la phase suit le restant RÉEL de la file', () => {
    expect(phaseApresSync('envoi', 'envoye', 0)).toBe('envoye');
    expect(phaseApresSync('envoi', 'envoye', 3)).toBe('attente');
    expect(phaseApresSync('envoi', 'reseau-indisponible', 3)).toBe('attente');
  });
});

describe('BandeauSync — déclenchements de reprise réseau câblés (story 10.4, FR-14)', () => {
  // Les effets exigeraient un DOM (harnais node) : le câblage est épinglé par
  // lecture de source, même principe que suivi-etat.test.ts côté app coureurs.
  // Le MOTEUR de reprise (coupure au 2ᵉ lot, reprise par tranches, retry
  // register-then) est couvert en pur dans sync-terrain.test.ts.
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'bandeau-sync.tsx'),
    'utf8',
  );

  it('retour du réseau : écouteur online → relance de la sync (retiré au démontage)', () => {
    expect(source).toContain("window.addEventListener('online', auRetour)");
    expect(source).toContain("window.removeEventListener('online', auRetour)");
  });

  it('signal du parent (ouverture en ligne après fetch etat) : declenchement > 0 → lancer', () => {
    expect(source).toContain('if (declenchement > 0)');
  });

  it('un déclenchement PENDANT un envoi est mémorisé puis rejoué (jamais perdu)', () => {
    expect(source).toContain('relance.current = true');
    expect(source).toContain('void lancer();');
  });

  it('l’ouverture en ligne tente la sync dès le montage (canal appareil, AD-5)', () => {
    const montage = source.indexOf("typeof navigator === 'undefined'");
    const tentative = source.indexOf('await lancer();', montage);
    expect(tentative).toBeGreaterThan(-1);
  });
});
