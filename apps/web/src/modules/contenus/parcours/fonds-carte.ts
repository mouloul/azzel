/* Story 11.2 — fond cartographique de production et attributions.
 *
 * AMENDEMENT (2026-11-05, responsable du projet) : le satellite est proposé
 * SI ET SEULEMENT SI une clé ArcGIS Location Platform est fournie
 * (NEXT_PUBLIC_ARCGIS_API_KEY). Sans clé, la décision d'origine tient telle
 * quelle : OpenTopoMap seul, aucun appel vers Esri. La clé est un contrat avec
 * Esri — c'est ce qui manquait à l'endpoint anonyme du POC.
 *
 * DÉCISION DU 2026-11-05 (responsable du projet) : OpenTopoMap SEUL, sans
 * fond satellite. Voir
 * `_bmad-output/implementation-artifacts/decision-fond-cartographique-2026-11-05.md`.
 *
 * Pourquoi pas de satellite. Le POC tapait l'endpoint anonyme
 * `server.arcgisonline.com/.../World_Imagery`, couvert par le Master License
 * Agreement d'Esri : rien n'autorise son usage hors contrat, et rien ne
 * garantit que l'endpoint survive. Le remplaçant gratuit, EOX Sentinel-2
 * cloudless, est en CC BY-NC-SA : réservé à l'usage NON COMMERCIAL. Or le
 * critère des licences NC porte sur la nature de l'USAGE, pas sur le statut
 * associatif (§3 de la note licences) — et Azzel vend des inscriptions
 * (FR-4) et affiche des sponsors (FR-22) sur les mêmes pages. La question se
 * rouvrirait donc à chaque évolution du modèle. OpenTopoMap autorise
 * explicitement l'usage commercial, sans clé, sans plafond contractuel.
 *
 * Ce module est PUR et sans dépendance à MapLibre : il décrit les sources et
 * leurs attributions. La carte (story 11.3) le consomme ; les tests le lisent
 * sans charger le moteur de rendu.
 */

/** Une source de tuiles, avec le texte d'attribution que sa licence impose. */
export interface SourceTuiles {
  readonly id: string;
  /** Libellé lisible, affiché dans l'interface. */
  readonly nom: string;
  readonly tuiles: readonly string[];
  readonly tailleTuile: number;
  readonly zoomMax: number;
  /**
   * Attribution EXACTE exigée par la licence. Reproduite telle quelle : la
   * raccourcir ou la reformuler est une violation de la clause d'attribution.
   */
  readonly attribution: string;
  /** Licence, pour la page de crédits et la revue annuelle. */
  readonly licence: string;
}

/**
 * Fond topographique — CC BY-SA 3.0, usage commercial autorisé.
 *
 * Attribution : équivalent français admis par la note licences (§5.2), les
 * liens vers openstreetmap.org/copyright et opentopomap.org étant conservés
 * dans le bloc d'attributions rendu.
 *
 * OpenTopoMap ne garantit ni disponibilité ni support et interdit les
 * téléchargements de masse sur ses serveurs publics : aucun préchargement de
 * tuiles, ici ni dans l'application coureur (§4 de la note).
 */
export const FOND_TOPO: SourceTuiles = {
  id: 'topo',
  nom: 'Topographique',
  tuiles: [
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
  ],
  tailleTuile: 256,
  zoomMax: 17,
  attribution:
    'Données cartographiques : © Contributeurs OpenStreetMap, SRTM | Rendu : © OpenTopoMap (CC-BY-SA)',
  licence: 'CC BY-SA 3.0',
};

/**
 * Une clé n'est acceptée que si elle ne peut RIEN injecter dans l'URL : la
 * valeur vient d'une variable d'environnement, et un `&` ou un `?` y ajouterait
 * un paramètre. Lettres, chiffres, tiret, souligné, point, tilde — les clés
 * ArcGIS (« AAPK… ») tiennent dans ce jeu.
 */
export function cleArcgisValide(cle: string | null | undefined): cle is string {
  return typeof cle === 'string' && /^[A-Za-z0-9_.~-]{8,512}$/.test(cle);
}

/**
 * Imagerie satellite — ArcGIS Location Platform (Esri World Imagery), AVEC CLÉ.
 *
 * Service à clé (`ibasemaps-api.arcgis.com`), PAS l'endpoint anonyme du POC
 * (`server.arcgisonline.com`) que rien ne contractualisait. La clé est visible
 * dans le navigateur par construction : elle se restreint au domaine du site
 * dans la console Esri, c'est son seul garde-fou.
 *
 * Résolution : jusqu'au z18 sur la zone (~0,6 m/px) ; z19 absent (note
 * licences §2.3). Attribution : texte d'Esri reproduit tel quel — à confronter
 * au `copyrightText` du service le jour de la mise en production.
 */
export function fondSatellite(cle: string): SourceTuiles {
  return {
    id: 'satellite',
    nom: 'Satellite',
    tuiles: [
      `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${cle}`,
    ],
    tailleTuile: 256,
    zoomMax: 18,
    attribution: 'Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    licence: 'Esri — ArcGIS Location Platform (clé API)',
  };
}

/**
 * Relief — domaine public (SRTM, GMTED2010, 3DEP de l'USGS), crédit demandé.
 *
 * C'est la source du relief 3D ET celle dont dérive le profil altimétrique :
 * le `parcours.json` généré au build est une œuvre dérivée d'un MNT en
 * domaine public, ce qui le met hors de portée de toute clause de licence.
 *
 * L'hébergement AWS n'offre AUCUNE garantie de disponibilité. La licence
 * autorise l'auto-hébergement : c'est le recours si le service disparaît.
 */
export const RELIEF_TERRARIUM: SourceTuiles = {
  id: 'relief',
  nom: 'Relief',
  tuiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tailleTuile: 256,
  zoomMax: 15,
  attribution:
    'Relief : données 3DEP, GMTED2010 et SRTM — U.S. Geological Survey, tuiles Terrain Tiles (Tilezen/Mapzen) via AWS Open Data',
  licence: 'Domaine public (USGS)',
};

/**
 * Surcouche vectorielle (tuiles Mapbox Vector Tiles, schéma OpenMapTiles),
 * décrite par un TileJSON plutôt que par des URL de tuiles figées.
 */
export interface SurcoucheVectorielle {
  readonly id: string;
  readonly nom: string;
  /** TileJSON de la source : il désigne les tuiles du moment. */
  readonly tilejson: string;
  /** Gabarit des glyphes (polices SDF) des libellés. */
  readonly glyphes: string;
  /** Police servie par `glyphes` ; elle ne couvre pas l'alphabet arabe. */
  readonly police: readonly string[];
  /** Attribution EXACTE, reproduite telle que publiée par le fournisseur. */
  readonly attribution: string;
  /**
   * Ayants droit nommés dans `attribution`, dans l'ordre de la mention
   * courte. Chacun figure mot pour mot dans `attribution` (vérifié par test).
   */
  readonly ayantsDroit: readonly string[];
  readonly licence: string;
}

/**
 * Surcouche « noms et chemins » posée sur le satellite (2026-11-12).
 *
 * L'imagerie Esri ne porte ni noms de lieux ni routes, et la clé ArcGIS du
 * projet n'ouvre aucune couche de libellés Esri. OpenFreeMap sert les données
 * OpenStreetMap au schéma OpenMapTiles : gratuit, sans clé, usage commercial
 * autorisé, sans garantie de service.
 *
 * TileJSON et non URL de tuiles : OpenFreeMap versionne ses tuiles
 * (`/planet/<date>/…`) et les renouvelle chaque semaine.
 *
 * Attribution : texte du champ `attribution` du TileJSON, débarrassé de ses
 * balises (« OpenFreeMap », « © OpenMapTiles », « Data from OpenStreetMap »).
 * Données OSM sous ODbL.
 */
export const SURCOUCHE_OSM: SurcoucheVectorielle = {
  id: 'surcouche-osm',
  nom: 'Noms et chemins',
  tilejson: 'https://tiles.openfreemap.org/planet',
  glyphes: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  police: ['Noto Sans Regular'],
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  ayantsDroit: ['OpenStreetMap', 'OpenMapTiles', 'OpenFreeMap'],
  licence: 'ODbL 1.0 (données OpenStreetMap) — OpenFreeMap, sans clé, usage commercial autorisé',
};

/** Moteur de rendu — BSD 3-Clause, mention recommandée. */
export const MOTEUR_CARTE = {
  nom: 'MapLibre',
  attribution: '© MapLibre',
  licence: 'BSD 3-Clause',
} as const;

/**
 * Fonds proposés à l'utilisateur : le topographique toujours ; le satellite
 * seulement avec une clé valide. Le tableau reste un tableau pour que l'ajout
 * d'un fond ne demande pas de refondre l'interface.
 */
export function fondsDisponibles(cleArcgis: string | null | undefined): readonly SourceTuiles[] {
  return cleArcgisValide(cleArcgis) ? [FOND_TOPO, fondSatellite(cleArcgis)] : [FOND_TOPO];
}

/** Clé lue UNE fois, à la compilation : NEXT_PUBLIC_* est inlinée dans le bundle. */
export const CLE_ARCGIS: string | null = cleArcgisValide(process.env.NEXT_PUBLIC_ARCGIS_API_KEY?.trim())
  ? (process.env.NEXT_PUBLIC_ARCGIS_API_KEY?.trim() ?? null)
  : null;

export const FONDS_DISPONIBLES: readonly SourceTuiles[] = fondsDisponibles(CLE_ARCGIS);

/** Fond actif par défaut. */
export const FOND_PAR_DEFAUT = FOND_TOPO;

/**
 * Bloc d'attributions à afficher EN PERMANENCE, sans interaction (FR-32).
 *
 * L'ordre est stable : fond actif, puis — sur le satellite seulement — la
 * surcouche noms et chemins qui l'accompagne, puis relief — toujours crédité
 * puisqu'il est toujours chargé —, puis moteur. Le relief ne disparaît jamais
 * du bloc, quel que soit le fond : c'est lui qui porte l'obligation de crédit
 * USGS. Sur le topographique, la surcouche est masquée : pas de crédit en plus.
 */
export function attributions(fond: SourceTuiles = FOND_PAR_DEFAUT): readonly string[] {
  return fond.id === 'satellite'
    ? [fond.attribution, SURCOUCHE_OSM.attribution, RELIEF_TERRARIUM.attribution, MOTEUR_CARTE.attribution]
    : [fond.attribution, RELIEF_TERRARIUM.attribution, MOTEUR_CARTE.attribution];
}

/**
 * Mention courte, pour les largeurs où le bloc complet ne tient pas.
 *
 * UX-DR-29 : déployer le détail ne doit JAMAIS faire disparaître la mention
 * courte — les deux coexistent, la courte reste visible en permanence.
 */
export const ATTRIBUTION_COURTE = '© OpenStreetMap, OpenTopoMap, USGS, MapLibre';

/**
 * Mention courte du fond ACTIF : jamais OpenTopoMap quand c'est Esri qui
 * s'affiche ; sur le satellite, la surcouche OpenFreeMap / OpenMapTiles /
 * OpenStreetMap est nommée avec lui.
 */
export function attributionCourte(fond: SourceTuiles = FOND_PAR_DEFAUT): string {
  return fond.id === 'satellite'
    ? `© Esri, Maxar, Earthstar Geographics, ${SURCOUCHE_OSM.ayantsDroit.join(', ')}, USGS, MapLibre`
    : ATTRIBUTION_COURTE;
}

/** Une URL porte-t-elle une clé (paramètre ou gabarit `{key}`) ? */
export function urlPorteUneCle(url: string): boolean {
  return /[?&](api_?key|access_token|token|key)=/i.test(url) || url.includes('{key}');
}

/** Aucune URL de tuile ne doit porter de clé : rien à tenir hors du dépôt. */
export function exigeUneCle(source: SourceTuiles): boolean {
  return source.tuiles.some(urlPorteUneCle);
}
