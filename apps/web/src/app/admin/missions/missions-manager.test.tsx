import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Story 5.1 (revue) — rendu du manager missions : la case « Checkpoint
// d’arrivée » n'existe QUE pour une mission scan_checkpoint (absente du
// rendu accueil/autre type), et la LISTE porte le marqueur « — arrivée » sur
// la mission cochée. Rendu serveur pur (pattern page.test.tsx), effets morts.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import {
  MissionForm,
  MissionsManager,
  corpsMissionSoumis,
  valeursApresChangementType,
} from './missions-manager';
import { isoVersDatetimeLocal } from '@/modules/missions/domain';
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
    barriereLe: null,
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

describe('MissionForm — champ « Barrière horaire » réservé au type scan (story 5.2)', () => {
  it('mission scan_checkpoint : le champ datetime-local est rendu, prérempli en heure locale', async () => {
    const html = await rendu(
      <MissionForm
        secteurs={[SECTEUR]}
        mission={mission({
          type: 'scan_checkpoint',
          typeLabel: 'Scan checkpoint',
          titre: 'Scan km 12',
          barriereLe: '2027-05-16T10:00:00.000Z',
        })}
        onTermine={() => undefined}
      />,
    );
    expect(html).toContain('Barrière horaire (facultative)');
    expect(html).toContain('barriereLe');
    expect(html).toContain('type="datetime-local"');
    // Préremplissage : valeur datetime-local locale dérivée de l’ISO (TZ du
    // poste de test — on vérifie la FORME, pas le fuseau).
    expect(html).toMatch(/name="barriereLe"[^>]*value="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
  });

  it('mission accueil : le champ est ABSENT du rendu', async () => {
    const html = await rendu(<MissionForm secteurs={[SECTEUR]} mission={mission()} onTermine={() => undefined} />);
    expect(html).not.toContain('Barrière horaire');
    expect(html).not.toContain('barriereLe');
  });
});

describe('valeursApresChangementType — reset des champs dépendants au changement de type (story 5.2 revue)', () => {
  const valeurs = {
    secteurId: SECTEUR.id,
    type: 'scan_checkpoint' as const,
    titre: 'Scan km 12',
    debutLe: '2027-05-16T06:00',
    finLe: '2027-05-16T12:00',
    barriereLe: '2027-05-16T10:00',
    consignes: '',
    estArrivee: true,
  };

  it('scan → accueil : barrière ET marque arrivée resetées (aucune valeur masquée soumise)', () => {
    expect(valeursApresChangementType(valeurs, 'accueil')).toEqual({
      ...valeurs,
      type: 'accueil',
      barriereLe: '',
      estArrivee: false,
    });
  });

  it('scan → scan (ou depuis « » ) : les champs dépendants sont conservés', () => {
    expect(valeursApresChangementType(valeurs, 'scan_checkpoint')).toEqual(valeurs);
    expect(valeursApresChangementType({ ...valeurs, type: '' }, 'scan_checkpoint')).toEqual({
      ...valeurs,
    });
  });
});

describe('corpsMissionSoumis — assemblage du corps JSON (story 5.2 revue)', () => {
  const valeurs = {
    secteurId: SECTEUR.id,
    type: 'scan_checkpoint' as const,
    titre: '  Scan km 12  ',
    debutLe: '2027-05-16T06:00',
    finLe: '2027-05-16T12:00',
    barriereLe: '2027-05-16T10:00',
    consignes: '  Arrive 15 min avant. ',
    estArrivee: true,
  };

  it('titre/consignes trimés, datetime-local → ISO UTC, barriereLe TOUJOURS présent (null si vide)', () => {
    const corps = corpsMissionSoumis(valeurs);
    expect(corps.titre).toBe('Scan km 12');
    expect(corps.consignes).toBe('Arrive 15 min avant.');
    // datetime-local → ISO : aller-retour vérifié (fuseau du poste indifférent).
    expect(corps.debutLe).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(isoVersDatetimeLocal(corps.debutLe as string)).toBe(valeurs.debutLe);
    expect(isoVersDatetimeLocal(corps.barriereLe as string)).toBe(valeurs.barriereLe);
    expect('barriereLe' in corps).toBe(true);
    expect('estArrivee' in corps).toBe(true);
    expect(corps.estArrivee).toBe(true);
  });

  it('barrière vide : null transmis (effacement explicite), jamais une chaîne vide', () => {
    const corps = corpsMissionSoumis({ ...valeurs, barriereLe: '', estArrivee: false });
    expect(corps.barriereLe).toBeNull();
    expect(corps.estArrivee).toBe(false);
  });
});

describe('MissionsManager — marqueur « — barrière HH:MM » dans la liste (story 5.2)', () => {
  it('mission avec barrière : le marqueur apparaît, heure locale HH:MM', async () => {
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
                barriereLe: '2027-05-16T10:00:00.000Z',
              }),
            ],
          },
        ]}
        volontaires={[]}
      />,
    );
    expect(html).toContain('mission-barriere');
    // React insère un commentaire entre « — barrière » et l’heure locale.
    expect(html).toMatch(/— barrière (<!-- -->)?\d{2}:\d{2}/);
  });

  it('missions sans barrière : aucun marqueur « — barrière »', async () => {
    const html = await rendu(
      <MissionsManager
        edition={{ id: 'edition-1', nom: 'Édition 2027' }}
        secteurs={[
          {
            ...SECTEUR,
            missions: [mission({ id: 'mission-accueil' })],
          },
        ]}
        volontaires={[]}
      />,
    );
    expect(html).not.toContain('— barrière');
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
