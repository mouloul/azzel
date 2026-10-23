import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Story 5.1 (revue) — rendu du manager missions : la case « Checkpoint
// d’arrivée » n'existe QUE pour une mission scan_checkpoint (absente du
// rendu accueil/autre type), et la LISTE porte le marqueur « — arrivée » sur
// la mission cochée. Rendu serveur pur (pattern page.test.tsx), effets morts.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import { MissionForm, MissionsManager } from './missions-manager';
import type { MissionSummary, SecteurSummary } from '@/modules/missions/service';

const SECTEUR: SecteurSummary = {
  id: 'secteur-1',
  nom: 'Village',
  lieu: 'Place du village',
  contact: null,
  missions: [],
};

function mission(partial: Partial<MissionSummary> = {}): MissionSummary {
  return {
    id: 'mission-1',
    secteurId: SECTEUR.id,
    type: 'accueil',
    typeLabel: 'Accueil',
    titre: 'Accueil village',
    debutLe: '2027-05-16T06:00:00.000Z',
    finLe: '2027-05-16T12:00:00.000Z',
    consignes: null,
    estArrivee: false,
    affectations: [],
    couverture: 'vacante',
    couvertureLabel: 'Vacante',
    ...partial,
  };
}

async function rendu(element: React.ReactElement): Promise<string> {
  const flux = await renderToReadableStream(element);
  return await new Response(flux).text();
}

describe('MissionForm — case « Checkpoint d’arrivée » conditionnelle au type scan', () => {
  it('mission scan_checkpoint : la case est rendue (id estArrivee présent)', async () => {
    const html = await rendu(
      <MissionForm
        secteurs={[SECTEUR]}
        mission={mission({ type: 'scan_checkpoint', typeLabel: 'Scan checkpoint', titre: 'Scan km 12' })}
        onTermine={() => undefined}
      />,
    );
    expect(html).toContain('Checkpoint d’arrivée');
    expect(html).toContain('estArrivee');
  });

  it('mission accueil : la case est ABSENTE du rendu (aucun input estArrivee)', async () => {
    const html = await rendu(
      <MissionForm secteurs={[SECTEUR]} mission={mission()} onTermine={() => undefined} />,
    );
    expect(html).not.toContain('Checkpoint d’arrivée');
    expect(html).not.toContain('estArrivee');
  });

  it('formulaire de création (type non choisi) : la case est absente', async () => {
    const html = await rendu(<MissionForm secteurs={[SECTEUR]} onTermine={() => undefined} />);
    expect(html).not.toContain('Checkpoint d’arrivée');
    expect(html).not.toContain('estArrivee');
  });
});

describe('MissionsManager — marqueur « — arrivée » dans la liste', () => {
  it('mission cochée : le marqueur apparaît à côté du chip couverture', async () => {
    const html = await rendu(
      <MissionsManager
        edition={{ id: 'edition-1', nom: 'Édition 2027' }}
        secteurs={[
          {
            ...SECTEUR,
            missions: [
              mission({
                id: 'mission-scan',
                type: 'scan_checkpoint',
                typeLabel: 'Scan checkpoint',
                titre: 'Scan km 12',
                estArrivee: true,
              }),
            ],
          },
        ]}
        volontaires={[]}
      />,
    );
    expect(html).toContain('— arrivée');
  });

  it('missions non cochées : aucun marqueur « — arrivée »', async () => {
    const html = await rendu(
      <MissionsManager
        edition={{ id: 'edition-1', nom: 'Édition 2027' }}
        secteurs={[
          {
            ...SECTEUR,
            missions: [
              mission({ id: 'mission-accueil' }),
              mission({
                id: 'mission-scan',
                type: 'scan_checkpoint',
                typeLabel: 'Scan checkpoint',
                titre: 'Scan km 12',
                estArrivee: false,
              }),
            ],
          },
        ]}
        volontaires={[]}
      />,
    );
    expect(html).not.toContain('— arrivée');
  });
});
