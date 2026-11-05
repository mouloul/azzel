/* Story 11.3 — pilote MapLibre de la carte du parcours.
 *
 * SEUL fichier de l'application qui importe maplibre-gl. Il n'est jamais
 * importé statiquement : `carte-parcours.tsx` le charge par `await import()`
 * APRÈS un geste explicite de l'utilisateur. C'est ce qui tient NFR-13 — le
 * moteur pèse plus que tout le reste de la vitrine réunie — et c'est le même
 * motif que `carte-leaflet.ts` sur /resultats.
 *
 * Il expose une façade minuscule (`ouvrirCarte`) pour que l'île React n'ait
 * aucun type MapLibre dans sa signature, et puisse donc rester légère.
 */

import maplibregl, { type Map as CarteMapLibre, type Marker } from 'maplibre-gl';

// Feuille de style du moteur (commandes, échelle, messages de gestes). Importée
// ICI et non dans la page : ce module n'est chargé qu'à l'ouverture de la carte,
// la feuille ne pèse donc jamais sur le premier rendu. Sans elle, les commandes
// s'affichent en texte brut par-dessus la page.
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  CAMERA_2D,
  CAMERA_3D,
  DUREE_TRANSITION_MS,
  EXAGERATION,
  IDS,
  MARGE_CADRAGE,
  emprise,
  indexDepuisDistance,
  specificationStyle,
  type CouleursTrace,
  type TraceCarte,
} from '@/modules/contenus/parcours/carte';
import { FOND_TOPO, type SourceTuiles } from '@/modules/contenus/parcours/fonds-carte';

export interface OptionsCarte {
  conteneur: HTMLElement;
  trace: TraceCarte;
  couleurs: CouleursTrace;
  /** Points de passage à marquer, dans l'ordre du parcours. */
  reperes: readonly {
    id: string;
    nom: string;
    lon: number;
    lat: number;
    libelle: string;
  }[];
  /** Fond satellite disponible (clé fournie), sinon null. */
  satellite?: SourceTuiles | null;
  /** Ouvrir directement sur le satellite. */
  satelliteInitial?: boolean;
  /** `prefers-reduced-motion` : les transitions de caméra deviennent instantanées. */
  mouvementReduit: boolean;
}

/** Ce que l'île React peut piloter, sans jamais toucher à MapLibre. */
export interface PiloteCarte {
  definirRelief(actif: boolean, exageration: number): void;
  definirExageration(exageration: number): void;
  definirFond(fond: 'topo' | 'satellite'): void;
  placerCurseur(sM: number | null): void;
  recadrer(): void;
  detruire(): void;
}

export async function ouvrirCarte(options: OptionsCarte): Promise<PiloteCarte> {
  const { conteneur, trace, couleurs, reperes, mouvementReduit } = options;
  const satellite = options.satellite ?? null;
  const satelliteInitial = satellite !== null && options.satelliteInitial === true;
  const depart = trace.points[0];
  if (depart === undefined) throw new Error('tracé vide');

  const carte: CarteMapLibre = new maplibregl.Map({
    container: conteneur,
    style: specificationStyle(trace.points, couleurs, FOND_TOPO, satellite, satelliteInitial) as never,
    center: [depart[0], depart[1]],
    zoom: 12,
    pitch: CAMERA_3D.pitch,
    bearing: CAMERA_3D.bearing,
    maxPitch: CAMERA_3D.pitchMax,
    // Le bloc d'attributions est rendu par l'île, en dehors du canvas : il
    // doit rester lisible et ne jamais se superposer au contenu (UX-DR-29).
    attributionControl: false,
    // Le moteur ne doit pas capter la molette de la page : sur mobile comme
    // au pavé tactile, l'utilisateur fait défiler la page bien plus souvent
    // qu'il ne zoome. Le zoom reste accessible par pincement et par les
    // boutons du NavigationControl.
    scrollZoom: false,
    cooperativeGestures: true,
  });

  carte.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  carte.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));

  const cadre = emprise(trace.points);
  let exagerationCourante: number = EXAGERATION.defaut;

  const poserRelief = (actif: boolean, exageration: number) => {
    carte.setTerrain(actif ? { source: IDS.relief, exaggeration: exageration } : null);
  };

  await new Promise<void>((resolve) => {
    carte.on('load', () => {
      poserRelief(true, exagerationCourante);
      if (cadre !== null) {
        carte.fitBounds(cadre, {
          padding: MARGE_CADRAGE,
          pitch: CAMERA_3D.pitch,
          bearing: CAMERA_3D.bearing,
          duration: 0,
        });
      }
      for (const repere of reperes) {
        const pastille = document.createElement('button');
        pastille.type = 'button';
        pastille.className = 'aa-carte__repere';
        // Le marqueur est un VRAI bouton : il prend le focus, s'ouvre à
        // Entrée comme au tap, et porte son nom accessible (UX-DR-26).
        pastille.setAttribute('aria-label', repere.libelle);
        pastille.textContent = repere.nom.slice(0, 1).toUpperCase();
        new maplibregl.Marker({ element: pastille, anchor: 'bottom' })
          .setLngLat([repere.lon, repere.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 16, closeButton: true }).setText(repere.libelle),
          )
          .addTo(carte);
      }
      resolve();
    });
  });

  // Repère du curseur partagé (story 11.5) : créé à la demande, jamais au
  // montage — sans interaction, aucun point ne doit s'allumer sur la carte.
  let curseur: Marker | null = null;

  const placerCurseur = (sM: number | null) => {
    if (sM === null) {
      curseur?.remove();
      curseur = null;
      return;
    }
    const index = indexDepuisDistance(trace.distancesM, sM);
    const point = trace.points[index];
    if (point === undefined) return;
    if (curseur === null) {
      const pastille = document.createElement('div');
      pastille.className = 'aa-carte__curseur';
      pastille.setAttribute('aria-hidden', 'true');
      curseur = new maplibregl.Marker({ element: pastille });
    }
    curseur.setLngLat([point[0], point[1]]).addTo(carte);
  };

  return {
    definirRelief(actif, exageration) {
      exagerationCourante = exageration;
      poserRelief(actif, exageration);
      const cible = actif ? CAMERA_3D : CAMERA_2D;
      carte.easeTo({
        pitch: cible.pitch,
        bearing: cible.bearing,
        duration: mouvementReduit ? 0 : DUREE_TRANSITION_MS,
      });
    },
    definirExageration(exageration) {
      exagerationCourante = exageration;
      if (carte.getTerrain() !== null) poserRelief(true, exageration);
    },
    definirFond(fond) {
      if (satellite === null) return;
      carte.setLayoutProperty(
        IDS.coucheSatellite,
        'visibility',
        fond === 'satellite' ? 'visible' : 'none',
      );
    },
    placerCurseur,
    recadrer() {
      carte.resize();
      if (cadre !== null) {
        carte.fitBounds(cadre, { padding: MARGE_CADRAGE, duration: 0 });
      }
    },
    detruire() {
      curseur?.remove();
      carte.remove();
    },
  };
}
