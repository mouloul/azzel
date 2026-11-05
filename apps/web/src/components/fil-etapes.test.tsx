import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// Story 9.4 — fil d'étapes du dossier coureur : l'étape courante se lit par
// la FORME (marqueur plein à double filet, glyphe ✓ pour les faites) et par
// le TEXTE (« Étape N sur 4 — en cours »), jamais par la couleur seule. Les
// étapes suivantes ne portent AUCUNE mention d'état et AUCUN lien : le fil
// ne prétend pas qu'elles sont accessibles. Environnement node sans DOM :
// rendu serveur, seuls les états calculés sont testés.

import {
  FilEtapes,
  etapesAcceptations,
  etapesInscription,
  etapesPreuve,
} from './fil-etapes';

async function rendu(etapes: Parameters<typeof FilEtapes>[0]['etapes']): Promise<string> {
  const flux = await renderToReadableStream(<FilEtapes etapes={etapes} />);
  return await new Response(flux).text();
}

describe('FilEtapes — rendu serveur (story 9.4)', () => {
  it('étape courante : texte « Étape 2 sur 4 — en cours » ET aria-current="step"', async () => {
    const html = await rendu([
      { libelle: 'Inscription', etat: 'fait', href: '/inscription' },
      { libelle: 'Documents', etat: 'courante' },
      { libelle: 'Paiement', etat: 'suite' },
      { libelle: 'Validation', etat: 'suite' },
    ]);
    expect(html).toContain('Étape 2 sur 4 — en cours');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Étapes du dossier"');
  });

  it('un seul aria-current même si plusieurs étapes — seule la courante le porte', async () => {
    const html = await rendu([
      { libelle: 'Inscription', etat: 'courante' },
      { libelle: 'Documents', etat: 'suite' },
    ]);
    expect((html.match(/aria-current="step"/g) ?? []).length).toBe(1);
  });

  it('étape faite : glyphe ✓ (forme) + texte « Fait » porteur du sens', async () => {
    const html = await rendu([
      { libelle: 'Inscription', etat: 'fait', href: '/inscription' },
      { libelle: 'Documents', etat: 'courante' },
    ]);
    expect(html).toContain('✓');
    expect(html).toContain('Fait');
  });

  it('étape à faire : texte « À faire », jamais la couleur seule', async () => {
    const html = await rendu([{ libelle: 'Documents', etat: 'a-faire', href: '/acceptations' }]);
    expect(html).toContain('À faire');
  });

  it('étapes suivantes : AUCUNE mention d’état, AUCUN lien — pas de promesse d’accès', async () => {
    const html = await rendu([
      { libelle: 'Inscription', etat: 'fait', href: '/inscription' },
      { libelle: 'Documents', etat: 'courante' },
      { libelle: 'Paiement', etat: 'suite' },
      { libelle: 'Validation', etat: 'suite' },
    ]);
    expect(html).not.toContain('À venir');
    // Les éléments d'étape suivants ne portent pas de balise <a>.
    const apresPaiement = html.slice(html.indexOf('Paiement'));
    expect(apresPaiement).not.toContain('<a ');
  });

  it('lien de retour uniquement quand un href est fourni, cible ≥ 44 px par la classe', async () => {
    const html = await rendu([
      { libelle: 'Inscription', etat: 'fait', href: '/inscription' },
      { libelle: 'Documents', etat: 'courante' },
    ]);
    expect(html).toContain('href="/inscription"');
    expect(html).toContain('fil-etape-lien');
  });
});

describe('etapesInscription — /inscription ne marque que ce qu’elle sait', () => {
  it('nouveau coureur : étape 1 courante, les trois suivantes sans mention', () => {
    const etapes = etapesInscription(null);
    expect(etapes.map((etape) => etape.etat)).toEqual(['courante', 'suite', 'suite', 'suite']);
    expect(etapes.every((etape) => etape.href === undefined)).toBe(true);
  });

  it('coureur avec les deux acceptations : Documents « fait » (lu sur le coureur)', () => {
    const accepte = { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' };
    const etapes = etapesInscription({
      dechargeAccepte: accepte,
      reglementAccepte: accepte,
    });
    expect(etapes[1]).toMatchObject({ libelle: 'Documents', etat: 'fait' });
  });

  // Revue épopée 9 (M2) : étape franchie = lien de retour (matrice 9.4) —
  // un coureur existant a déjà validé ses documents, /acceptations est
  // atteignable pour lui.
  it('Documents « fait » : lien de retour /acceptations rendu (revue 9, M2)', async () => {
    const accepte = { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' };
    const etapes = etapesInscription({
      dechargeAccepte: accepte,
      reglementAccepte: accepte,
    });
    expect(etapes[1]).toEqual({
      libelle: 'Documents',
      etat: 'fait',
      href: '/acceptations',
    });
    const html = await rendu(etapes);
    expect(html).toContain('href="/acceptations"');
    expect(html).toContain('fil-etape-lien');
  });

  it('une seule acceptation : Documents reste sans mention — jamais de « fait » approximatif', () => {
    const accepte = { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' };
    const etapes = etapesInscription({
      dechargeAccepte: accepte,
      reglementAccepte: null,
    });
    expect(etapes[1]?.etat).toBe('suite');
  });
});

describe('etapesAcceptations — /acceptations : retour possible vers l’inscription', () => {
  it('coureur inscrit (garde de la page) : Inscription « fait » + lien, Documents courante', () => {
    const etapes = etapesAcceptations('en constitution');
    expect(etapes[0]).toEqual({ libelle: 'Inscription', etat: 'fait', href: '/inscription' });
    expect(etapes[1]).toEqual({ libelle: 'Documents', etat: 'courante' });
    expect(etapes.slice(2).every((etape) => etape.href === undefined && etape.etat === 'suite')).toBe(
      true,
    );
  });

  it('sans coureur (jamais atteint, garde serveur) : aucun lien quand même', () => {
    expect(etapesAcceptations(null)[0]?.href).toBeUndefined();
  });
});

describe('etapesPreuve — /preuve : Documents marqué depuis documentsAcceptes', () => {
  it('documents acceptés : les deux premières étapes « fait » avec liens de retour', () => {
    const etapes = etapesPreuve('en constitution', true);
    expect(etapes[0]).toEqual({ libelle: 'Inscription', etat: 'fait', href: '/inscription' });
    expect(etapes[1]).toEqual({
      libelle: 'Documents',
      etat: 'fait',
      href: '/acceptations',
    });
    expect(etapes[2]).toEqual({ libelle: 'Paiement', etat: 'courante' });
    expect(etapes[3]?.href).toBeUndefined();
  });

  it('documents manquants : étape Documents « À faire » (exact), toujours retournable', () => {
    const etapes = etapesPreuve('refusé', false);
    expect(etapes[1]).toEqual({
      libelle: 'Documents',
      etat: 'a-faire',
      href: '/acceptations',
    });
  });
});
