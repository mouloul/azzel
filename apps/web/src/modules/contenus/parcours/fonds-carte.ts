/* Story 11.2 — fond cartographique de production et attributions.
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

/** Moteur de rendu — BSD 3-Clause, mention recommandée. */
export const MOTEUR_CARTE = {
  nom: 'MapLibre',
  attribution: '© MapLibre',
  licence: 'BSD 3-Clause',
} as const;

/**
 * Fonds proposés à l'utilisateur. Un seul aujourd'hui : la bascule
 * satellite/topo du POC n'a plus d'objet (amendement d'acceptation de la
 * story 11.3, 2026-11-05). Le tableau reste un tableau pour que l'ajout d'un
 * fond satellite, le jour où une licence est contractée, ne demande pas de
 * refondre l'interface.
 */
export const FONDS_DISPONIBLES: readonly SourceTuiles[] = [FOND_TOPO];

/** Fond actif par défaut. */
export const FOND_PAR_DEFAUT = FOND_TOPO;

/**
 * Bloc d'attributions à afficher EN PERMANENCE, sans interaction (FR-32).
 *
 * L'ordre est stable : fond actif, puis relief — toujours crédité puisqu'il
 * est toujours chargé —, puis moteur. Le relief ne disparaît jamais du bloc,
 * quel que soit le fond : c'est lui qui porte l'obligation de crédit USGS.
 */
export function attributions(fond: SourceTuiles = FOND_PAR_DEFAUT): readonly string[] {
  return [fond.attribution, RELIEF_TERRARIUM.attribution, MOTEUR_CARTE.attribution];
}

/**
 * Mention courte, pour les largeurs où le bloc complet ne tient pas.
 *
 * UX-DR-29 : déployer le détail ne doit JAMAIS faire disparaître la mention
 * courte — les deux coexistent, la courte reste visible en permanence.
 */
export const ATTRIBUTION_COURTE = '© OpenStreetMap, OpenTopoMap, USGS, MapLibre';

/** Aucune URL de tuile ne doit porter de clé : rien à tenir hors du dépôt. */
export function exigeUneCle(source: SourceTuiles): boolean {
  return source.tuiles.some(
    (url) => /[?&](api_?key|access_token|token|key)=/i.test(url) || url.includes('{key}'),
  );
}
