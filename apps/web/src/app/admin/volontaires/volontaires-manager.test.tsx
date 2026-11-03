import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Story 10.3 — gabarit tableau commun sur /admin/volontaires : les deux
// tableaux (rapport d'import + liste) portent .socle-table dans un conteneur
// .table-wrap, les statuts sont des pastilles du socle (point + libellé,
// jamais la couleur seule), l'empilement mobile (data-libelle) est conservé.

// Pattern missions-manager.test.tsx : le manager est un composant client
// (router) rendu ici en SSR pur pour son markup.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import { RapportImport, VolontairesManager } from './volontaires-manager';

const VOLONTAIRES = [
  {
    id: 'vol-1',
    nom: 'Karim Saadi',
    email: 'karim@exemple.dz',
    telephone: null,
    statutInvitation: 'active' as const,
    statutInvitationLabel: 'Activé',
    createdAt: '2027-01-10T08:00:00.000Z',
  },
  {
    id: 'vol-2',
    nom: 'Lina Merbah',
    email: 'lina@exemple.dz',
    telephone: '+213 555 010 210',
    statutInvitation: 'echec' as const,
    statutInvitationLabel: 'Échec',
    createdAt: '2027-01-11T08:00:00.000Z',
  },
];

const RAPPORT = {
  lignes: [
    { ligne: 2, nom: 'Karim Saadi', email: 'karim@exemple.dz', statut: 'créé' as const },
    { ligne: 3, nom: '', email: 'pas-un-email', statut: 'rejeté' as const, raison: 'email invalide' },
    { ligne: 4, nom: 'Karim Saadi', email: 'karim@exemple.dz', statut: 'ignoré' as const, raison: 'déjà armé' },
  ],
  resume: { crees: 1, ignores: 1, rejetes: 1, invitationsEnFile: 1 },
};

async function renduListe(): Promise<string> {
  const flux = await renderToReadableStream(
    <VolontairesManager volontaires={VOLONTAIRES} />,
  );
  return await new Response(flux).text();
}

async function renduRapport(): Promise<string> {
  const flux = await renderToReadableStream(<RapportImport rapport={RAPPORT} />);
  return await new Response(flux).text();
}

describe('VolontairesManager — liste sur le gabarit commun (story 10.3)', () => {
  it('tableau .socle-table dans un conteneur .table-wrap, en-têtes scope="col"', async () => {
    const html = await renduListe();
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('class="socle-table volontaires-table"');
    for (const colonne of ['Nom', 'Email', 'Téléphone', 'Invitation', 'Action']) {
      expect(html).toMatch(new RegExp(`<th[^>]*scope="col"[^>]*>\\s*${colonne}`));
    }
  });

  it('statuts d’invitation en pastilles : point + LIBELLÉ, une variante par état', async () => {
    const html = await renduListe();
    expect(html).toContain('socle-pastille--succes');
    expect(html).toContain('socle-pastille--danger');
    // Le libellé textuel porte le sens dans tous les cas.
    expect(html).toContain('Activé');
    expect(html).toContain('Échec');
    expect(html.match(/socle-pastille-point/g)?.length).toBe(VOLONTAIRES.length);
  });

  it('empilement mobile conservé : les td gardent data-libelle', async () => {
    const html = await renduListe();
    for (const libelle of ['Nom', 'Email', 'Téléphone', 'Invitation', 'Action']) {
      expect(html).toContain(`data-libelle="${libelle}"`);
    }
    expect(html).toContain('sr-only');
  });
});

describe('RapportImport — gabarit tableau commun (story 10.3)', () => {
  it('tableau .socle-table dans un conteneur .table-wrap, colonne Ligne en .socle-num', async () => {
    const html = await renduRapport();
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('class="socle-table volontaires-table"');
    expect(html).toMatch(/<th[^>]*class="socle-num"[^>]*>\s*Ligne/);
    expect(html).toMatch(/<td[^>]*data-libelle="Ligne"[^>]*class="socle-num"/);
  });

  it('statuts d’import en pastilles : créé → succès, rejeté → danger, ignoré → point neutre', async () => {
    const html = await renduRapport();
    expect(html).toContain('socle-pastille--succes');
    expect(html).toContain('socle-pastille--danger');
    // « ignoré » : pastille SANS modificateur (point neutre) — le libellé
    // textuel reste porté.
    expect(html.match(/socle-pastille socle-pastille--/g)?.length).toBe(2);
    expect(html.match(/socle-pastille-point/g)?.length).toBe(RAPPORT.lignes.length);
    expect(html).toContain('Créé');
    expect(html).toContain('Rejeté');
    expect(html).toContain('Ignoré');
  });
});
