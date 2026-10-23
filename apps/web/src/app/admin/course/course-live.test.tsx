import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// Story 5.3 (revue) — rendu serveur du formulaire inline d'abandon (pattern
// MissionForm de missions-manager.test.tsx) : une option par motif avec
// VALEUR (identifiant stable) ≠ libellé affiché, ids des quatre champs,
// préremplissage du dossard depuis une ligne d'alerte, aria-invalid absent
// sans erreur, autofocus sur le premier champ.
//
// Story 5.4 — rendu serveur du dialogue inline d'annulation (gabarit
// abandon) : role dialog aria-modal, cible explicite (dossard + checkpoint +
// heure en attente avant montage), avertissement définitif assumé, textarea
// motif OBLIGATOIRE relié à l'aide d'archivage par aria-describedby,
// aria-invalid absent sans erreur, autofocus.

import { DialogueAnnulation, FormulaireAbandon } from './course-live';
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

describe('DialogueAnnulation — rendu serveur (story 5.4)', () => {
  const CIBLE = {
    evenementId: '22222222-3333-4222-8222-222222222222',
    dossard: 101,
    checkpointTitre: 'Scan km 12',
    horodatageReception: '2027-05-16T07:05:09.000Z',
  };

  async function renduAnnulation(): Promise<string> {
    const flux = await renderToReadableStream(
      <DialogueAnnulation
        cible={CIBLE}
        maintenant={null}
        onFerme={() => undefined}
        onEnvoiChange={() => undefined}
        onAnnule={() => undefined}
      />,
    );
    return await new Response(flux).text();
  }

  it('role dialog aria-modal + cible : passage dossard @ checkpoint, heure en ATTENTE avant montage (calque boards)', async () => {
    const html = await renduAnnulation();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Annuler un passage');
    // React insère des commentaires entre segments : les MORCEAUX de la
    // cible sont assertés séparément — heure locale NON calculée au rendu
    // serveur (emplacement d'attente, jamais l'heure du serveur).
    expect(html).toContain('course-annulation-cible');
    expect(html).toContain('Passage dossard');
    expect(html).toContain('101');
    expect(html).toContain('Scan km 12');
    expect(html).toContain('--:--:--');
  });

  it('avertissement définitif assumé + archivage dit (AD-8)', async () => {
    const html = await renduAnnulation();
    expect(html).toContain('Opération définitive : aucun retour arrière');
    expect(html).toContain('reste archivé');
    expect(html).toContain('tracé');
  });

  it('un seul champ : textarea motif avec id/label stables, OBLIGATOIRE, autofocus', async () => {
    const html = await renduAnnulation();
    expect(html).toContain('id="annulation-motif"');
    expect(html).toContain('for="annulation-motif"');
    expect(html).toContain('Motif (obligatoire)');
    expect(html).toContain('<textarea');
    expect(html).toMatch(/id="annulation-motif"[^>]*autofocus/);
  });

  it('l’aide d’archivage TOUJOURS reliée au textarea par aria-describedby (erreur comprise)', async () => {
    const html = await renduAnnulation();
    expect(html).toContain('id="annulation-archive-aide"');
    expect(html).toMatch(
      /<textarea id="annulation-motif"[^>]*aria-describedby="annulation-archive-aide"/,
    );
  });

  it('sans erreur : aucun aria-invalid ni erreur de cible rendus ; actions confirmer/annuler', async () => {
    const html = await renduAnnulation();
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('annulation-evenement-erreur');
    expect(html).toContain('Annuler ce passage');
    expect(html).toContain('>Annuler</button>');
  });
});
