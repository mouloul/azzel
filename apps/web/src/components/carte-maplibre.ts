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

import maplibregl, {
  type IControl,
  type Map as CarteMapLibre,
  type Marker,
  type Popup,
} from 'maplibre-gl';

// Feuille de style du moteur (commandes, échelle, messages de gestes). Importée
// ICI et non dans la page : ce module n'est chargé qu'à l'ouverture de la carte,
// la feuille ne pèse donc jamais sur le premier rendu. Sans elle, les commandes
// s'affichent en texte brut par-dessus la page.
import 'maplibre-gl/dist/maplibre-gl.css';
// Pastilles des points de passage et infobulles : chargées avec le moteur,
// donc présentes quelle que soit la page qui ouvre la carte. Retour comité
// 2027 : portées par `carte.css`, que /parcours n'importait plus depuis la vue
// 3D, elles s'affichaient en boutons bruts et en texte clair sur fond blanc.
import './carte-maplibre.css';

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
import type { Repere } from '@/modules/contenus/parcours/reperes';
import {
  COUCHES_SURCOUCHE,
  IDS_SURCOUCHE,
  couchesLibellesSurcouche,
  couchesLignesSurcouche,
  sourceSurcouche,
} from '@/modules/contenus/parcours/surcouche-osm';

export interface OptionsCarte {
  conteneur: HTMLElement;
  trace: TraceCarte;
  couleurs: CouleursTrace;
  /** Points de passage à marquer, dans l'ordre du parcours. */
  reperes: readonly Repere[];
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

/**
 * Opacité des pastilles, qu'une crête les cache ou non en 3D. MapLibre les
 * estompe à 0,2 quand il les juge cachées — illisibles sur le satellite — et
 * ce jugement lit un tampon de profondeur qui reste périmé jusqu'au premier
 * mouvement de caméra : au repos, des pastilles bien visibles passaient pour
 * cachées. Retour comité 2027 : six repères à lire valent mieux qu'un effet
 * d'occultation, l'estompage est donc neutralisé.
 */
const OPACITE_REPERE = '1';

/**
 * Bouton « Recentrer », rangé sous le zoom (+ / −) dans le même groupe de
 * commandes : c'est là qu'on le cherche après avoir trop zoomé.
 */
export class ControleRecentrer implements IControl {
  private conteneur: HTMLDivElement | null = null;

  constructor(private readonly recentrer: () => void) {}

  onAdd(): HTMLElement {
    const conteneur = document.createElement('div');
    conteneur.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'aa-carte__recentrer';
    bouton.title = 'Recentrer sur le parcours';
    bouton.setAttribute('aria-label', 'Recentrer la carte sur le parcours');
    // Viseur : cercle et quatre traits, dessiné en currentColor.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of ['M10 2v3', 'M10 15v3', 'M2 10h3', 'M15 10h3']) {
      const trait = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      trait.setAttribute('d', d);
      svg.append(trait);
    }
    const cercle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    cercle.setAttribute('cx', '10');
    cercle.setAttribute('cy', '10');
    cercle.setAttribute('r', '5');
    svg.append(cercle);
    bouton.append(svg);
    bouton.addEventListener('click', () => this.recentrer());
    conteneur.append(bouton);
    this.conteneur = conteneur;
    return conteneur;
  }

  onRemove(): void {
    this.conteneur?.remove();
    this.conteneur = null;
  }
}

/**
 * Contenu d'une infobulle de repère, construit nœud par nœud : les textes
 * viennent du document publié, jamais d'HTML interprété (aucun innerHTML).
 */
export function contenuBulle(repere: Repere): HTMLElement {
  const bulle = document.createElement('div');
  bulle.className = 'aa-carte__bulle';
  const ajouter = (balise: string, classe: string, texte: string) => {
    const noeud = document.createElement(balise);
    noeud.className = classe;
    noeud.textContent = texte;
    bulle.append(noeud);
    return noeud;
  };
  ajouter('p', 'aa-carte__bulle-titre', repere.titre);
  if (repere.sousTitre !== null) ajouter('p', 'aa-carte__bulle-nom', repere.sousTitre);
  if (repere.mesures.length > 0) {
    const liste = document.createElement('ul');
    liste.className = 'aa-carte__bulle-mesures';
    for (const mesure of repere.mesures) {
      const ligne = document.createElement('li');
      ligne.textContent = mesure;
      liste.append(ligne);
    }
    bulle.append(liste);
  }
  if (repere.services.length > 0) {
    ajouter('p', 'aa-carte__bulle-services', repere.services.join(' · '));
  }
  return bulle;
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
  let reliefActif = true;
  /** Zoom de la vue d'ouverture (cadrage du tracé), mémorisé au chargement. */
  let zoomInitial: number | null = null;

  // Retour comité 2027 : après un zoom puis un déplacement, on se retrouvait
  // loin du tracé sans moyen simple d'y revenir. « Recentrer » rend le zoom
  // d'ouverture (échelle ~500 m), centré sur le départ, dans le mode (3D ou
  // 2D) en cours. Le zoom est MÉMORISÉ et non recalculé : un nouveau cadrage
  // en 2D serrait la vue (échelle 300 m) par rapport à l'ouverture en 3D.
  const recentrer = () => {
    const camera = reliefActif ? CAMERA_3D : CAMERA_2D;
    const cible = {
      center: [depart[0], depart[1]] as [number, number],
      zoom: zoomInitial ?? carte.getZoom(),
      pitch: camera.pitch,
      bearing: camera.bearing,
    };
    if (!reliefActif) {
      carte.easeTo({ ...cible, duration: mouvementReduit ? 0 : DUREE_TRANSITION_MS });
      return;
    }
    // En 3D, PAS d'animation : `easeTo` se termine par `recalculateZoom`, qui
    // relit le point central dans le tampon de coordonnées du relief — un
    // tampon que MapLibre ne rafraîchit qu'au fil des gestes. Périmé ici, il
    // rendait un zoom au hasard (50 m, 200 m, 1 km), voire une caméra plantée
    // dans la montagne. `jumpTo` ne fait pas ce recalcul : centre et zoom
    // sont posés tels quels, l'altitude est relue dans les tuiles du relief.
    carte.jumpTo(cible);
  };
  carte.addControl(new ControleRecentrer(recentrer), 'top-right');

  const poserRelief = (actif: boolean, exageration: number) => {
    carte.setTerrain(actif ? { source: IDS.relief, exaggeration: exageration } : null);
  };

  // Surcouche noms et chemins (OpenFreeMap), ajoutée PARESSEUSEMENT : jamais
  // dans le style initial, où son TileJSON retiendrait `load` (et pour
  // toujours s'il échouait) ; seulement quand le satellite s'affiche, pour
  // qu'un visiteur resté en topo ne contacte jamais openfreemap.org. Si
  // OpenFreeMap ne répond pas, la carte est déjà ouverte : seuls les libellés
  // manquent. Volontairement AUCUN écouteur `error` : MapLibre ne journalise
  // ses erreurs (`console.error`) que si personne ne les écoute.
  let surcoucheAjoutee = false;
  const ajouterSurcouche = () => {
    if (surcoucheAjoutee) return;
    surcoucheAjoutee = true;
    carte.addSource(IDS_SURCOUCHE.source, sourceSurcouche() as never);
    // Routes et chemins SOUS le tracé : l'épreuve n'est jamais recouverte.
    for (const couche of couchesLignesSurcouche('visible')) {
      carte.addLayer(couche as never, IDS.coucheHalo);
    }
    // Libellés au sommet : un nom de village reste lisible sur le tracé.
    for (const couche of couchesLibellesSurcouche('visible')) {
      carte.addLayer(couche as never);
    }
  };

  await new Promise<void>((resolve) => {
    carte.on('load', () => {
      poserRelief(true, exagerationCourante);
      if (satelliteInitial) ajouterSurcouche();
      if (cadre !== null) {
        carte.fitBounds(cadre, {
          padding: MARGE_CADRAGE,
          pitch: CAMERA_3D.pitch,
          bearing: CAMERA_3D.bearing,
          duration: 0,
        });
      }
      zoomInitial = carte.getZoom();
      const marqueurs: Marker[] = [];
      const bulles: Popup[] = [];
      for (const repere of reperes) {
        const pastille = document.createElement('button');
        pastille.type = 'button';
        pastille.className = 'aa-carte__repere';
        pastille.dataset.type = repere.type;
        // Le marqueur est un VRAI bouton : il prend le focus, s'ouvre à
        // Entrée comme au tap, et porte son nom accessible (UX-DR-26) — posé
        // APRÈS `addTo`, qui le remplace sans condition par « Map marker ».
        pastille.setAttribute('aria-expanded', 'false');
        pastille.textContent = repere.pastille;
        // Infobulle tenue HORS du marqueur (pas de `setPopup`) : MapLibre
        // referme d'office l'infobulle d'un marqueur qu'il croit caché par le
        // relief, et ce jugement est faux tant que la caméra n'a pas bougé —
        // au clic, l'infobulle s'ouvrait et se refermait aussitôt.
        const bulle = new maplibregl.Popup({
          className: 'aa-carte__popup',
          closeButton: true,
          closeOnClick: false,
          maxWidth: '280px',
          offset: 22,
        })
          .setLngLat([repere.lon, repere.lat])
          .setDOMContent(contenuBulle(repere));
        bulle.on('open', () => pastille.setAttribute('aria-expanded', 'true'));
        bulle.on('close', () => pastille.setAttribute('aria-expanded', 'false'));
        pastille.addEventListener('click', () => {
          if (bulle.isOpen()) {
            bulle.remove();
            return;
          }
          // Une infobulle à la fois : la carte reste lisible.
          for (const autre of bulles) autre.remove();
          bulle.addTo(carte);
        });
        bulles.push(bulle);
        marqueurs.push(
          new maplibregl.Marker({
            element: pastille,
            anchor: 'center',
            opacity: OPACITE_REPERE,
            opacityWhenCovered: OPACITE_REPERE,
          })
            .setLngLat([repere.lon, repere.lat])
            .addTo(carte),
        );
        pastille.setAttribute('aria-label', repere.libelle);
      }
      // Un clic sur la carte, hors pastille, referme l'infobulle ouverte. Le
      // clic sur une pastille remonte aussi jusqu'à la carte : il est ignoré
      // ici, sinon il refermerait l'infobulle qu'il vient d'ouvrir.
      carte.on('click', (evenement) => {
        const cible = evenement.originalEvent.target;
        if (cible instanceof Element && cible.closest('.aa-carte__repere') !== null) return;
        for (const bulle of bulles) bulle.remove();
      });
      // Les pastilles sont posées AVANT que les tuiles d'altitude de la vue
      // soient chargées : MapLibre les place alors au niveau 0, sous le
      // relief — décalées du tracé, plusieurs centaines de pixels plus bas en
      // 3D — et ne les recale qu'au prochain mouvement de caméra. Une fois la
      // carte au repos (toutes tuiles chargées), on reprojette chaque
      // pastille sur le relief.
      carte.on('idle', () => {
        for (const marqueur of marqueurs) marqueur.setLngLat(marqueur.getLngLat());
      });
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
      reliefActif = actif;
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
      const visibilite = fond === 'satellite' ? 'visible' : 'none';
      carte.setLayoutProperty(IDS.coucheSatellite, 'visibility', visibilite);
      // La surcouche suit le satellite : ajoutée à son premier affichage,
      // simplement masquée ensuite (OpenTopoMap porte déjà ses libellés).
      if (fond === 'satellite') ajouterSurcouche();
      if (!surcoucheAjoutee) return;
      for (const couche of COUCHES_SURCOUCHE) {
        carte.setLayoutProperty(couche, 'visibility', visibilite);
      }
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
