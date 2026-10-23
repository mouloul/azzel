import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ResultatsPublic } from '@azzel/shared';

import { ResultatsLive, VueResultats, appliquerResultatPollingResultats, interpreterResultatPolling } from './resultats-live';

// Story 7.2 — rendu serveur du rafraîchisseur public : témoin live (point
// pulsé + texte), fraîcheur, derniers arrivés (badge dossard mono), tableau
// par épreuve (libellé « Classement provisoire » en toutes lettres), état
// vide verbatim, squelettes calqués sans donnée initiale, échécs réseau
// (état conservé + reconnexion). L'anonymat est asserté : AUCUN identifiant
// personnel ne sort du rendu. Le polling lui-même (10 s, pause cachée,
// jamais simultané) vit dans ResultatsLive — seule l'interprétation pure du
// payload est testée ici (calque course-live.test.tsx : le rendu SSR n'exécute
// JAMAIS les effets).

const RESULTATS: ResultatsPublic = {
  classements: {
    genereA: '2027-03-26T10:00:05.000Z',
    fraicheur: '2027-03-26T10:00:02.000Z',
    libelle: 'Classement provisoire',
    epreuves: [
      {
        epreuveSlug: 'longue',
        epreuveNom: 'La Longue — 35 km',
        distanceKm: 35,
        heureDepart: '2027-03-26T07:00:00.000Z',
        configure: true,
        lignes: [
          { dossard: 201, rang: 1, tempsMs: 100 * 60_000, statut: 'arrivé', categorieAge: 'Senior' },
          { dossard: 204, rang: null, tempsMs: null, statut: 'en-course', categorieAge: 'V1' },
          { dossard: 205, rang: null, tempsMs: null, statut: 'abandonné', categorieAge: 'V2' },
        ],
        abandons: [205],
      },
      {
        epreuveSlug: 'sprint',
        epreuveNom: 'Le Sprint — 5 km',
        distanceKm: 5,
        heureDepart: null,
        configure: false,
        lignes: [],
        abandons: [],
      },
    ],
  },
  derniersArrives: [
    { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 100 * 60_000 },
    { dossard: 221, epreuveSlug: 'sprint', epreuveNom: 'Le Sprint — 5 km', tempsMs: null },
  ],
};

async function rendu(
  resultats: ResultatsPublic | null,
  enEchec = false,
  maintenant: Date | null = null,
): Promise<string> {
  const flux = await renderToReadableStream(
    <VueResultats resultats={resultats} enEchec={enEchec} maintenant={maintenant} />,
  );
  return await new Response(flux).text();
}

describe('VueResultats — rendu serveur (story 7.2)', () => {
  it('témoin live : point pulsé aria-hidden + texte « Résultats en direct » qui porte seul l’info', async () => {
    const html = await rendu(RESULTATS);
    expect(html).toContain('Résultats en direct');
    expect(html).toContain('resultats-temoin-point');
    expect(html).toContain('aria-hidden="true"');
  });

  it('fraîcheur TOUJOURS affichée (NFR-5), aria-hidden sur l’âge chiffré', async () => {
    const html = await rendu(RESULTATS);
    expect(html).toContain('synchronisé il y a');
    expect(html).toContain('resultats-fraicheur-age');
    expect(html).not.toContain('role="status"');
  });

  it('échec réseau : état conservé + « reconnexion… » annoncé (role=status), jamais d’écran vide', async () => {
    const html = await rendu(RESULTATS, true);
    expect(html).toContain('reconnexion…');
    expect(html).toContain('role="status"');
    // L'état reste rendu : le classement ne disparaît pas.
    expect(html).toContain('La Longue — 35 km');
    expect(html).toContain('201');
  });

  it('libellé « Classement provisoire » en toutes lettres — jamais officiel, jamais temps réel', async () => {
    const html = await rendu(RESULTATS);
    expect(html).toContain('Classement provisoire');
    const bas = html.toLowerCase();
    expect(bas).not.toContain('officiel');
    expect(bas).not.toContain('temps réel');
  });

  it('classement par épreuve : rangs, badges dossard, temps formatés, statuts en toutes lettres', async () => {
    const html = await rendu(RESULTATS);
    expect(html).toContain('La Longue — 35 km');
    expect(html).toContain('resultats-dossard');
    expect(html).toContain('1 h 40 min 00 s');
    expect(html).toContain('En course');
    expect(html).toContain('Abandonné');
    // React insère un commentaire entre segments : « Abandons : 205 ».
    expect(html).toMatch(/Abandons : (<!-- -->)?205/);
    // Épreuve non configurée : état dédié, PAS de rangs ni de temps.
    expect(html).toContain('Le Sprint — 5 km');
    expect(html).toContain('Heure de départ non configurée');
  });

  it('heure locale du départ : emplacement d’attente pré-montage, HH:MM local APRÈS montage (aucun flash serveur)', async () => {
    const preMontage = await rendu(RESULTATS);
    // Calque méta épreuve : jamais l'heure du serveur avant le montage.
    expect(preMontage).toContain('départ à --:--');
    expect(preMontage).not.toMatch(/départ à \d{2}:\d{2}/);
    // Après montage, l'horloge CLIENT qualifie l'heure (locale, à venir).
    const posteMontage = await rendu(RESULTATS, false, new Date('2027-03-26T06:00:00.000Z'));
    expect(posteMontage).toMatch(/départ à \d{2}:\d{2}/);
    expect(posteMontage).not.toContain('--:--');
  });

  it('derniers arrivés : le plus récent en tête, dossard + épreuve + temps, temps inconnu honnête', async () => {
    const html = await rendu(RESULTATS);
    expect(html).toContain('Derniers arrivés');
    expect(html.indexOf('201')).toBeGreaterThan(-1);
    expect(html.indexOf('221')).toBeGreaterThan(-1);
    // Épreuve non configurée : tiret, jamais un temps faux à zéro.
    expect(html).toContain('>—</span>');
  });

  it('anonymat strict : le rendu ne porte QUE des dossards — aucun nom, jeton, contact ni photo', async () => {
    const html = await rendu(RESULTATS);
    expect(html).not.toMatch(/jeton|prenom|first_name|last_name|email|photo|avatar/i);
  });

  it('état vide avant départ : verbatim « Pas encore de partants — départ à HH:MM » (à venir, après montage)', async () => {
    const vide: ResultatsPublic = {
      classements: {
        ...RESULTATS.classements,
        fraicheur: null,
        epreuves: RESULTATS.classements.epreuves.map((epreuve) => ({
          ...epreuve,
          lignes: [],
          abandons: [],
        })),
      },
      derniersArrives: [],
    };
    // Pré-montage : emplacement d'attente (calque méta épreuve), jamais le
    // fuseau du serveur.
    const preMontage = await rendu(vide);
    expect(preMontage).toContain('Pas encore de partants — départ à --:--');
    expect(preMontage).not.toMatch(/Pas encore de partants — départ à \d{2}:\d{2}/);
    // Après montage : heure LOCALE du prochain départ à venir (la Longue
    // 07:00Z est future pour une horloge 06:00Z).
    const posteMontage = await rendu(vide, false, new Date('2027-03-26T06:00:00.000Z'));
    expect(posteMontage).toMatch(/Pas encore de partants — départ à \d{2}:\d{2}/);
    expect(posteMontage).toContain('Aucune arrivée pour le moment');
    // Le libellé réglementaire reste affiché, même vide.
    expect(posteMontage).toContain('Classement provisoire');
  });

  it('état vide SANS heure configurée : texte neutre, JAMAIS un départ à 00:00', async () => {
    const vide: ResultatsPublic = {
      classements: {
        ...RESULTATS.classements,
        epreuves: [
          {
            epreuveSlug: 'sprint',
            epreuveNom: 'Le Sprint — 5 km',
            distanceKm: 5,
            heureDepart: null,
            configure: false,
            lignes: [],
            abandons: [],
          },
        ],
      },
      derniersArrives: [],
    };
    const html = await rendu(vide);
    expect(html).toContain('Les résultats apparaîtront au départ');
    expect(html).not.toContain('00:00');
  });

  it('sans donnée initiale (SSR dégradé) : squelettes CALQUÉS sur la mise en page, zone aria-busy', async () => {
    const html = await rendu(null);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('resultats-squelette');
    expect(html).toContain('resultats-squelette-bloc');
    // Le squelette ne rend AUCUNE donnée : pas de classement fantôme.
    expect(html).not.toContain('Classement provisoire');
    expect(html).not.toContain('resultats-dossard');
  });

  it('ResultatsLive rend le SSR complet avec l’état initial (le client n’est qu’un rafraîchisseur)', async () => {
    const flux = await renderToReadableStream(<ResultatsLive initial={RESULTATS} />);
    const html = await new Response(flux).text();
    expect(html).toContain('Résultats en direct');
    expect(html).toContain('Classement provisoire');
    expect(html).toContain('Derniers arrivés');
  });
});

describe('interpreterResultatPolling — pure (calque interpreterReponseEtat)', () => {
  it('payload valide : { ok: true, resultats } accepté tel quel', () => {
    const resultat = interpreterResultatPolling({ ok: true, resultats: RESULTATS });
    expect(resultat).toEqual({ ok: true, resultats: RESULTATS });
  });

  it('ok:false, resultats absent/null, payload non objet → échec (le dernier état gagne)', () => {
    expect(interpreterResultatPolling(null)).toEqual({ ok: false });
    expect(interpreterResultatPolling('texte')).toEqual({ ok: false });
    expect(interpreterResultatPolling({ ok: false })).toEqual({ ok: false });
    expect(interpreterResultatPolling({ ok: true })).toEqual({ ok: false });
    expect(interpreterResultatPolling({ ok: true, resultats: null })).toEqual({ ok: false });
  });

  it('dérives de FORME : classements absent/null, epreuves non tableau, lignes non tableau → échec (jamais de TypeError au rendu)', () => {
    expect(
      interpreterResultatPolling({ ok: true, resultats: { derniersArrives: [] } }),
    ).toEqual({ ok: false });
    expect(
      interpreterResultatPolling({ ok: true, resultats: { classements: null } }),
    ).toEqual({ ok: false });
    expect(
      interpreterResultatPolling({
        ok: true,
        resultats: { ...RESULTATS, classements: { ...RESULTATS.classements, epreuves: 'pas une liste' } },
      }),
    ).toEqual({ ok: false });
    expect(
      interpreterResultatPolling({
        ok: true,
        resultats: {
          ...RESULTATS,
          classements: {
            ...RESULTATS.classements,
            epreuves: [{ ...RESULTATS.classements.epreuves[0]!, lignes: 'pas une liste' }],
          },
        },
      }),
    ).toEqual({ ok: false });
  });

  it('lignes absentes par épreuve : normalisées par le rendu (tableau exigé — absent = dérive refusée)', () => {
    const sansLignes = {
      ...RESULTATS,
      classements: {
        ...RESULTATS.classements,
        epreuves: [{ ...RESULTATS.classements.epreuves[0]!, lignes: undefined }],
      },
    };
    expect(interpreterResultatPolling({ ok: true, resultats: sansLignes })).toEqual({ ok: false });
  });

  it('derniersArrives absent ou non-tableau (dérive serveur/proxy) : normalisé en []', () => {
    const classementsSeuls = { ...RESULTATS, derniersArrives: undefined };
    const resultat = interpreterResultatPolling({ ok: true, resultats: classementsSeuls });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.resultats.derniersArrives).toEqual([]);
    }
    const aberrant = interpreterResultatPolling({
      ok: true,
      resultats: { ...RESULTATS, derniersArrives: 'pas une liste' },
    });
    expect(aberrant.ok).toBe(true);
    if (aberrant.ok) {
      expect(aberrant.resultats.derniersArrives).toEqual([]);
    }
  });
});

describe('appliquerResultatPollingResultats — fusion pure (calque appliquerResultatPolling)', () => {
  it('SUCCÈS : remplace l’état et EFFACE enEchec', () => {
    const precedent = { resultats: RESULTATS, enEchec: true };
    const nouveau = structuredClone(RESULTATS);
    expect(appliquerResultatPollingResultats(precedent, { ok: true, resultats: nouveau })).toEqual({
      resultats: nouveau,
      enEchec: false,
    });
  });

  it('ÉCHEC : CONSERVE le dernier résultat tel quel et POSE enEchec — jamais d’écran vide', () => {
    const precedent = { resultats: RESULTATS, enEchec: false };
    expect(appliquerResultatPollingResultats(precedent, { ok: false })).toEqual({
      resultats: RESULTATS,
      enEchec: true,
    });
  });

  it('épuisement total : échec SANS aucun état initial → squelettes + enEchec (resultats reste null)', () => {
    expect(appliquerResultatPollingResultats({ resultats: null, enEchec: false }, { ok: false })).toEqual({
      resultats: null,
      enEchec: true,
    });
  });
});

describe('CSS /resultats — témoin live et squelettes accessibles', () => {
  const css = readFileSync(fileURLToPath(new URL('./resultats.css', import.meta.url)), 'utf8');

  it('point pulsé : animation LENTE (≥ 2 s) coupée sous prefers-reduced-motion', () => {
    expect(css).toMatch(/animation:\s*resultats-point-pulse\s+2s/);
    const blocReduit = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(blocReduit).toMatch(/\.resultats-temoin-point\s*\{\s*animation:\s*none/);
  });

  it('squelettes : pulsation douce coupée sous prefers-reduced-motion', () => {
    expect(css).toMatch(/\.resultats-squelette-ligne/);
    const blocReduit = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(blocReduit).toMatch(/\.resultats-squelette-ligne\s*\{\s*animation:\s*none/);
  });

  it('mobile : l’épreuve des derniers arrivés reste VISIBLE et compacte — jamais un dossard nu', () => {
    const blocMobile = css.slice(css.indexOf('@media (max-width:640px)'));
    expect(blocMobile).toMatch(/\.resultats-arrive-epreuve\s*\{/);
    // Jamais masquée : display:none interdit sur le qualificatif du dossard.
    expect(css).not.toMatch(/resultats-arrive-epreuve[^}]*display:\s*none/);
  });
});
