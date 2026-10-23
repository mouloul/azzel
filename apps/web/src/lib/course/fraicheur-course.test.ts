import { describe, expect, it } from 'vitest';

import {
  appliquerResultatPolling,
  interpreterReponseEtat,
  libelleEtatCourse,
  libellerFraicheurCourse,
  type EtatPolling,
} from './fraicheur-course';
import type { EtatCourse } from '@/modules/chrono/service';

// Story 5.1 (NFR-5) — fraîcheur du PC course : l'âge se calcule depuis la
// DERNIÈRE RÉCEPTION serveur (fraicheur), la fusion polling/échec garde
// TOUJOURS le dernier état — jamais blanc, jamais de figé rajeuni.

const MAINTENANT = new Date('2027-05-16T08:00:00.000Z');

function etat(fraicheur: string | null): EtatCourse {
  return {
    edition: { id: 'edition-1', nom: 'Édition 2027' },
    partants: [{ epreuveId: 'ep-1', epreuveNom: 'La Longue', total: 12 }],
    retraits: 3,
    arrives: 1,
    enCourse: 2,
    abandones: 0,
    arriveeDefinie: true,
    checkpoints: [],
    alertes: [],
    fraicheur,
    genereA: '2027-05-16T08:00:00.000Z',
  };
}

describe('libellerFraicheurCourse', () => {
  it('fraîcheur nulle : « aucune donnée reçue » (édition sans scans)', () => {
    expect(libellerFraicheurCourse(null, MAINTENANT)).toBe('aucune donnée reçue');
  });

  it('horodatage invalide : libellé dégradé, jamais d’exception', () => {
    expect(libellerFraicheurCourse('pas-une-date', MAINTENANT)).toBe('aucune donnée reçue');
  });

  it('moins de 60 s : « synchronisé il y a X s »', () => {
    expect(libellerFraicheurCourse('2027-05-16T07:59:42.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 18 s',
    );
    expect(libellerFraicheurCourse('2027-05-16T08:00:00.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 0 s',
    );
  });

  it('à partir d’une minute : « synchronisé il y a X min » (minutes entières)', () => {
    expect(libellerFraicheurCourse('2027-05-16T07:57:30.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 2 min',
    );
    expect(libellerFraicheurCourse('2027-05-16T07:00:01.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 59 min',
    );
  });

  it('au-delà d’une heure : « synchronisé il y a X h » (réseau dégradé prolongé)', () => {
    expect(libellerFraicheurCourse('2027-05-16T05:30:00.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 2 h',
    );
  });

  it('horloge client en avance sur le serveur : âge borné à 0 s, jamais négatif', () => {
    expect(libellerFraicheurCourse('2027-05-16T08:00:30.000Z', MAINTENANT)).toBe(
      'synchronisé il y a 0 s',
    );
  });
});

describe('appliquerResultatPolling (fusion état/échec — le dernier état gagne)', () => {
  const precedent: EtatPolling = { etat: etat('2027-05-16T07:50:00.000Z'), enEchec: false };

  it('succès : le nouvel état remplace, le drapeau d’échec retombe', () => {
    const suivant = etat('2027-05-16T07:59:58.000Z');
    expect(appliquerResultatPolling(precedent, { ok: true, etat: suivant })).toEqual({
      etat: suivant,
      enEchec: false,
    });
  });

  it('échec réseau : l’ANCIEN état est conservé tel quel, seul le drapeau monte', () => {
    expect(appliquerResultatPolling(precedent, { ok: false })).toEqual({
      etat: precedent.etat,
      enEchec: true,
    });
  });

  it('rétablissement après échec : le nouvel état remplace ET efface le drapeau', () => {
    const degrade = appliquerResultatPolling(precedent, { ok: false });
    const suivant = etat('2027-05-16T08:00:00.000Z');
    expect(appliquerResultatPolling(degrade, { ok: true, etat: suivant })).toEqual({
      etat: suivant,
      enEchec: false,
    });
  });

  it('la fraîcheur conservée en échec continue de VIEILLIR au rendu (l’âge croît)', () => {
    const degrade = appliquerResultatPolling(precedent, { ok: false });
    const ageInitial = libellerFraicheurCourse(degrade.etat.fraicheur, MAINTENANT);
    const ageTardif = libellerFraicheurCourse(
      degrade.etat.fraicheur,
      new Date(MAINTENANT.getTime() + 5 * 60_000),
    );
    expect(ageInitial).toBe('synchronisé il y a 10 min');
    expect(ageTardif).toBe('synchronisé il y a 15 min');
  });
});

describe('libelleEtatCourse — discriminant édition (story 5.1 revue)', () => {
  it('sans édition : « aucune édition configurée », DISTINCT de « aucune donnée reçue »', () => {
    expect(libelleEtatCourse({ edition: null, fraicheur: null }, MAINTENANT)).toBe(
      'aucune édition configurée',
    );
    // Même si des événements existaient (impossible sans édition, garde de
    // forme) : le discriminant est l'édition, pas la fraîcheur.
    expect(libelleEtatCourse({ edition: null, fraicheur: '2027-05-16T07:59:00.000Z' }, MAINTENANT)).toBe(
      'aucune édition configurée',
    );
  });

  it('édition en place sans scans : « aucune donnée reçue »', () => {
    expect(
      libelleEtatCourse({ edition: { id: 'edition-1', nom: 'Édition 2027' }, fraicheur: null }, MAINTENANT),
    ).toBe('aucune donnée reçue');
  });

  it('édition en place avec données : délégation au libellé d’âge', () => {
    expect(
      libelleEtatCourse(
        { edition: { id: 'edition-1', nom: 'Édition 2027' }, fraicheur: '2027-05-16T07:59:42.000Z' },
        MAINTENANT,
      ),
    ).toBe('synchronisé il y a 18 s');
  });
});

describe('interpreterReponseEtat — corps brut de GET /api/admin/course/etat', () => {
  it('payload valide { ok: true, etat } : accepté tel quel', () => {
    const etatValide = etat('2027-05-16T07:59:00.000Z');
    expect(interpreterReponseEtat({ ok: true, etat: etatValide })).toEqual({
      ok: true,
      etat: etatValide,
    });
  });

  it('payload non objet (null, string, JSON cassé) : échec', () => {
    expect(interpreterReponseEtat(null)).toEqual({ ok: false });
    expect(interpreterReponseEtat('ok')).toEqual({ ok: false });
    expect(interpreterReponseEtat(undefined)).toEqual({ ok: false });
  });

  it('ok:false / ok absent (erreur enveloppe) : échec', () => {
    expect(interpreterReponseEtat({ ok: false })).toEqual({ ok: false });
    expect(interpreterReponseEtat({ error: { code: 'admin.db_unavailable' } })).toEqual({ ok: false });
  });

  it('etat absent ou null (garde == null) : échec — jamais d’état vide avalé', () => {
    expect(interpreterReponseEtat({ ok: true })).toEqual({ ok: false });
    expect(interpreterReponseEtat({ ok: true, etat: null })).toEqual({ ok: false });
  });

  it('story 5.2 (revue) — alertes absentes ou non-tableau : normalisées en [], jamais de crash de rendu', () => {
    const sansAlertes = etat('2027-05-16T07:59:00.000Z') as { alertes?: unknown };
    delete sansAlertes.alertes;
    expect(interpreterReponseEtat({ ok: true, etat: sansAlertes })).toEqual({
      ok: true,
      etat: { ...sansAlertes, alertes: [] },
    });
    const etatCorrompu = {
      ...etat('2027-05-16T07:59:00.000Z'),
      alertes: 'oups' as unknown,
    };
    expect(interpreterReponseEtat({ ok: true, etat: etatCorrompu })).toEqual({
      ok: true,
      etat: { ...etatCorrompu, alertes: [] },
    });
  });

  it('se branche directement sur appliquerResultatPolling : échec = dernier état conservé', () => {
    const precedent: EtatPolling = { etat: etat('2027-05-16T07:50:00.000Z'), enEchec: false };
    expect(appliquerResultatPolling(precedent, interpreterReponseEtat({ ok: true, etat: null }))).toEqual(
      { etat: precedent.etat, enEchec: true },
    );
  });
});
