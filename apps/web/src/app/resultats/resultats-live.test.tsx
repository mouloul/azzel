import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ResultatsPublic } from '@azzel/shared';

import {
  ResultatsLive,
  VueResultats,
  appliquerResultatPollingResultats,
  chiffresDossard,
  interpreterResultatPolling,
  type FiltresInitial,
} from './resultats-live';

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

// Story 9.5 — deux épreuves CONFIGURÉES aux catégories croisées : chaque
// filtre (dossard, épreuve, catégorie) isole des lignes distinctes, seuls et
// combinés.
const RESULTATS_FILTRES: ResultatsPublic = {
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
        heureDepart: '2027-03-26T09:30:00.000Z',
        configure: true,
        lignes: [
          { dossard: 301, rang: 1, tempsMs: 25 * 60_000, statut: 'arrivé', categorieAge: 'Senior' },
          { dossard: 302, rang: 2, tempsMs: 27 * 60_000, statut: 'arrivé', categorieAge: 'V1' },
        ],
        abandons: [],
      },
    ],
  },
  derniersArrives: [
    { dossard: 301, epreuveSlug: 'sprint', epreuveNom: 'Le Sprint — 5 km', tempsMs: 25 * 60_000 },
    { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 100 * 60_000 },
  ],
};

// Podium : rangs SERVIS ex æquo (1, 1, 3 — départage du contrat 7.1 déjà
// appliqué côté serveur) : la vue doit les relire TELS QUELS.
const RESULTATS_EX_AEQUO: ResultatsPublic = {
  classements: {
    genereA: '2027-03-26T10:00:05.000Z',
    fraicheur: '2027-03-26T10:00:02.000Z',
    libelle: 'Classement provisoire',
    epreuves: [
      {
        epreuveSlug: 'dix',
        epreuveNom: 'La Dix — 10 km',
        distanceKm: 10,
        heureDepart: '2027-03-26T08:00:00.000Z',
        configure: true,
        lignes: [
          { dossard: 11, rang: 1, tempsMs: 50 * 60_000, statut: 'arrivé', categorieAge: 'Senior' },
          { dossard: 12, rang: 1, tempsMs: 50 * 60_000, statut: 'arrivé', categorieAge: 'V1' },
          { dossard: 13, rang: 3, tempsMs: 55 * 60_000, statut: 'arrivé', categorieAge: 'V2' },
          { dossard: 14, rang: null, tempsMs: null, statut: 'en-course', categorieAge: 'Senior' },
        ],
        abandons: [],
      },
    ],
  },
  derniersArrives: [
    { dossard: 13, epreuveSlug: 'dix', epreuveNom: 'La Dix — 10 km', tempsMs: 55 * 60_000 },
  ],
};

/** Une ligne de tableau : ancre le dossard dans le CLASSEMENT (pas le podium ni les derniers). */
const dossardTableau = (dossard: number) =>
  `<td><span class="resultats-dossard">${dossard}</span></td>`;

/** Un item « Derniers arrivés » : ancre le dossard dans cette section seule. */
const dossardDerniers = (dossard: number) =>
  `<li class="resultats-arrive"><span class="resultats-dossard">${dossard}</span>`;

async function rendu(
  resultats: ResultatsPublic | null,
  enEchec = false,
  maintenant: Date | null = null,
  filtresInitial?: FiltresInitial,
): Promise<string> {
  const flux = await renderToReadableStream(
    <VueResultats
      resultats={resultats}
      enEchec={enEchec}
      maintenant={maintenant}
      filtresInitial={filtresInitial}
    />,
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

// Story 9.5 — recherche par dossard + filtres épreuve/catégorie + podium.
// L'environnement de test est node SANS DOM : les événements (frappe, clic)
// ne sont pas simulables. Les états filtrés sont rendus via la graine
// filtresInitial (calque dossardInitial de FormulaireAbandon) et les
// garanties de TRANSITION portées par le wiring (polling vs état, reset)
// sont épinglées par construction : source + forme de l'état polling.
describe('VueResultats — recherche, filtres et podium (story 9.5)', () => {
  it('recherche par dossard : ne retient que les lignes dont le dossard contient la saisie (l’épreuve sans correspondance disparaît)', async () => {
    const html = await rendu(RESULTATS_FILTRES, false, null, { saisieDossard: '3' });
    // « 3 » ne matche AUCUNE ligne de la Longue (201/204/205) : la section
    // entière disparaît, le Sprint garde ses deux lignes.
    expect(html).toContain(dossardTableau(301));
    expect(html).toContain(dossardTableau(302));
    expect(html).not.toContain(dossardTableau(201));
    expect(html).not.toContain(dossardTableau(204));
    expect(html).not.toContain(dossardTableau(205));
    expect(html).not.toContain('id="resultats-epreuve-longue"');
    // Des résultats existent : jamais le message « aucun dossard ».
    expect(html).not.toContain('Aucun dossard ne correspond');
  });

  it('recherche par dossard : s’applique AUSSI à « Derniers arrivés » — partiellement, puis section masquée si vide', async () => {
    const partiel = await rendu(RESULTATS_FILTRES, false, null, { saisieDossard: '30' });
    expect(partiel).toContain('Derniers arrivés');
    expect(partiel).toContain(dossardDerniers(301));
    expect(partiel).not.toContain(dossardDerniers(201));
    const vide = await rendu(RESULTATS_FILTRES, false, null, { saisieDossard: '4' });
    // « 4 » matche une ligne de classement (204) mais AUCUN dernier arrivé :
    // la section disparaît, le classement reste rendu.
    expect(vide).toContain(dossardTableau(204));
    expect(vide).not.toContain('Derniers arrivés');
    expect(vide).not.toContain('Aucun dossard ne correspond');
  });

  it('filtre d’épreuve SEUL : une seule section rendue, le select porte l’épreuve choisie', async () => {
    const html = await rendu(RESULTATS_FILTRES, false, null, { epreuveFiltre: 'sprint' });
    expect(html).toContain('id="resultats-epreuve-sprint"');
    expect(html).not.toContain('id="resultats-epreuve-longue"');
    expect(html).toContain('<option value="sprint" selected="">Le Sprint</option>');
    // Les DEUX épreuves restent proposées dans le select (changement possible).
    expect(html).toContain('<option value="longue">La Longue</option>');
    expect(html).not.toContain('Aucun dossard ne correspond');
  });

  it('filtre de catégorie SEUL : les lignes de la catégorie dans CHAQUE épreuve, les autres masquées', async () => {
    const html = await rendu(RESULTATS_FILTRES, false, null, { categorieFiltre: 'V1' });
    expect(html).toContain(dossardTableau(204));
    expect(html).toContain(dossardTableau(302));
    expect(html).not.toContain(dossardTableau(201));
    expect(html).not.toContain(dossardTableau(205));
    expect(html).not.toContain(dossardTableau(301));
    expect(html).toContain('id="resultats-epreuve-longue"');
    expect(html).toContain('id="resultats-epreuve-sprint"');
    expect(html).toContain('<option value="V1" selected="">V1</option>');
    // La catégorie ne s’applique PAS aux derniers arrivés (le contrat 7.1 ne
    // la porte pas) : ils restent rendus.
    expect(html).toContain('Derniers arrivés');
  });

  it('filtres épreuve × catégorie COMBINÉS : l’intersection seule', async () => {
    const html = await rendu(RESULTATS_FILTRES, false, null, {
      epreuveFiltre: 'longue',
      categorieFiltre: 'V1',
    });
    expect(html).toContain('id="resultats-epreuve-longue"');
    expect(html).not.toContain('id="resultats-epreuve-sprint"');
    expect(html).toContain(dossardTableau(204));
    expect(html).not.toContain(dossardTableau(201));
    expect(html).not.toContain(dossardTableau(205));
    // Derniers arrivés : filtrés par ÉPREUVE (la Longue seule), pas par
    // catégorie.
    expect(html).toContain(dossardDerniers(201));
    expect(html).not.toContain(dossardDerniers(301));
  });

  it('podium VISIBLE sans filtre : une liste « Premiers arrivés » par épreuve, rangs en toutes lettres', async () => {
    const html = await rendu(RESULTATS_FILTRES);
    expect((html.match(/aria-label="Premiers arrivés"/g) ?? []).length).toBe(2);
    expect(html).toContain('1ᵉʳ');
    expect(html).toContain('2ᵉ');
  });

  it('podium MASQUÉ dès qu’un filtre est actif — dossard, épreuve OU catégorie — même quand des lignes restent rendues', async () => {
    for (const filtres of [
      { saisieDossard: '3' },
      { epreuveFiltre: 'sprint' },
      { categorieFiltre: 'V1' },
    ]) {
      const html = await rendu(RESULTATS_FILTRES, false, null, filtres);
      // Des lignes de classement restent visibles : le masquage du podium
      // n’est pas une conséquence d’une page vide.
      expect(html).toContain('resultats-table');
      expect(html).not.toContain('resultats-podium');
      expect(html).not.toContain('aria-label="Premiers arrivés"');
      expect(html).not.toContain('1ᵉʳ');
    }
  });

  it('podium ex æquo SERVIS (rangs 1, 1, 3) : deux cartes « 1ᵉʳ », un « 3ᵉ », AUCUN recalcul côté vue', async () => {
    const html = await rendu(RESULTATS_EX_AEQUO);
    expect((html.match(/resultats-podium-carte/g) ?? []).length).toBe(3);
    // Ex æquo servi : DEUX « 1ᵉʳ ».
    expect((html.match(/1ᵉʳ/g) ?? []).length).toBe(2);
    // Le rang 3 servi reste « 3ᵉ » — un reclassement dense côté vue l’aurait
    // réécrit « 2ᵉ ».
    expect(html).toContain('3ᵉ');
    expect(html).not.toContain('2ᵉ');
    expect(html).toMatch(/<td class="resultats-mono">(<!-- -->)?3<\/td>/);
  });

  it('valeur devenue étrangère aux données (épreuve ou catégorie disparue au polling) : retombe sur « Toutes » sans erreur', async () => {
    const epreuveDisparue = await rendu(RESULTATS_FILTRES, false, null, {
      epreuveFiltre: 'disparue',
    });
    expect(epreuveDisparue).toContain('<option value="toutes" selected="">Toutes</option>');
    expect(epreuveDisparue).not.toContain('<option value="disparue"');
    // Retomber sur « toutes » = filtre INACTIF : classement complet, podium
    // visible, aucun message « aucun dossard ».
    expect(epreuveDisparue).toContain('id="resultats-epreuve-longue"');
    expect(epreuveDisparue).toContain('id="resultats-epreuve-sprint"');
    expect(epreuveDisparue).toContain('aria-label="Premiers arrivés"');
    expect(epreuveDisparue).not.toContain('Aucun dossard ne correspond');
    const categorieDisparue = await rendu(RESULTATS_FILTRES, false, null, {
      categorieFiltre: 'Z9',
    });
    expect(categorieDisparue).toContain('<option value="toutes" selected="">Toutes</option>');
    expect(categorieDisparue).toContain('aria-label="Premiers arrivés"');
    expect(categorieDisparue).not.toContain('Aucun dossard ne correspond');
  });

  it('un rafraîchissement ne vide pas la recherche : les contrôles sont pilotés par l’état filtres, le polling n’a AUCUN chemin vers eux', async () => {
    // (a) La saisie rendue vient de l’ÉTAT filtres (composant contrôlé) :
    // le payload `resultats` n’écrit jamais dans ces contrôles.
    const html = await rendu(RESULTATS_FILTRES, false, null, { saisieDossard: '30' });
    expect(html).toMatch(/id="resultats-recherche-dossard"[^>]*value="30"/);
    // (b) Le SEUL état que le polling écrit (fusion pure testée plus bas) ne
    // porte AUCUN champ filtre : un refresh ne peut structurellement pas
    // réécrire la saisie.
    const apresRefresh = appliquerResultatPollingResultats(
      { resultats: RESULTATS_FILTRES, enEchec: true },
      { ok: true, resultats: structuredClone(RESULTATS_FILTRES) },
    );
    expect(Object.keys(apresRefresh).sort()).toEqual(['enEchec', 'resultats']);
    // (c) VueResultats n’est jamais REMONTÉE au refresh (une key liée au
    // payload réinitialiserait l’état) — épinglé à la source.
    const source = readFileSync(fileURLToPath(new URL('./resultats-live.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/<VueResultats[^>]*resultats=\{etat\.resultats\}/);
    expect(source).not.toMatch(/<VueResultats[^>]*key=/);
  });

  it('« Effacer les filtres » : absent sans filtre, présent pour CHACUN des trois filtres, et remet les TROIS états à zéro', async () => {
    const sansFiltre = await rendu(RESULTATS_FILTRES);
    expect(sansFiltre).not.toContain('Effacer les filtres');
    for (const filtres of [
      { saisieDossard: '3' },
      { epreuveFiltre: 'sprint' },
      { categorieFiltre: 'V1' },
    ]) {
      expect(await rendu(RESULTATS_FILTRES, false, null, filtres)).toContain('Effacer les filtres');
    }
    // Le clic n’est pas simulable ici (node, pas de DOM) : le branchement du
    // bouton est épinglé à la source — remise à zéro des TROIS états.
    const source = readFileSync(fileURLToPath(new URL('./resultats-live.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/setSaisieDossard\(''\)/);
    expect(source).toMatch(/setEpreuveFiltre\(FILTRE_TOUTES\)/);
    expect(source).toMatch(/setCategorieFiltre\(FILTRE_TOUTES\)/);
  });

  it('anonymat strict (NFR-7) y compris podium et états filtrés : QUE des dossards, jamais un nom ni un contact', async () => {
    const complet = await rendu(RESULTATS_EX_AEQUO);
    const filtre = await rendu(RESULTATS_EX_AEQUO, false, null, { saisieDossard: '4' });
    for (const html of [complet, filtre]) {
      expect(html).not.toMatch(/jeton|prenom|first_name|last_name|email|photo|avatar/i);
      expect(html).toContain('resultats-dossard');
    }
    // Le podium complet porte bien trois cartes — l’assertion porte sur du
    // rendu réel, pas sur une page vide.
    expect((complet.match(/resultats-podium-carte/g) ?? []).length).toBe(3);
  });

  it('état vide sans partant : AUCUN formulaire de recherche — rien à chercher', async () => {
    const vide: ResultatsPublic = {
      classements: {
        ...RESULTATS_FILTRES.classements,
        fraicheur: null,
        epreuves: RESULTATS_FILTRES.classements.epreuves.map((epreuve) => ({
          ...epreuve,
          lignes: [],
          abandons: [],
        })),
      },
      derniersArrives: [],
    };
    const html = await rendu(vide);
    expect(html).toContain('Pas encore de partants');
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain('Retrouver un coureur');
    expect(html).not.toContain('id="resultats-recherche-dossard"');
    expect(html).not.toContain('id="resultats-filtre-epreuve"');
    expect(html).not.toContain('id="resultats-filtre-categorie"');
  });

  // Décision d’architecture (revue épopée 9, I5a) — comportement CONSERVÉ :
  // une épreuve sans heure de départ n’expose rien au classement ; le message
  // de recherche vide s’applique à la liste filtrée. Le dossard d’une telle
  // épreuve reste visible dans « Derniers arrivés » (cette liste n’est pas
  // un classement).
  it('épreuve sans heure de départ : rien au classement filtré, dossard visible dans « Derniers arrivés » (comportement conservé)', async () => {
    const html = await rendu(RESULTATS, false, null, { saisieDossard: '21' });
    expect(html).toContain('Aucun dossard ne correspond à cette recherche.');
    expect(html).toContain('Derniers arrivés');
    expect(html).toContain(dossardDerniers(221));
  });

  // Revue épopée 9 (I5b) : une catégorie portée uniquement par une épreuve
  // NON configurée ne peut rien afficher sous filtre — elle ne doit pas être
  // proposée dans le select (jamais une option sans effet).
  it('catégories proposées : uniquement celles des épreuves CONFIGURÉES (une catégorie d’une épreuve sans heure n’est pas une option)', async () => {
    const avecCategorieNonConfiguree: ResultatsPublic = {
      classements: {
        ...RESULTATS_FILTRES.classements,
        epreuves: [
          {
            ...RESULTATS_FILTRES.classements.epreuves[0]!,
            // La longue configurée ne porte NI V2 NI la catégorie témoin :
            // Senior et V1 seulement.
            lignes: [
              { dossard: 201, rang: 1, tempsMs: 100 * 60_000, statut: 'arrivé', categorieAge: 'Senior' },
              { dossard: 204, rang: null, tempsMs: null, statut: 'en-course', categorieAge: 'V1' },
            ],
            abandons: [],
          },
          {
            epreuveSlug: 'sprint',
            epreuveNom: 'Le Sprint — 5 km',
            distanceKm: 5,
            heureDepart: null,
            configure: false,
            lignes: [
              { dossard: 321, rang: null, tempsMs: null, statut: 'en-course', categorieAge: 'V2' },
            ],
            abandons: [],
          },
        ],
      },
      derniersArrives: [],
    };
    const html = await rendu(avecCategorieNonConfiguree);
    // Senior et V1 viennent des épreuves configurées ; V2 ne vit que dans
    // l’épreuve non configurée : absente du select.
    expect(html).toContain('<option value="Senior"');
    expect(html).toContain('<option value="V1"');
    expect(html).not.toContain('<option value="V2"');
  });

  // Revue épopée 9 (M4) : le champ contrôlé ne retient que les chiffres.
  it('chiffresDossard (pure) : retire tout non-chiffre — la saisie « 2a1b » filtre comme « 21 »', () => {
    expect(chiffresDossard('2a1b')).toBe('21');
    expect(chiffresDossard('abc')).toBe('');
    expect(chiffresDossard(' 204 ')).toBe('204');
    expect(chiffresDossard('20-4')).toBe('204');
    // Le onChange du champ passe par cette fonction (épinglé à la source :
    // node sans DOM, la frappe n’est pas simulable).
    const source = readFileSync(fileURLToPath(new URL('./resultats-live.tsx', import.meta.url)), 'utf8');
    expect(source).toMatch(/onSaisieDossard\(\s*chiffresDossard\(evenement\.target\.value\)\s*\)/);
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

  it('cartes de la story 9.5 au rayon carte du socle --az-rayon-md (revue 9, I6)', () => {
    const aucun = css.match(/\.resultats-aucun\s*\{[^}]*\}/)?.[0] ?? '';
    expect(aucun).toContain('border-radius:var(--az-rayon-md)');
    const podiumCarte = css.match(/\.resultats-podium-carte\s*\{[^}]*\}/)?.[0] ?? '';
    expect(podiumCarte).toContain('border-radius:var(--az-rayon-md)');
    // Le rayon sm (8 px) ne subsiste sur aucune des deux cartes.
    expect(aucun).not.toContain('az-rayon-sm');
    expect(podiumCarte).not.toContain('az-rayon-sm');
  });
});
