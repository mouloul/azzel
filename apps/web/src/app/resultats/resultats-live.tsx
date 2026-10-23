'use client';

import {
  formatLocalHeure,
  formaterDureeCourse,
  libelleEtatVide,
  prochaineHeureDepart,
  type ResultatsPublic,
} from '@azzel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { libellerFraicheurCourse } from '@/lib/course/fraicheur-course';

// Story 7.2 — résultats publics en direct (FR-16, SM-5, AD-7). Le serveur
// rend TOUT en SSR (lisible < 5 s sur 3G lent) ; ce composant n'est qu'un
// RAFRAÎCHISSEUR : polling GET /api/resultats toutes les 10 s, pause quand
// l'onglet est caché (visibilitychange, reprise immédiate au retour), JAMAIS
// deux requêtes simultanées (garde en vol). Réseau dégradé : le dernier état
// RESTE affiché, sa fraîcheur vieillit, un point « reconnexion… » discret
// apparaît — jamais d'écran vide. Anonymat strict : cette surface ne rend que
// des dossards, jamais un nom ni un contact.

const POLLING_MS = 10_000;
const HORLOGE_MS = 10_000;
/** < POLLING_MS : un tick ne part JAMAIS chevaucher le suivant. */
const TIMEOUT_FETCH_MS = 8_000;
/** Heure locale avant le montage client (calque boards course-live). */
const HEURE_ATTENTE = '--:--';
/** État vide pré-montage : l'heure locale n'est calculée qu'après montage. */
const ETAT_VIDE_ATTENTE = `Pas encore de partants — départ à ${HEURE_ATTENTE}`;

/** Statuts du contrat 7.1 en toutes lettres (registre vitrine, vouvoiement). */
function libelleStatut(statut: 'arrivé' | 'en-course' | 'abandonné'): string {
  if (statut === 'arrivé') {
    return 'Arrivé';
  }
  return statut === 'en-course' ? 'En course' : 'Abandonné';
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

/** Rendu pur (testé en SSR) : témoin live, fraîcheur, derniers arrivés, classements. */
export function VueResultats({
  resultats,
  enEchec,
  maintenant,
}: {
  resultats: ResultatsPublic | null;
  enEchec: boolean;
  /** Horloge client — null côté serveur : la fraîcheur initiale vit sur genereA. */
  maintenant: Date | null;
}) {
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
          heure configurée). */}
      {aucuneLigne ? <p className="resultats-vide">{libelleVide}</p> : null}

      <section className="resultats-derniers" aria-labelledby="titre-derniers-arrives">
        <h2 className="resultats-derniers-titre" id="titre-derniers-arrives">
          Derniers arrivés
        </h2>
        {derniersArrives.length === 0 ? (
          <p className="resultats-derniers-vide">Aucune arrivée pour le moment.</p>
        ) : (
          <ul className="resultats-derniers-liste">
            {derniersArrives.map((arrive) => (
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

      <div className="resultats-epreuves">
        {/* Le libellé réglementaire en toutes lettres fait partie du contrat
            servi (jamais « officiel », jamais « temps réel »). */}
        <p className="resultats-libelle">{classements.libelle}</p>
        {classements.epreuves.map((epreuve) => (
          <section
            className="resultats-epreuve"
            key={epreuve.epreuveSlug}
            aria-labelledby={`resultats-epreuve-${epreuve.epreuveSlug}`}
          >
            <h3
              className="resultats-epreuve-titre"
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
            {!epreuve.configure ? (
              <p className="resultats-epreuve-vide">
                Heure de départ non configurée — pas de classement pour cette épreuve.
              </p>
            ) : epreuve.lignes.length === 0 ? (
              <p className="resultats-epreuve-vide">Pas encore de partants.</p>
            ) : (
              <table className="resultats-table">
                <thead>
                  <tr>
                    <th scope="col">Rang</th>
                    <th scope="col">Dossard</th>
                    <th scope="col">Temps</th>
                    <th scope="col">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {epreuve.lignes.map((ligne) => (
                    <tr key={ligne.dossard}>
                      <td className="resultats-rang">{ligne.rang ?? '—'}</td>
                      <td>
                        <span className="resultats-dossard">{ligne.dossard}</span>
                      </td>
                      <td className="resultats-temps">
                        {ligne.tempsMs !== null ? formaterDureeCourse(ligne.tempsMs) : '—'}
                      </td>
                      <td className="resultats-statut">{libelleStatut(ligne.statut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {epreuve.abandons.length > 0 ? (
              <p className="resultats-abandons">Abandons : {epreuve.abandons.join(', ')}</p>
            ) : null}
          </section>
        ))}
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
