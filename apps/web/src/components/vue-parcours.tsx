'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { couleursDuTheme } from '@/components/carte-couleurs';
import type { PiloteCarte } from '@/components/carte-maplibre';
import { EXAGERATION, webglDisponible } from '@/modules/contenus/parcours/carte';
import {
  FOND_TOPO,
  FONDS_DISPONIBLES,
  attributionCourte,
  attributions,
} from '@/modules/contenus/parcours/fonds-carte';
import {
  BORNES_PENTE_PCT,
  ECART_REPERE_ARRIVEE_KM,
  LIBELLES_PALIERS,
  libelleCourtMarqueur,
  PALIERS,
  type ProfilEpreuve,
} from '@/modules/contenus/parcours/profil';
import {
  PALETTE_PENTE_VUE,
  VUE,
  echellesVue,
  graduationsAltitudeVue,
  pointLePlusProche,
  sMApresTouche,
  sMDepuisPointeur,
  segmentsVue,
} from '@/modules/contenus/parcours/profil-vue';
import { chargerTrace } from '@/modules/contenus/parcours/trace-client';

/* Vue du parcours de l'accueil — reprise du POC « carte 3D du parcours ».
 *
 * Le POC a été retenu pour son rendu : une bande de chiffres, la carte en
 * relief en grand, quelques commandes, puis le profil coloré par pente dont le
 * curseur suit le pointeur sur la carte. On en garde la composition ; ce qui
 * n'était qu'une démonstration (coureur « live » simulé, comparaison au MNT)
 * n'est pas repris, et le fond de carte est celui de la décision du
 * 2026-11-05 : OpenTopoMap seul, sans satellite (licence Esri non couverte).
 *
 * Rien ne pèse sur le chargement de l'accueil : la carte (moteur, tracé,
 * tuiles) n'est réclamée que quand cette section entre dans l'écran. Sans
 * WebGL, ou si le fond est injoignable, on le DIT et le profil reste là.
 */

const NBSP = ' ';
const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export interface StatsVue {
  distanceKm: number;
  denivelePositifM: number | null;
  deniveleNegatifM: number | null;
  altitudeMinM: number | null;
  altitudeMaxM: number | null;
}

type EtatCarte = 'attente' | 'chargement' | 'ouverte' | 'indisponible';

const BORNES_LEGENDE = {
  roulant: `moins de ${BORNES_PENTE_PCT.soutenu} %`,
  soutenu: `${BORNES_PENTE_PCT.soutenu} à ${BORNES_PENTE_PCT.raide} %`,
  raide: `${BORNES_PENTE_PCT.raide} à ${BORNES_PENTE_PCT.tresRaide} %`,
  'tres-raide': `${BORNES_PENTE_PCT.tresRaide} % et plus`,
} as const;

function lignesStats(stats: StatsVue): [string, string][] {
  const lignes: [string, string][] = [['Distance', `${formatKm.format(stats.distanceKm)}${NBSP}km`]];
  if (stats.denivelePositifM !== null) {
    lignes.push(['D+', `${formatM.format(stats.denivelePositifM)}${NBSP}m`]);
  }
  if (stats.deniveleNegatifM !== null) {
    lignes.push(['D−', `${formatM.format(stats.deniveleNegatifM)}${NBSP}m`]);
  }
  if (stats.altitudeMinM !== null && stats.altitudeMaxM !== null) {
    lignes.push([
      'Altitude',
      `${formatM.format(stats.altitudeMinM)}–${formatM.format(stats.altitudeMaxM)}${NBSP}m`,
    ]);
  }
  return lignes;
}

export function VueParcours({
  nom,
  slug,
  version,
  stats,
  profil,
}: {
  nom: string;
  slug: string;
  /** Version publiée du document : elle est dans l'URL du tracé, donc dans le cache. */
  version: number;
  stats: StatsVue;
  profil: ProfilEpreuve;
}) {
  const [etat, setEtat] = useState<EtatCarte>('attente');
  const [message, setMessage] = useState<string | null>(null);
  // Le satellite est le fond par défaut dès qu'il est disponible (vue du POC).
  const fondSatellite = FONDS_DISPONIBLES.find((f) => f.id === 'satellite') ?? null;
  const [fondActif, setFondActif] = useState<'topo' | 'satellite'>(
    fondSatellite === null ? 'topo' : 'satellite',
  );
  // Lu à l'ouverture seulement : changer de fond ne doit pas relancer l'observateur.
  const fondRef = useRef(fondActif);
  fondRef.current = fondActif;
  const [relief3d, setRelief3d] = useState(true);
  const [exageration, setExageration] = useState<number>(EXAGERATION.defaut);
  const [profilReplie, setProfilReplie] = useState(false);
  const [curseurSM, setCurseurSM] = useState<number | null>(null);
  const [sansObservateur, setSansObservateur] = useState(false);
  // Le curseur n'existe qu'une fois la page hydratée : servi tel quel, un
  // « slider » sans JavaScript serait atteignable au Tab mais ne ferait rien.
  const [interactif, setInteractif] = useState(false);
  useEffect(() => setInteractif(true), []);

  const racineRef = useRef<HTMLElement | null>(null);
  const toileRef = useRef<HTMLDivElement | null>(null);
  const piloteRef = useRef<PiloteCarte | null>(null);
  const idExageration = useId();
  const idProfil = useId();

  /* ------------------------------ carte ------------------------------ */

  const ouvrir = useCallback(async () => {
    const toile = toileRef.current;
    if (toile === null || piloteRef.current !== null) return;

    if (!webglDisponible(() => document.createElement('canvas'))) {
      setEtat('indisponible');
      setMessage(
        'Ce navigateur n’affiche pas de carte en relief (WebGL indisponible). Le profil du parcours reste donné ci-dessous.',
      );
      return;
    }

    setEtat('chargement');
    try {
      const [{ trace, reperes }, { ouvrirCarte }] = await Promise.all([
        chargerTrace(slug, version),
        import('@/components/carte-maplibre'),
      ]);
      const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      piloteRef.current = await ouvrirCarte({
        conteneur: toile,
        trace,
        couleurs: couleursDuTheme(),
        reperes,
        satellite: fondSatellite,
        satelliteInitial: fondRef.current === 'satellite',
        mouvementReduit,
      });
      setEtat('ouverte');
    } catch {
      setEtat('indisponible');
      setMessage(
        'La carte n’a pas pu se charger — fond de carte injoignable ou connexion interrompue. Le profil du parcours reste donné ci-dessous.',
      );
    }
  }, [slug, version, fondSatellite]);

  // La carte est réclamée quand la section entre dans l'écran, pas avant :
  // une visite qui ne descend jamais jusque-là ne paie ni le moteur (~800 Ko)
  // ni le tracé ni les tuiles. Un panneau masqué (l'autre épreuve) n'est pas
  // « visible » : il ne se charge qu'une fois choisi.
  useEffect(() => {
    const racine = racineRef.current;
    if (racine === null) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setSansObservateur(true);
      return undefined;
    }
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((entree) => entree.isIntersecting)) {
          observateur.disconnect();
          void ouvrir();
        }
      },
      { rootMargin: '200px 0px' },
    );
    observateur.observe(racine);
    return () => observateur.disconnect();
  }, [ouvrir]);

  useEffect(
    () => () => {
      piloteRef.current?.detruire();
      piloteRef.current = null;
    },
    [],
  );

  const basculerRelief = useCallback(() => {
    const actif = !relief3d;
    setRelief3d(actif);
    piloteRef.current?.definirRelief(actif, exageration);
  }, [exageration, relief3d]);

  const changerFond = useCallback((fond: 'topo' | 'satellite') => {
    setFondActif(fond);
    piloteRef.current?.definirFond(fond);
  }, []);

  const changerExageration = useCallback((valeur: number) => {
    setExageration(valeur);
    piloteRef.current?.definirExageration(valeur);
  }, []);

  /* ------------------------------ profil ----------------------------- */

  const echelles = useMemo(
    () => echellesVue(profil.distanceM, profil.altitudeMinM, profil.altitudeMaxM),
    [profil],
  );
  const segments = useMemo(() => segmentsVue(profil.points, echelles), [profil, echelles]);
  const grille = useMemo(
    () => graduationsAltitudeVue(echelles.amin, echelles.amax),
    [echelles],
  );
  const pointCurseur = useMemo(
    () => (curseurSM === null ? null : pointLePlusProche(profil.points, curseurSM)),
    [curseurSM, profil],
  );

  const placer = useCallback((sM: number | null) => {
    setCurseurSM(sM);
    piloteRef.current?.placerCurseur(sM);
  }, []);

  const surPointeur = useCallback(
    (evenement: PointerEvent<HTMLDivElement>) => {
      const cadre = evenement.currentTarget.getBoundingClientRect();
      placer(sMDepuisPointeur(evenement.clientX - cadre.left, cadre.width, profil.distanceM));
    },
    [placer, profil.distanceM],
  );

  const surTouche = useCallback(
    (evenement: KeyboardEvent<HTMLDivElement>) => {
      const suite = sMApresTouche(evenement.key, evenement.shiftKey, curseurSM, profil.distanceM);
      if (suite === undefined) return;
      evenement.preventDefault();
      placer(suite);
    },
    [curseurSM, placer, profil.distanceM],
  );

  const lectureCurseur =
    pointCurseur === null
      ? null
      : {
          km: `${(pointCurseur.sM / 1000).toFixed(2).replace('.', ',')}${NBSP}km`,
          altitude: `${formatM.format(pointCurseur.altitudeM)}${NBSP}m`,
          pente: `${Math.round(pointCurseur.pentePct)}${NBSP}%`,
          x: echelles.x(pointCurseur.sM),
          y: echelles.y(pointCurseur.altitudeM),
        };
  const boiteX =
    lectureCurseur === null
      ? 0
      : Math.min(VUE.largeur - VUE.droite - 124, Math.max(VUE.gauche, lectureCurseur.x - 62));

  const resume = `${formatKm.format(profil.distanceM / 1000)}${NBSP}km · +${formatM.format(profil.dplusM)}${NBSP}m`;

  return (
    <section className="vp" aria-label={`Parcours — ${nom}`} ref={racineRef}>
      <header className="vp__entete">
        <dl className="vp__stats">
          {lignesStats(stats).map(([libelle, valeur]) => (
            <div className="vp__stat" key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="vp__cadre">
        {/* Le conteneur existe dès le départ : MapLibre a besoin d'un élément
            déjà dans le document, et la hauteur est réservée par le CSS pour
            que l'ouverture ne fasse pas sauter la page. */}
        <div className="vp__toile" ref={toileRef} />
        {etat !== 'ouverte' ? (
          <div className="vp__voile" role="status">
            {etat === 'indisponible' ? (
              <p>{message}</p>
            ) : sansObservateur ? (
              <button className="socle-action" onClick={() => void ouvrir()} type="button">
                Afficher la carte du relief
              </button>
            ) : (
              <p>{etat === 'chargement' ? `Chargement de la carte de ${nom}…` : 'La carte du relief se charge à l’affichage de cette section.'}</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="vp__controles">
        <button
          aria-pressed={relief3d}
          className="vp__bouton"
          disabled={etat !== 'ouverte'}
          onClick={basculerRelief}
          type="button"
        >
          Vue 3D
        </button>
        {fondSatellite !== null ? (
          <>
            <button
              aria-pressed={fondActif === 'satellite'}
              className="vp__bouton"
              disabled={etat !== 'ouverte'}
              onClick={() => changerFond('satellite')}
              type="button"
            >
              Satellite
            </button>
            <button
              aria-pressed={fondActif === 'topo'}
              className="vp__bouton"
              disabled={etat !== 'ouverte'}
              onClick={() => changerFond('topo')}
              type="button"
            >
              Topo
            </button>
          </>
        ) : null}
        <label className="vp__reglage" htmlFor={idExageration}>
          <span>Relief ×</span>
          <input
            aria-valuetext={`${exageration.toFixed(1)} fois`}
            disabled={etat !== 'ouverte'}
            id={idExageration}
            max={EXAGERATION.max}
            min={EXAGERATION.min}
            onChange={(evenement) => changerExageration(Number(evenement.target.value))}
            step={EXAGERATION.pas}
            type="range"
            value={exageration}
          />
          <output htmlFor={idExageration}>{exageration.toFixed(1).replace('.', ',')}</output>
        </label>
      </div>

      <div className={`vp__profil${profilReplie ? ' vp__profil--replie' : ''}`}>
        <button
          aria-controls={idProfil}
          aria-expanded={!profilReplie}
          className="vp__entete-profil"
          onClick={() => setProfilReplie((replie) => !replie)}
          type="button"
        >
          <span aria-hidden="true" className="vp__chevron">
            ▼
          </span>
          <span>{profilReplie ? 'Afficher le profil' : 'Masquer le profil'}</span>
          <span className="vp__resume">{resume}</span>
        </button>

        <div hidden={profilReplie} id={idProfil}>
          {/* Curseur : pointeur ET clavier. Le SVG est décoratif pour un
              lecteur d'écran — tout ce qu'il dit est écrit juste dessous. */}
          <div
            className="vp__zone"
            onBlur={() => placer(null)}
            onKeyDown={surTouche}
            onPointerLeave={() => placer(null)}
            onPointerMove={surPointeur}
            {...(interactif
              ? {
                  'aria-label':
                    'Parcourir le profil : flèches pour avancer, Maj pour aller plus vite, Échap pour retirer le curseur',
                  'aria-orientation': 'horizontal' as const,
                  'aria-valuemax': Math.round(profil.distanceM / 100) / 10,
                  'aria-valuemin': 0,
                  'aria-valuenow': curseurSM === null ? 0 : Math.round(curseurSM / 100) / 10,
                  'aria-valuetext':
                    lectureCurseur === null
                      ? 'Aucun point sélectionné'
                      : `${lectureCurseur.km}, ${lectureCurseur.altitude}, pente ${lectureCurseur.pente}`,
                  role: 'slider',
                  tabIndex: 0,
                }
              : {})}
          >
            <svg
              aria-hidden="true"
              className="vp__svg"
              focusable="false"
              preserveAspectRatio="xMidYMid meet"
              viewBox={`0 0 ${VUE.largeur} ${VUE.hauteur}`}
            >
              {grille.map((altitude) => (
                <g key={altitude}>
                  <line className="vp__grille" x1={VUE.gauche} x2={VUE.largeur - VUE.droite} y1={echelles.y(altitude)} y2={echelles.y(altitude)} />
                  <text className="vp__axe" textAnchor="end" x={VUE.gauche - 8} y={echelles.y(altitude) + 4}>
                    {altitude} m
                  </text>
                </g>
              ))}

              {segments.map((segment, index) => (
                <g key={index}>
                  <path d={segment.aire} fill={segment.couleur} fillOpacity={0.22} />
                  <line
                    stroke={segment.couleur}
                    strokeLinecap="round"
                    strokeWidth={2.5}
                    x1={segment.x1}
                    x2={segment.x2}
                    y1={segment.y1}
                    y2={segment.y2}
                  />
                </g>
              ))}

              {profil.marqueurs.map((marqueur, index) => {
                const x = echelles.x(marqueur.sM);
                const y = echelles.y(marqueur.altitudeM ?? profil.altitudeMinM);
                const dernier = profil.marqueurs[profil.marqueurs.length - 1];
                const procheArrivee =
                  dernier !== undefined && (dernier.sM - marqueur.sM) / 1000 < ECART_REPERE_ARRIVEE_KM;
                const ancre =
                  index === 0
                    ? 'start'
                    : index === profil.marqueurs.length - 1 || procheArrivee
                      ? 'end'
                      : 'middle';
                const precedent = profil.marqueurs[index - 1];
                const kmSegment =
                  precedent !== undefined ? (marqueur.sM - precedent.sM) / 1000 : null;
                return (
                  <g key={marqueur.id}>
                    <line className="vp__repere-trait" x1={x} x2={x} y1={VUE.haut - 10} y2={echelles.yBase} />
                    <rect
                      className={index === 0 ? 'vp__repere vp__repere--depart' : 'vp__repere'}
                      height={10}
                      rx={2}
                      width={10}
                      x={x - 5}
                      y={y - 5}
                    />
                    <text className="vp__texte-fort" textAnchor={ancre} x={x} y={echelles.yBase + 20}>
                      {marqueur.kilometre !== null ? `${formatKm.format(marqueur.kilometre)} km` : ''}
                    </text>
                    <text className="vp__texte-doux" textAnchor={ancre} x={x} y={echelles.yBase + 36}>
                      <title>{marqueur.nom}</title>
                      {libelleCourtMarqueur(marqueur.nom)}
                    </text>
                    {kmSegment !== null && precedent !== undefined && marqueur.dplusSegmentAmontM !== null ? (
                      <text
                        className="vp__texte-doux"
                        textAnchor="middle"
                        x={(x + echelles.x(precedent.sM)) / 2}
                        y={VUE.haut - 18}
                      >
                        {`${formatKm.format(kmSegment)} km · +${formatM.format(marqueur.dplusSegmentAmontM)} m`}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {lectureCurseur !== null ? (
                <g>
                  <line className="vp__curseur-trait" x1={lectureCurseur.x} x2={lectureCurseur.x} y1={VUE.haut - 10} y2={echelles.yBase} />
                  <circle className="vp__curseur-point" cx={lectureCurseur.x} cy={lectureCurseur.y} r={5} />
                  <rect className="vp__bulle" height={34} rx={4} width={124} x={boiteX} y={VUE.haut - 46} />
                  <text className="vp__texte-fort" x={boiteX + 8} y={VUE.haut - 30}>
                    {`${lectureCurseur.km} · ${lectureCurseur.altitude}`}
                  </text>
                  <text className="vp__texte-doux" x={boiteX + 8} y={VUE.haut - 30} dy={14}>
                    {`pente ${lectureCurseur.pente}`}
                  </text>
                </g>
              ) : null}
            </svg>
          </div>

          <ul className="vp__legende">
            {PALIERS.map((palier, index) => (
              <li key={palier}>
                <span aria-hidden="true" className="vp__pastille" style={{ background: PALETTE_PENTE_VUE[index] }} />
                {LIBELLES_PALIERS[palier]} ({BORNES_LEGENDE[palier]})
              </li>
            ))}
          </ul>
          <p className="vp__synthese">
            {`${formatKm.format(profil.distanceM / 1000)}${NBSP}km, altitude ${formatM.format(profil.altitudeMinM)} à ${formatM.format(profil.altitudeMaxM)}${NBSP}m, ${formatM.format(profil.dplusM)}${NBSP}m de D+. Technicité : ${profil.parts
              .map((part) => `${LIBELLES_PALIERS[part.palier].toLowerCase()} ${Math.round(part.part * 100)}${NBSP}%`)
              .join(', ')} de la distance. Selon la pente, en montée comme en descente.`}
          </p>
        </div>
      </div>

      {/* FR-32 : attributions visibles en permanence, hors du canvas pour ne
          jamais recouvrir la carte ni être recouvertes (UX-DR-29). */}
      {etat === 'ouverte' ? (
        <ul className="vp__attributions">
          {attributions(fondActif === 'satellite' && fondSatellite !== null ? fondSatellite : FOND_TOPO).map((texte) => (
            <li key={texte}>{texte}</li>
          ))}
        </ul>
      ) : (
        <p className="vp__attributions">{attributionCourte(fondActif === 'satellite' && fondSatellite !== null ? fondSatellite : FOND_TOPO)}</p>
      )}
    </section>
  );
}
