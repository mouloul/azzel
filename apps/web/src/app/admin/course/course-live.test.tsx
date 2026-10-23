import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// Story 5.3 (revue) — rendu serveur du formulaire inline d'abandon (pattern
// MissionForm de missions-manager.test.tsx) : une option par motif avec
// VALEUR (identifiant stable) ≠ libellé affiché, ids des quatre champs,
// préremplissage du dossard depuis une ligne d'alerte, aria-invalid absent
// sans erreur, autofocus sur le premier champ.

import { FormulaireAbandon } from './course-live';
import { LIBELLES_MOTIF_ABANDON, MOTIFS_ABANDON } from '@/modules/chrono/domain';

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(
    <FormulaireAbandon
      dossardInitial={102}
      onFerme={() => undefined}
      onEnvoiChange={() => undefined}
      onEnregistre={() => undefined}
    />,
  );
  return await new Response(flux).text();
}

describe('FormulaireAbandon — rendu serveur (story 5.3)', () => {
  it('quatre champs avec ids stables et labels associés : dossard, lieu, motif, heure', async () => {
    const html = await rendu();
    for (const id of ['abandon-dossard', 'abandon-lieu', 'abandon-motif', 'abandon-heure']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain('type="number"');
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('Choisissez un motif…');
  });

  it('une option par motif, VALEUR (identifiant) ≠ libellé affiché', async () => {
    const html = await rendu();
    for (const motif of MOTIFS_ABANDON) {
      expect(html).toContain(
        `<option value="${motif}">${LIBELLES_MOTIF_ABANDON[motif]}</option>`,
      );
      // La valeur soumise est l'identifiant fermé, jamais le libellé.
      expect(motif).not.toBe(LIBELLES_MOTIF_ABANDON[motif]);
    }
    expect(html).toContain('<option value="" selected="">Choisissez un motif…</option>');
  });

  it('préremplissage : dossard de la ligne d’alerte (value="102"), heure défaut remplie', async () => {
    const html = await rendu();
    expect(html).toMatch(/name="dossard"[^>]*value="102"/);
    expect(html).toMatch(/name="heure"[^>]*value="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
  });

  it('sans erreur : aucun aria-invalid rendu ; autofocus sur le premier champ', async () => {
    const html = await rendu();
    expect(html).not.toContain('aria-invalid');
    expect(html).toMatch(/id="abandon-dossard"[^>]*autofocus/);
  });

  it('indicateur d’aide de l’heure TOUJOURS référencé par aria-describedby (erreur comprise)', async () => {
    const html = await rendu();
    expect(html).toContain('id="abandon-heure-aide"');
    // L'input heure porte l'aide en aria-describedby dès l'ouverture (l'éventuel
    // id d'erreur viendra s'y AJOUTER, jamais le remplacer).
    expect(html).toMatch(/<input id="abandon-heure"[^>]*aria-describedby="abandon-heure-aide"/);
  });
});
