'use client';

import {
  CATEGORIES_AGE_CLASSEMENT,
  formatLocalHeure,
  formaterDureeCourse,
  libelleEtatVide,
  prochaineHeureDepart,
  type LigneClassement,
  type ResultatsPublic,
} from '@azzel/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { libellerFraicheurCourse } from '@/lib/course/fraicheur-course';

// Story 7.2 — résultats publics en direct (FR-16, SM-5, AD-7). Le serveur
// rend TOUT en SSR (lisible < 5 s sur 3G lent) ; ce composant n'est qu'un
// RAFRAÎCHISSEUR : polling GET /api/resultats toutes les 10 s, pause quand
// l'onglet est caché (visibilitychange, reprise immédiate au retour), JAMAIS
// deux requêtes simultanées (garde en vol). Réseau dégradé : le dernier état
// RESTE affiché, sa fraîcheur vieillit, un point « reconnexion… » discret
// apparaît — jamais d'écran vide. Anonymat strict : cette surface ne rend que
// des dossards, jamais un nom ni un contact.
//
// Story 9.5 — refonte de la mise en page sur le socle : recherche par dossard
// + filtres épreuve/catégorie (contrôles natifs étiquetés, visibles sans
// défilement sur téléphone), podium des premiers (les rangs ex æquo sont SERVIS
// prêts à l'afficher : AUCUN recalcul client — le filtre ne dérive jamais un
// classement, il masque des lignes), tableau dense dans un conteneur à
// défilement horizontal propre. L'état des filtres vit dans VueResultats :
// un rafraîchissement de polling ne les touche pas et ne fait pas clignoter
// la page (les lignes restent clés par dossard, seules les différences
// rejoignent le DOM).

const POLLING_MS = 10_000;
const HORLOGE_MS = 10_000;
/** < POLLING_MS : un tick ne part JAMAIS chevaucher le suivant. */
const TIMEOUT_FETCH_MS = 8_000;
/** Heure locale avant le montage client (calque boards course-live). */
const HEURE_ATTENTE = '--:--';
/** État vide pré-montage : l'heure locale n'est calculée qu'après montage. */
const ETAT_VIDE_ATTENTE = `Pas encore de partants — départ à ${HEURE_ATTENTE}`;

/** Valeur « sans filtre » des deux selects (épreuve, catégorie). */
const FILTRE_TOUTES = 'toutes';

/** Statuts du contrat 7.1 en toutes lettres (registre vitrine, vouvoiement). */
function libelleStatut(statut: 'arrivé' | 'en-course' | 'abandonné'): string {
  if (statut === 'arrivé') {
    return 'Arrivé';
  }
  return statut === 'en-course' ? 'En course' : 'Abandonné';
}

/** Nom court d'une épreuve (avant le tiret cadratin) : options compactes. */
function nomCourtEpreuve(nom: string): string {
  return nom.split(' — ')[0] ?? nom;
}

/** Chiffres d'une saisie : la recherche porte sur le numéro de dossard. */
function chiffresDossard(saisie: string): string {
  return saisie.replace(/\D+/g, '');
}

/** Rang de podium servi, en toutes lettres (ex æquo servi : deux « 1ᵉʳ »). */
function libellerRangPodium(rang: number): string {
  return rang === 1 ? '1ᵉʳ' : `${rang}ᵉ`;
}

/** État UI du rafraîchisseur : dernier état reçu + drapeau d'échec réseau. */
export interface EtatPolling {
  resultats: ResultatsPublic | null;
  enEchec: boolean;
}

/**
 * Fusion polling/échec (calque appliquerResultatPolling, pure testée branche
 * par branche) : un SUCCÈS remplace l'état et EFFACE enEchec ; un ÉCHEC
 * CONSERVE le dernier résultat tel quel et POSE enEchec — jamais d'écran
 * vide, jamais de figé présenté comme vivant (la fraîcheur portée par l'état
 * continue de vieillir au rendu).
 */
export function appliquerResultatPollingResultats(
  precedent: EtatPolling,
  resultat: { ok: true; resultats: ResultatsPublic } | { ok: false },
): EtatPolling {
  if (resultat.ok) {
    return { resultats: resultat.resultats, enEchec: false };
  }
  return { resultats: precedent.resultats, enEchec: true };
}

/**
 * Interprète le corps brut de GET /api/resultats (pure, calque
 * interpreterReponseEtat) : seul un payload { ok: true, resultats: non-null
 * objet, classements non-null à `epreuves` tableau dont chaque élément porte
 * `lignes` tableau } est accepté — toute dérive (ok:false, resultats
 * absent/null, classements absent/null/épaulé, epreuves ou lignes non
 * tableaux, payload non objet) → échec : le dernier état gagne, et
 * VueResultats ne peut JAMAIS planter sur un TypeError de forme. `lignes`
 * normalisé en [] si absent, `derniersArrives` normalisé en [] si non-tableau.
 */
export function interpreterResultatPolling(
  payload: unknown,
): { ok: true; resultats: ResultatsPublic } | { ok: false } {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false };
  }
  const candidat = payload as { ok?: unknown; resultats?: unknown };
  if (candidat.ok !== true) {
    return { ok: false };
  }
  if (typeof candidat.resultats !== 'object' || candidat.resultats === null) {
    return { ok: false };
  }
  const resultats = candidat.resultats as ResultatsPublic & {
    classements?: unknown;
    derniersArrives?: unknown;
  };
  if (
    typeof resultats.classements !== 'object' ||
    resultats.classements === null ||
    !Array.isArray(resultats.classements.epreuves) ||
    !resultats.classements.epreuves.every(
      (epreuve) =>
        typeof epreuve === 'object' &&
        epreuve !== null &&
        Array.isArray((epreuve as { lignes?: unknown }).lignes),
    )
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    resultats: {
      ...resultats,
      derniersArrives: Array.isArray(resultats.derniersArrives)
        ? resultats.derniersArrives
        : [],
    },
  };
}

/**
 * Tableau dense du socle, dans son conteneur à défilement horizontal : en
 * écran étroit la ZONE défile (focusable au clavier, annoncée « region »),
 * le tableau ne déborde jamais. Places et temps en chiffres monospace
 * alignés à droite (pile système, calque aa-parcours-accueil__ligne dd).
 */
function TableauClassement({
  lignes,
  idTitre,
  epreuveNom,
}: {
  lignes: readonly LigneClassement[];
  idTitre: string;
  epreuveNom: string;
}): ReactNode {
  return (
    <div
      className="resultats-defile"
      role="region"
      tabIndex={0}
      aria-label={`Classement de ${nomCourtEpreuve(epreuveNom)}`}
    >
      <table className="socle-table resultats-table" aria-labelledby={idTitre}>
        <thead>
          <tr>
            <th className="resultats-mono" scope="col">
              Rang
            </th>
            <th scope="col">Dossard</th>
            <th className="resultats-mono" scope="col">
              Temps
            </th>
            <th scope="col">Catégorie</th>
            <th scope="col">Statut</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.dossard}>
              <td className="resultats-mono">{ligne.rang ?? '—'}</td>
              <td>
                <span className="resultats-dossard">{ligne.dossard}</span>
              </td>
              <td className="resultats-mono">
                {ligne.tempsMs !== null ? formaterDureeCourse(ligne.tempsMs) : '—'}
              </td>
              <td>{ligne.categorieAge}</td>
              <td className="resultats-statut">{libelleStatut(ligne.statut)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Podium d'une épreuve : les PREMIERS arrivés tels que servis (lignes déjà
 * triées par rang, ex æquo inclus). Pure lecture du contrat — AUCUN rang,
 * temps ni ordre n'est recalculé côté vue.
 */
function Podium({ lignes }: { lignes: readonly LigneClassement[] }): ReactNode {
  const premiers = lignes
    .filter((ligne) => ligne.rang !== null && ligne.statut === 'arrivé')
    .slice(0, 3);
  if (premiers.length === 0) {
    return null;
  }
  return (
    <ol className="resultats-podium" aria-label="Premiers arrivés">
      {premiers.map((ligne) => (
        <li className="resultats-podium-carte" key={ligne.dossard}>
          <p className="resultats-podium-rang">{libellerRangPodium(ligne.rang ?? 0)}</p>
          <p className="resultats-podium-infos">
            <span className="resultats-dossard">{ligne.dossard}</span>
            <span className="resultats-mono resultats-podium-temps">
              {ligne.tempsMs !== null ? formaterDureeCourse(ligne.tempsMs) : '—'}
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Recherche par dossard + filtres épreuve/catégorie (story 9.5) : contrôles
 * natifs étiquetés au gabarit du socle (cibles ≥ 48 px via socle-champ, focus
 * 2 px), visibles sans défilement sur téléphone. L'état vit dans
 * VueResultats : un rafraîchissement de polling ne vide jamais la recherche.
 */
function BarreRecherche({
  saisieDossard,
  onSaisieDossard,
  slugEffectif,
  onEpreuve,
  epreuves,
  categorieEffective,
  onCategorie,
  categoriesPresentes,
  onReinitialiser,
  avecReinitialisation,
}: {
  saisieDossard: string;
  onSaisieDossard: (valeur: string) => void;
  slugEffectif: string;
  onEpreuve: (valeur: string) => void;
  epreuves: readonly { epreuveSlug: string; epreuveNom: string }[];
  categorieEffective: string;
  onCategorie: (valeur: string) => void;
  categoriesPresentes: readonly string[];
  onReinitialiser: () => void;
  avecReinitialisation: boolean;
}): ReactNode {
  return (
    <form
      className="resultats-recherche"
      role="search"
      onSubmit={(evenement) => evenement.preventDefault()}
    >
      <fieldset className="resultats-recherche-cadre">
        <legend className="resultats-recherche-legende">Retrouver un coureur</legend>
        <div className="resultats-recherche-champs">
          <div className="socle-champ resultats-recherche-dossard">
            <label className="socle-etiquette" htmlFor="resultats-recherche-dossard">
              Dossard
            </label>
            <input
              id="resultats-recherche-dossard"
              name="dossard"
              type="search"
              inputMode="numeric"
              autoComplete="off"
              placeholder="ex. 204"
              value={saisieDossard}
              onChange={(evenement) => onSaisieDossard(evenement.target.value)}
            />
          </div>
          <div className="socle-champ">
            <label className="socle-etiquette" htmlFor="resultats-filtre-epreuve">
              Épreuve
            </label>
            <select
              id="resultats-filtre-epreuve"
              name="epreuve"
              value={slugEffectif}
              onChange={(evenement) => onEpreuve(evenement.target.value)}
            >
              <option value={FILTRE_TOUTES}>Toutes</option>
              {epreuves.map((epreuve) => (
                <option key={epreuve.epreuveSlug} value={epreuve.epreuveSlug}>
                  {nomCourtEpreuve(epreuve.epreuveNom)}
                </option>
              ))}
            </select>
          </div>
          <div className="socle-champ">
            <label className="socle-etiquette" htmlFor="resultats-filtre-categorie">
              Catégorie
            </label>
            <select
              id="resultats-filtre-categorie"
              name="categorie"
              value={categorieEffective}
              onChange={(evenement) => onCategorie(evenement.target.value)}
            >
              <option value={FILTRE_TOUTES}>Toutes</option>
              {categoriesPresentes.map((categorie) => (
                <option key={categorie} value={categorie}>
                  {categorie}
                </option>
              ))}
            </select>
          </div>
          {avecReinitialisation ? (
            <button
              type="button"
              className="socle-action socle-action--contour resultats-recherche-effacer"
              onClick={onReinitialiser}
            >
              Effacer les filtres
            </button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}

/**
 * Graines des états filtres (calque dossardInitial de FormulaireAbandon) :
 * permettre au rendu serveur des états FILTRÉS d'être testé sans DOM. Valeurs
 * « sans filtre » par défaut — l'état reste interne au composant, le polling
 * ne le touche jamais.
 */
export interface FiltresInitial {
  saisieDossard?: string;
  epreuveFiltre?: string;
  categorieFiltre?: string;
}

/** Rendu pur (testé en SSR) : témoin live, fraîcheur, derniers arrivés, classements. */
export function VueResultats({
  resultats,
  enEchec,
  maintenant,
  filtresInitial,
}: {
  resultats: ResultatsPublic | null;
  enEchec: boolean;
  /** Horloge client — null côté serveur : la fraîcheur initiale vit sur genereA. */
  maintenant: Date | null;
  /** Semer l'état initial des filtres (tests) — sans effet après le montage. */
  filtresInitial?: FiltresInitial;
}) {
  // Recherche + filtres (story 9.5) : l'état vit côté client, indépendant du
  // polling — un rafraîchissement ne vide jamais la recherche en cours.
  const [saisieDossard, setSaisieDossard] = useState(filtresInitial?.saisieDossard ?? '');
  const [epreuveFiltre, setEpreuveFiltre] = useState<string>(
    filtresInitial?.epreuveFiltre ?? FILTRE_TOUTES,
  );
  const [categorieFiltre, setCategorieFiltre] = useState<string>(
    filtresInitial?.categorieFiltre ?? FILTRE_TOUTES,
  );

  // SSR dégradé (base indisponible à l'ouverture) : squelettes CALQUÉS sur la
  // mise en page finale — le premier polling en vol remplit la page.
  if (resultats === null) {
    return (
      <div className="resultats-live" aria-busy="true">
        <div className="resultats-entete">
          <p className="resultats-temoin">
            <span className="resultats-temoin-point" aria-hidden="true" />
            Résultats en direct
          </p>
          <p className="resultats-fraicheur">
            <span aria-hidden="true" suppressHydrationWarning>
              synchronisation…
            </span>
            {enEchec ? (
              <span className="resultats-reconnexion" role="status">
                {' · reconnexion…'}
              </span>
            ) : null}
          </p>
        </div>
        <div className="resultats-squelette" aria-hidden="true">
          <div className="resultats-squelette-bloc">
            <div className="resultats-squelette-ligne" style={{ width: '38%' }} />
            <div className="resultats-squelette-ligne" />
            <div className="resultats-squelette-ligne" style={{ width: '82%' }} />
          </div>
          <div className="resultats-squelette-bloc">
            <div className="resultats-squelette-ligne" style={{ width: '52%' }} />
            <div className="resultats-squelette-ligne" />
            <div className="resultats-squelette-ligne" style={{ width: '76%' }} />
            <div className="resultats-squelette-ligne" style={{ width: '64%' }} />
          </div>
        </div>
      </div>
    );
  }

  const { classements, derniersArrives } = resultats;
  const aucuneLigne = classements.epreuves.every((epreuve) => epreuve.lignes.length === 0);
  const horloge = maintenant ?? new Date(classements.genereA);
  // État vide : l'heure locale (prochain départ À VENIR) n'est calculée
  // qu'APRÈS montage — pré-montage, emplacement d'attente calque méta
  // épreuve : aucun flash au fuseau du serveur à l'hydratation.
  const prochaineDepart = prochaineHeureDepart(classements.epreuves, maintenant ?? undefined);
  const libelleVide =
    prochaineDepart === null
      ? libelleEtatVide(null)
      : maintenant === null
        ? ETAT_VIDE_ATTENTE
        : libelleEtatVide(prochaineDepart);

  // Filtres effectifs : une valeur devenue étrangère aux données (épreuve
  // disparue au polling suivant) retombe sur « toutes » — jamais un select
  // sans option correspondante, jamais une page vide sans explication.
  const dossardRecherche = chiffresDossard(saisieDossard);
  const slugsConnus = new Set(classements.epreuves.map((epreuve) => epreuve.epreuveSlug));
  const slugEffectif =
    epreuveFiltre !== FILTRE_TOUTES && slugsConnus.has(epreuveFiltre)
      ? epreuveFiltre
      : FILTRE_TOUTES;
  const categoriesPresentes = CATEGORIES_AGE_CLASSEMENT.filter((categorie) =>
    classements.epreuves.some((epreuve) =>
      epreuve.lignes.some((ligne) => ligne.categorieAge === categorie),
    ),
  );
  const categorieEffective =
    categorieFiltre !== FILTRE_TOUTES && categoriesPresentes.includes(categorieFiltre as never)
      ? categorieFiltre
      : FILTRE_TOUTES;
  const filtreActif =
    dossardRecherche !== '' ||
    slugEffectif !== FILTRE_TOUTES ||
    categorieEffective !== FILTRE_TOUTES;

  // Le filtre MASQUE des lignes servies, il ne les re-classe pas : les rangs
  // affichés restent ceux du classement complet (AD-7 — aucun recalcul client).
  const lignesFiltrees = (lignes: readonly LigneClassement[]): LigneClassement[] =>
    lignes.filter(
      (ligne) =>
        (dossardRecherche === '' || String(ligne.dossard).includes(dossardRecherche)) &&
        (categorieEffective === FILTRE_TOUTES || ligne.categorieAge === categorieEffective),
    );
  const epreuvesVisibles = classements.epreuves.filter(
    (epreuve) => slugEffectif === FILTRE_TOUTES || epreuve.epreuveSlug === slugEffectif,
  );
  const epreuvesARendre = epreuvesVisibles
    .map((epreuve) => ({
      epreuve,
      lignes: filtreActif ? lignesFiltrees(epreuve.lignes) : epreuve.lignes,
    }))
    .filter(({ epreuve, lignes }) =>
      filtreActif ? epreuve.configure && lignes.length > 0 : true,
    );
  const derniersFiltres = filtreActif
    ? derniersArrives.filter(
        (arrive) =>
          (slugEffectif === FILTRE_TOUTES || arrive.epreuveSlug === slugEffectif) &&
          (dossardRecherche === '' || String(arrive.dossard).includes(dossardRecherche)),
      )
    : derniersArrives;
  const derniersAAfficher = filtreActif ? derniersFiltres : derniersArrives;

  return (
    <div className="resultats-live">
      <div className="resultats-entete">
        <p className="resultats-temoin">
          <span className="resultats-temoin-point" aria-hidden="true" />
          Résultats en direct
        </p>
        <p className="resultats-fraicheur">
          {/* a11y + NFR : l'âge chiffré est aria-hidden et se met à jour en
              silence ; la zone role="status" n'existe que pour la TRANSITION
              réseau (calque course-live). */}
          <span className="resultats-fraicheur-age" aria-hidden="true" suppressHydrationWarning>
            {libellerFraicheurCourse(classements.fraicheur, horloge)}
          </span>
          {enEchec ? (
            <span className="resultats-reconnexion" role="status">
              {' · reconnexion…'}
            </span>
          ) : null}
        </p>
      </div>

      {/* État vide avant départ, verbatim : « Pas encore de partants —
          départ à HH:MM » en heure LOCALE après montage (emplacement
          d'attente pré-montage), JAMAIS un départ à 00:00 (texte neutre sans
          heure configurée). Les sections vivantes restent rendues dessous
          (« Aucune arrivée pour le moment. », libellé réglementaire) ;
          sans partant, rien à chercher : pas de formulaire. */}
      {aucuneLigne ? <p className="socle-carte resultats-vide">{libelleVide}</p> : null}
      {!aucuneLigne ? (
        <BarreRecherche
          saisieDossard={saisieDossard}
          onSaisieDossard={setSaisieDossard}
          slugEffectif={slugEffectif}
          onEpreuve={setEpreuveFiltre}
          epreuves={classements.epreuves}
          categorieEffective={categorieEffective}
          onCategorie={setCategorieFiltre}
          categoriesPresentes={categoriesPresentes}
          onReinitialiser={() => {
            setSaisieDossard('');
            setEpreuveFiltre(FILTRE_TOUTES);
            setCategorieFiltre(FILTRE_TOUTES);
          }}
          avecReinitialisation={filtreActif}
        />
      ) : null}

      {/* Derniers arrivés : la recherche filtre aussi cette liste (la
          catégorie ne s'y applique pas — le contrat ne la porte pas). Filtre
          actif sans correspondance : la section disparaît, le message des
          classements porte l'explication. */}
      {filtreActif && derniersFiltres.length === 0 ? null : (
        <section className="socle-carte resultats-derniers" aria-labelledby="titre-derniers-arrives">
          <header className="socle-entete">
            <h2 className="socle-entete-titre" id="titre-derniers-arrives">
              Derniers arrivés
            </h2>
          </header>
          {derniersAAfficher.length === 0 ? (
            <p className="resultats-derniers-vide">Aucune arrivée pour le moment.</p>
          ) : (
            <ul className="resultats-derniers-liste">
              {derniersAAfficher.map((arrive) => (
                <li className="resultats-arrive" key={`${arrive.epreuveSlug}-${arrive.dossard}`}>
                  <span className="resultats-dossard">{arrive.dossard}</span>
                  <span className="resultats-arrive-epreuve">{arrive.epreuveNom}</span>
                  <span className="resultats-arrive-temps">
                    {arrive.tempsMs !== null ? formaterDureeCourse(arrive.tempsMs) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="resultats-epreuves">
        {/* Le libellé réglementaire en toutes lettres fait partie du contrat
            servi (jamais « officiel », jamais « temps réel »). */}
        <h2 className="resultats-libelle">{classements.libelle}</h2>
        {filtreActif && epreuvesARendre.length === 0 ? (
          <p className="resultats-aucun">Aucun dossard ne correspond à cette recherche.</p>
        ) : (
          epreuvesARendre.map(({ epreuve, lignes }) => (
            <section
              className="socle-carte resultats-epreuve"
              key={epreuve.epreuveSlug}
              aria-labelledby={`resultats-epreuve-${epreuve.epreuveSlug}`}
            >
              <header className="socle-entete resultats-epreuve-entete">
                <h3
                  className="socle-entete-titre resultats-epreuve-titre"
                  id={`resultats-epreuve-${epreuve.epreuveSlug}`}
                >
                  {epreuve.epreuveNom}
                </h3>
                <p className="resultats-epreuve-meta">
                  {epreuve.distanceKm} km
                  {epreuve.heureDepart !== null
                    ? ` — départ à ${
                        maintenant === null ? HEURE_ATTENTE : formatLocalHeure(epreuve.heureDepart)
                      }`
                    : ''}
                </p>
              </header>
              {/* Podium : lecture pure des premiers SERVIS. Masqué dès qu'un
                  filtre est actif — un « podium » dérivé du filtre serait un
                  classement recalculé côté vue (interdit, AD-7). */}
              {!filtreActif ? <Podium lignes={lignes} /> : null}
              {!filtreActif && !epreuve.configure ? (
                <p className="resultats-epreuve-vide">
                  Heure de départ non configurée — pas de classement pour cette épreuve.
                </p>
              ) : !filtreActif && epreuve.lignes.length === 0 ? (
                <p className="resultats-epreuve-vide">Pas encore de partants.</p>
              ) : (
                <TableauClassement
                  lignes={lignes}
                  idTitre={`resultats-epreuve-${epreuve.epreuveSlug}`}
                  epreuveNom={epreuve.epreuveNom}
                />
              )}
              {epreuve.abandons.length > 0 ? (
                <p className="resultats-abandons">Abandons : {epreuve.abandons.join(', ')}</p>
              ) : null}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export function ResultatsLive({ initial }: { initial: ResultatsPublic | null }) {
  const [etat, setEtat] = useState<EtatPolling>({ resultats: initial, enEchec: false });
  // Horloge de rendu : null côté serveur, posée au montage — aucun libellé
  // calculé avec l'heure du serveur ne peut mentir à l'hydratation.
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  // Garde en vol : JAMAIS deux requêtes simultanées (un fetch lent ne se
  // superpose pas au tick suivant).
  const enVol = useRef(false);

  const rafraichir = useCallback(async () => {
    if (enVol.current) {
      return;
    }
    enVol.current = true;
    try {
      // Repli Safari ancien : sans AbortSignal.timeout, fetch SANS signal —
      // le garde en vol empêche seul toute requête simultanée.
      const signal =
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(TIMEOUT_FETCH_MS)
          : undefined;
      const response = await fetch('/api/resultats', { cache: 'no-store', signal });
      if (!response.ok) {
        setEtat((precedent) => appliquerResultatPollingResultats(precedent, { ok: false }));
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      setEtat((precedent) =>
        appliquerResultatPollingResultats(precedent, interpreterResultatPolling(payload)),
      );
    } catch {
      setEtat((precedent) => appliquerResultatPollingResultats(precedent, { ok: false }));
    } finally {
      enVol.current = false;
    }
  }, []);

  useEffect(() => {
    setMaintenant(new Date());
    // Onglet caché : polling ET horloge en pause (handlers no-op), reprise
    // IMMÉDIATE au retour (visibilitychange) puis rythme de 10 s. Sans état
    // initial (SSR dégradé) : premier rafraîchissement immédiat.
    const tick = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
      }
    };
    const poll = () => {
      if (!document.hidden) {
        void rafraichir();
      }
    };
    const auRetour = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
        void rafraichir();
      }
    };
    if (initial === null) {
      void rafraichir();
    }
    const horlogeId = window.setInterval(tick, HORLOGE_MS);
    const pollingId = window.setInterval(poll, POLLING_MS);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(horlogeId);
      window.clearInterval(pollingId);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [rafraichir, initial]);

  return (
    <VueResultats resultats={etat.resultats} enEchec={etat.enEchec} maintenant={maintenant} />
  );
}
