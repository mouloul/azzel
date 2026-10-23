'use client';

import { libelleDerniereConnue, type PositionPublique, type TracePublique } from '@azzel/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

import { libellerFraicheurCourse } from '@/lib/course/fraicheur-course';

// Story 7.3 (FR-19, NFR-7, AD-7, budget vitrine) — carte publique anonyme de
// la course. PARE-CHemin-CRITIQUE : la section est FERMÉE par défaut, RIEN
// (lib, CSS, tuile, données) ne charge avant le clic « Afficher la carte » —
// Leaflet n'entre que par import dynamique (carte-leaflet.ts, chunk async).
// Au clic : squelette le temps du chargement, puis montage Leaflet (tracés
// par épreuve + pastilles dossard) et polling 10 s des positions, CARTE
// OUVERTE seulement (visibilitychange, garde en vol — calque ResultatsLive).
// Réseau dégradé : état conservé + « reconnexion… », jamais d'écran vide.
// Anonymat strict : cette surface ne rend que des dossards qualifiés par
// épreuve — jamais nom, contact ni photo.

const POLLING_MS = 10_000;
const HORLOGE_MS = 10_000;
/** < POLLING_MS : un tick ne part JAMAIS chevaucher le suivant. */
const TIMEOUT_FETCH_MS = 8_000;

/** État vide doux (verbatim spec) : jamais inquiétant, les résultats parlent. */
export const LIBELLE_SANS_POSITION = 'Aucune position partagée — les résultats racontent la course';

/** Fond de carte en échec : sobre, la liste texte reste le canal de secours. */
export const LIBELLE_TUILES_ECHEC =
  'Les fonds de carte ne se chargent pas — les positions restent lisibles ci-dessous.';

/** Vue par défaut sans aucune donnée : la région de la course (public). */
const CENTRE_DEFAUT: [number, number] = [36.55, 4.35];
const ZOOM_DEFAUT = 11;

type EtatCarte = 'fermee' | 'chargement' | 'ouverte' | 'echec';

/**
 * Revue 7.3 — garde par ITEM du contrat public : dossard entier 1–9999,
 * lat/lon nombres finis dans les bornes GPS, capteA chaîne, estompée booléenne.
 * UN seul item pourri → le payload ENTIER est refusé ({ok:false}) : le dernier
 * état gagne, le rendu ne peut JAMAIS planter ni afficher une position folle.
 */
function estPositionPubliqueValide(valeur: unknown): boolean {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    Number.isInteger(candidat.dossard) &&
    (candidat.dossard as number) >= 1 &&
    (candidat.dossard as number) <= 9999 &&
    typeof candidat.lat === 'number' &&
    Number.isFinite(candidat.lat) &&
    candidat.lat >= -90 &&
    candidat.lat <= 90 &&
    typeof candidat.lon === 'number' &&
    Number.isFinite(candidat.lon) &&
    candidat.lon >= -180 &&
    candidat.lon <= 180 &&
    typeof candidat.capteA === 'string' &&
    typeof candidat['estompée'] === 'boolean'
  );
}

/** Garde par ITEM de trace : slug/nom chaînes, points objets lat/lon finis. */
function estTracePubliqueValide(valeur: unknown): boolean {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    typeof candidat.epreuveSlug === 'string' &&
    candidat.epreuveSlug.length > 0 &&
    typeof candidat.epreuveNom === 'string' &&
    Array.isArray(candidat.points) &&
    candidat.points.every(
      (point) =>
        typeof point === 'object' &&
        point !== null &&
        typeof (point as Record<string, unknown>).lat === 'number' &&
        Number.isFinite((point as Record<string, unknown>).lat) &&
        typeof (point as Record<string, unknown>).lon === 'number' &&
        Number.isFinite((point as Record<string, unknown>).lon),
    )
  );
}

/**
 * Interprète le corps brut de GET /api/carte-positions (pure, calque
 * interpreterResultatPolling) : seul un payload { ok: true, positions TABLEAU
 * dont CHAQUE item passe la garde, genereA ISO } est accepté — toute dérive →
 * échec, le dernier état gagne et le rendu ne peut JAMAIS planter.
 */
export function interpreterPayloadPositions(
  payload: unknown,
): { ok: true; positions: PositionPublique[]; genereA: string } | { ok: false } {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false };
  }
  const candidat = payload as { ok?: unknown; positions?: unknown; genereA?: unknown };
  if (
    candidat.ok !== true ||
    !Array.isArray(candidat.positions) ||
    !candidat.positions.every(estPositionPubliqueValide)
  ) {
    return { ok: false };
  }
  if (typeof candidat.genereA !== 'string' || Number.isNaN(Date.parse(candidat.genereA))) {
    return { ok: false };
  }
  return { ok: true, positions: candidat.positions as PositionPublique[], genereA: candidat.genereA };
}

/**
 * Interprète le corps brut de GET /api/carte-trace (pure) : { ok: true,
 * traces tableau dont chaque item passe la garde } sinon échec — les tracés
 * ratés n'empêchent jamais la carte.
 */
export function interpreterPayloadTraces(
  payload: unknown,
): { ok: true; traces: TracePublique[] } | { ok: false } {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false };
  }
  const candidat = payload as { ok?: unknown; traces?: unknown };
  if (
    candidat.ok !== true ||
    !Array.isArray(candidat.traces) ||
    !candidat.traces.every(estTracePubliqueValide)
  ) {
    return { ok: false };
  }
  return { ok: true, traces: candidat.traces as TracePublique[] };
}

/** Contenu de pastille : dossard seul, ou « dernière position connue » si estompée. */
export function libellePastille(position: PositionPublique, maintenant: Date): string {
  if (position.estompée) {
    return `Dernière position connue ${libelleDerniereConnue(position.capteA, maintenant)}`;
  }
  return `${position.dossard} — ${position.epreuveNom}`;
}

/**
 * Revue 7.3 — ligne de la liste texte ACCESSIBLE (clavier/lecteur d'écran,
 * secours quand les tuiles ne chargent pas) : dossard + épreuve + âge, l'estompée
 * dite en toutes lettres. Pure, testée.
 */
export function libelleLignePosition(position: PositionPublique, maintenant: Date): string {
  const age = libelleDerniereConnue(position.capteA, maintenant);
  return `${position.dossard} — ${position.epreuveNom} — ${
    position.estompée ? `dernière position connue ${age}` : age
  }`;
}

/**
 * Timeout TOUJOURS armé via AbortController + setTimeout (revue 7.3 : repli
 * natif quand AbortSignal.timeout manque — un fetch pendu ne bloque JAMAIS la
 * garde en vol au-delà de TIMEOUT_FETCH_MS).
 */
async function chargerJson(url: string): Promise<unknown> {
  const controleur = new AbortController();
  const minuteur = window.setTimeout(() => controleur.abort(), TIMEOUT_FETCH_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controleur.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(minuteur);
  }
}

export function CarteCourse(): ReactNode {
  const [etat, setEtat] = useState<EtatCarte>('fermee');
  const [positions, setPositions] = useState<PositionPublique[] | null>(null);
  const [genereA, setGenereA] = useState<string | null>(null);
  const [traces, setTraces] = useState<TracePublique[] | null>(null);
  const [enEchecPolling, setEnEchecPolling] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  const [tuilesEnEchec, setTuilesEnEchec] = useState(false);

  // Leaflet et la carte ne vivent QUE dans les refs : aucun rendu dépend de
  // l'instance, le démontage propre (map.remove) se fait dans l'effet.
  const feuilleRef = useRef<typeof import('leaflet') | null>(null);
  const carteRef = useRef<LeafletMap | null>(null);
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const pastillesRef = useRef(new Map<string, LeafletMarker>());
  const enVolRef = useRef(false);
  /** Positions du PREMIER chargement : bornes du cadrage initial uniquement. */
  const positionsInitialesRef = useRef<PositionPublique[] | null>(null);
  /** Compteur d'erreurs de tuiles : au-delà de 3, message sobre (tuiles KO). */
  const tuilesErreursRef = useRef(0);

  const rafraichirPositions = useCallback(async () => {
    if (enVolRef.current) {
      return;
    }
    enVolRef.current = true;
    try {
      const payload: unknown = await chargerJson('/api/carte-positions').catch(() => null);
      const resultat =
        payload === null ? ({ ok: false } as const) : interpreterPayloadPositions(payload);
      if (resultat.ok) {
        setPositions(resultat.positions);
        setGenereA(resultat.genereA);
        setEnEchecPolling(false);
      } else {
        // Réseau KO : état conservé (calque ResultatsLive), jamais d'écran vide.
        setEnEchecPolling(true);
      }
    } finally {
      enVolRef.current = false;
    }
  }, []);

  const ouvrir = useCallback(async () => {
    setEtat('chargement');
    // Réouverture propre : les compteurs d'échec de tuiles repartent à zéro.
    tuilesErreursRef.current = 0;
    setTuilesEnEchec(false);
    try {
      // Import dynamique : Leaflet + son CSS n'entrent QUE ici (chunk async).
      const feuille = (await import('./carte-leaflet')).default;
      feuilleRef.current = feuille;
      const [payloadPositions, payloadTraces] = await Promise.all([
        chargerJson('/api/carte-positions').catch(() => null),
        chargerJson('/api/carte-trace').catch(() => null),
      ]);
      const resultatPositions =
        payloadPositions === null
          ? ({ ok: false } as const)
          : interpreterPayloadPositions(payloadPositions);
      const resultatTraces =
        payloadTraces === null ? ({ ok: false } as const) : interpreterPayloadTraces(payloadTraces);
      // Échec TOTAL seul (lib ok, les deux données KO) : message sobre + réessai.
      if (!resultatPositions.ok && !resultatTraces.ok) {
        setEtat('echec');
        return;
      }
      setPositions(resultatPositions.ok ? resultatPositions.positions : null);
      positionsInitialesRef.current = resultatPositions.ok ? resultatPositions.positions : null;
      setGenereA(resultatPositions.ok ? resultatPositions.genereA : null);
      setTraces(resultatTraces.ok ? resultatTraces.traces : null);
      setEnEchecPolling(!resultatPositions.ok);
      setEtat('ouverte');
    } catch {
      // Échec lib/réseau : sobre, réessayable — jamais d'erreur brute.
      setEtat('echec');
    }
  }, []);

  /**
   * Revue 7.3 — fermeture (« Masquer la carte ») : le simple changement d'état
   * fait tourner les cleanups des effets (polling SUSPENDU, carte retirée via
   * map.remove, pastilles vidées) ; la réouverture repasse par ouvrir() qui
   * recharge données et montage — jamais d'état fantôme.
   */
  const fermer = useCallback(() => {
    setEtat('fermee');
  }, []);

  // Montage de la carte (UNE fois par ouverture) : tuiles OSM ATTRIBUÉES,
  // polylines par épreuve, cadre sur les données du PREMIER chargement,
  // démontage propre (remove + cleanup des pastilles). AUCUNE donnée vivante
  // dans les dépendances : le polling ne démonte JAMAIS la carte, les
  // pastilles se synchronisent à part.
  useEffect(() => {
    if (etat !== 'ouverte') {
      return;
    }
    const feuille = feuilleRef.current;
    const conteneur = conteneurRef.current;
    if (feuille === null || conteneur === null || carteRef.current !== null) {
      return;
    }
    const carte = feuille.map(conteneur, { attributionControl: true });
    // Revue 7.3 — tuiles KO : au-delà de 3 erreurs, message sobre (la liste
    // texte reste le canal lisible) ; jamais d'écran d'erreur brutal.
    carte.on('tileerror', () => {
      tuilesErreursRef.current += 1;
      if (tuilesErreursRef.current > 3) {
        setTuilesEnEchec(true);
      }
    });
    feuille
      .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a>',
      })
      .addTo(carte);
    const bornes: [number, number][] = [];
    const tracés = traces ?? [];
    for (const trace of tracés) {
      if (trace.points.length === 0) {
        continue;
      }
      feuille
        .polyline(
          trace.points.map((point) => [point.lat, point.lon] as [number, number]),
          { className: 'carte-trace', weight: 3, interactive: false },
        )
        .addTo(carte);
      bornes.push([trace.points[0]!.lat, trace.points[0]!.lon]);
      bornes.push([trace.points[trace.points.length - 1]!.lat, trace.points[trace.points.length - 1]!.lon]);
    }
    for (const position of positionsInitialesRef.current ?? []) {
      bornes.push([position.lat, position.lon]);
    }
    // Cadrage : bornes multiples → fitBounds ; UNE seule borne (revue 7.3 :
    // tracé à un point, position unique sans tracé) → setView au zoom défaut —
    // fitBounds sur un point zoomerait au maximum, illisible ; rien → région.
    const borneUnique = bornes[0];
    if (borneUnique !== undefined && bornes.length === 1) {
      carte.setView(borneUnique, ZOOM_DEFAUT);
    } else if (bornes.length > 1) {
      carte.fitBounds(feuille.latLngBounds(bornes).pad(0.15));
    } else {
      carte.setView(CENTRE_DEFAUT, ZOOM_DEFAUT);
    }
    carteRef.current = carte;
    return () => {
      carte.remove();
      carteRef.current = null;
      pastillesRef.current.clear();
    };
  }, [etat, traces]);

  // Synchronisation des pastilles : diff par (épreuve, dossard) — maj de
  // position/icône/infobulle, ajout des nouveaux, retrait des disparus.
  // L'ESTOMPÉE et son libellé sont recalculés à chaque horloge (10 s).
  useEffect(() => {
    if (etat !== 'ouverte') {
      return;
    }
    const feuille = feuilleRef.current;
    const carte = carteRef.current;
    if (feuille === null || carte === null || positions === null) {
      return;
    }
    const horloge = maintenant ?? (genereA !== null ? new Date(genereA) : new Date());
    const vues = new Set<string>();
    for (const position of positions) {
      const cle = `${position.epreuveSlug}#${position.dossard}`;
      vues.add(cle);
      const libelle = libellePastille(position, horloge);
      const icone = feuille.divIcon({
        className: 'carte-pastille-ancre',
        html: `<span class="carte-pastille${position.estompée ? ' carte-pastille--estompee' : ''}">${position.dossard}</span>`,
        // Taille = .carte-pastille-ancre CSS, ancre au CENTRE (calque CSS).
        iconSize: [44, 26],
        iconAnchor: [22, 13],
      });
      const existante = pastillesRef.current.get(cle);
      if (existante !== undefined) {
        existante.setLatLng([position.lat, position.lon]);
        existante.setIcon(icone);
        existante.setTooltipContent(libelle);
        continue;
      }
      const pastille = feuille
        .marker([position.lat, position.lon], { icon: icone, keyboard: false })
        .addTo(carte);
      pastille.bindTooltip(libelle, { direction: 'top', offset: [0, -6] });
      pastillesRef.current.set(cle, pastille);
    }
    for (const [cle, pastille] of pastillesRef.current) {
      if (!vues.has(cle)) {
        pastille.remove();
        pastillesRef.current.delete(cle);
      }
    }
  }, [etat, positions, maintenant, genereA]);

  // Polling 10 s des positions, CARTE OUVERTE seulement : onglet caché =
  // pause (handlers no-op), retour = reprise immédiate ; horloge de rendu pour
  // les libellés « il y a X ».
  useEffect(() => {
    if (etat !== 'ouverte') {
      return;
    }
    setMaintenant(new Date());
    const tick = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
      }
    };
    const poll = () => {
      if (!document.hidden) {
        void rafraichirPositions();
      }
    };
    const auRetour = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
        void rafraichirPositions();
      }
    };
    const horlogeId = window.setInterval(tick, HORLOGE_MS);
    const pollingId = window.setInterval(poll, POLLING_MS);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(horlogeId);
      window.clearInterval(pollingId);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [etat, rafraichirPositions]);

  return (
    <section className="carte-course" aria-labelledby="titre-carte-course">
      <h2 className="carte-course-titre" id="titre-carte-course">
        Carte de la course
      </h2>
      {etat === 'fermee' ? (
        <>
          <p className="carte-course-texte">
            Les dossards des coureurs qui partagent leur position, sur les tracés
            des épreuves. La carte ne se charge qu’après votre clic — le reste de la
            page reste léger.
          </p>
          <button
            type="button"
            className="btn-action carte-course-bouton"
            aria-expanded="false"
            aria-controls="carte-course-conteneur"
            onClick={() => void ouvrir()}
          >
            Afficher la carte
          </button>
        </>
      ) : null}
      {etat === 'chargement' ? (
        <div className="carte-course-squelette" aria-busy="true" role="status" id="carte-course-conteneur">
          <p className="carte-course-chargement">Chargement de la carte…</p>
        </div>
      ) : null}
      {etat === 'echec' ? (
        <div className="carte-course-echec" id="carte-course-conteneur">
          <p className="carte-course-echec-message">
            La carte n’a pas pu être chargée.
          </p>
          <button
            type="button"
            className="btn-action carte-course-bouton"
            onClick={() => void ouvrir()}
          >
            Réessayer
          </button>
        </div>
      ) : null}
      {etat === 'ouverte' ? (
        <div className="carte-course-ouverte" id="carte-course-conteneur">
          <div className="carte-course-barre">
            <p className="carte-course-meta">
              <span className="carte-course-fraicheur" aria-hidden="true" suppressHydrationWarning>
                {genereA !== null && maintenant !== null
                  ? libellerFraicheurCourse(genereA, maintenant)
                  : ''}
              </span>
              {enEchecPolling ? (
                <span className="carte-course-reconnexion" role="status">
                  {' · reconnexion…'}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className="carte-course-masquer"
              aria-expanded="true"
              aria-controls="carte-course-conteneur"
              onClick={fermer}
            >
              Masquer la carte
            </button>
          </div>
          {tuilesEnEchec ? (
            <p className="carte-course-tuiles" role="status">
              {LIBELLE_TUILES_ECHEC}
            </p>
          ) : null}
          {/* Le conteneur impératif de Leaflet : monté par l'effet, vidé par
              map.remove() au démontage — React n'écrit JAMAIS dedans. */}
          <div
            className="carte-course-carte"
            ref={conteneurRef}
            role="application"
            aria-label="Carte des positions et des tracés de la course"
          />
          {positions !== null && positions.length === 0 ? (
            <p className="carte-course-vide">{LIBELLE_SANS_POSITION}</p>
          ) : null}
          {positions === null ? (
            <p className="carte-course-vide">Les positions tardent à arriver.</p>
          ) : null}
          {/* Revue 7.3 — liste texte ACCESSIBLE : la carte n'est plus le seul
              canal (clavier, lecteur d'écran, tuiles KO). Dossard qualifié par
              épreuve + âge, estompée dite en toutes lettres. */}
          {positions !== null && positions.length > 0 ? (
            <ul className="carte-course-liste" aria-label="Dernières positions connues par dossard">
              {positions.map((position) => (
                <li
                  className="carte-course-liste-ligne"
                  key={`${position.epreuveSlug}#${position.dossard}`}
                >
                  {libelleLignePosition(
                    position,
                    maintenant ?? (genereA !== null ? new Date(genereA) : new Date()),
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="carte-course-legende">
            Pastilles : dossards des coureurs ayant activé le partage GPS. Pastilles
            estompées : dernière position connue il y a plus d’une heure.
          </p>
        </div>
      ) : null}
    </section>
  );
}
