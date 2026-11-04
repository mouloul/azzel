import {
  BORNES_PENTE_PCT,
  LIBELLES_PALIERS,
  PROFIL_MARGES,
  PROFIL_VIEWBOX,
  fabriquerEchelles,
  graduationsAltitude,
  graduationsDistance,
  palierDePente,
  type Palier,
  type PointProfil,
  type ProfilEpreuve,
} from '@/modules/contenus/parcours/profil';
import { ProfilCurseurMontage } from '@/components/profil-curseur-montage';

/* Story 11.4 — profil altimétrique et graphe de technicité (SERVEUR).
 *
 * Rendu complet SANS JavaScript : SVG (aires colorées par palier de pente,
 * ligne d’arête, axes km/altitude, marqueurs Départ/Arrivée), légende en
 * trait + toutes lettres et synthèse en texte — l’île curseur
 * (profil-curseur-montage) n’est qu’une amélioration progressive chargée
 * après montage, elle rend `null` côté serveur.
 *
 * Couleurs : uniquement les tokens --az-pente-* (classes CSS, jamais de
 * littéral) ; les quatre teintes diffèrent aussi en clarté et tiennent AA
 * non textuel 3:1 dans les deux thèmes (contrastes.test.ts). */

const NBSP = '\u202f';

const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const formatPct = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
});

/** Libellé de bornes de l’échelle verrouillée (UX-DR-36), toutes lettres. */
const BORNES_LEGENDE: Readonly<Record<Palier, string>> = {
  roulant: `moins de ${BORNES_PENTE_PCT.soutenu}\u00a0%`,
  soutenu: `${BORNES_PENTE_PCT.soutenu} à ${BORNES_PENTE_PCT.raide}\u00a0%`,
  raide: `${BORNES_PENTE_PCT.raide} à ${BORNES_PENTE_PCT.tresRaide}\u00a0%`,
  'tres-raide': `${BORNES_PENTE_PCT.tresRaide}\u00a0% et plus`,
};

/** Suite de segments consécutifs de même palier (aires fusionnées du SVG) :
 *  la couleur d’un segment est le palier de la MOYENNE des pentes fenêtrées
 *  de ses deux extrémités — zones de transition honnêtes. */
function airesParPalier(
  points: readonly PointProfil[],
): { palier: Palier; points: PointProfil[] }[] {
  const aires: { palier: Palier; points: PointProfil[] }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const courant = points[i];
    const suivant = points[i + 1];
    if (courant === undefined || suivant === undefined) continue;
    const palier = palierDePente((courant.pentePct + suivant.pentePct) / 2);
    const derniere = aires[aires.length - 1];
    if (derniere !== undefined && derniere.palier === palier) {
      derniere.points.push(suivant);
    } else {
      aires.push({ palier, points: [courant, suivant] });
    }
  }
  return aires;
}

/** Polygone d’une aire : corde du profil refermée sur la ligne de base. */
function cheminAire(
  points: readonly PointProfil[],
  x: (sM: number) => number,
  y: (altitudeM: number) => number,
  yBase: number,
): string {
  const morceaux = points.map((p) => `L${x(p.sM)} ${y(p.altitudeM)}`);
  const premier = points[0];
  const dernier = points[points.length - 1];
  if (premier === undefined || dernier === undefined) return '';
  return (
    `M${x(premier.sM)} ${yBase} ` +
    morceaux.join(' ') +
    ` L${x(dernier.sM)} ${yBase} Z`
  );
}

export function ProfilAltimetrique({
  slugEpreuve,
  nomEpreuve,
  profil,
}: {
  /** Slug de l’épreuve (identifie le profil, CustomEvent du curseur). */
  slugEpreuve: string;
  /** Nom complet de l’épreuve (titre accessible du profil). */
  nomEpreuve: string;
  profil: ProfilEpreuve;
}) {
  const { x, y, yBase } = fabriquerEchelles(
    profil.distanceM,
    profil.altitudeMinM,
    profil.altitudeMaxM,
  );
  const aires = airesParPalier(profil.points);
  const arete = profil.points
    .map((p) => `${x(p.sM)} ${y(p.altitudeM)}`)
    .join(' ');
  const graduationsAlt = graduationsAltitude(profil.altitudeMinM, profil.altitudeMaxM);
  const graduationsKm = graduationsDistance(profil.distanceM);
  const idTitre = `profil-alt-titre-${slugEpreuve}`;
  const synthese =
    `${formatKm.format(profil.distanceM / 1000)}${NBSP}km, altitude ${formatM.format(profil.altitudeMinM)} ` +
    `à ${formatM.format(profil.altitudeMaxM)}${NBSP}m, ${formatM.format(profil.dplusM)}${NBSP}m de D+. ` +
    `Technicité\u00a0: ${profil.parts
      .map((p) => `${LIBELLES_PALIERS[p.palier].toLowerCase()} ${formatPct.format(p.part * 100)}${NBSP}%`)
      .join(', ')} de la distance.`;
  const marqueurs = profil.marqueurs.filter((m) => m.sM >= 0 && m.sM <= profil.distanceM);

  return (
    <figure className="aa-profil">
      <div className="aa-profil__corps">
        <div className="aa-profil__graphique">
          <svg
            role="img"
            aria-labelledby={idTitre}
            viewBox={`0 0 ${PROFIL_VIEWBOX.largeur} ${PROFIL_VIEWBOX.hauteur}`}
            focusable="false"
          >
            <title id={idTitre}>
              {`Profil altimétrique de ${nomEpreuve} : ${synthese}`}
            </title>
            {/* Décor (grille, axes) : aria-hidden, le nom accessible porte tout. */}
            <g className="aa-profil__decor" aria-hidden="true">
              {graduationsAlt.map((altitude) => (
                <line
                  className="aa-profil__grille"
                  key={altitude}
                  x1={x(0)}
                  x2={x(profil.distanceM)}
                  y1={y(altitude)}
                  y2={y(altitude)}
                />
              ))}
              {graduationsAlt.map((altitude) => (
                <text
                  className="aa-profil__axe"
                  key={`alt-${altitude}`}
                  textAnchor="end"
                  x={x(0) - 4}
                  y={y(altitude) + 3}
                >
                  {formatM.format(altitude)}
                </text>
              ))}
              {graduationsKm.map((sM) => (
                <text
                  className="aa-profil__axe"
                  key={`km-${sM}`}
                  textAnchor="middle"
                  x={x(sM)}
                  y={PROFIL_VIEWBOX.hauteur - 7}
                >
                  {formatKm.format(sM / 1000)}
                </text>
              ))}
              <text
                className="aa-profil__axe"
                textAnchor="start"
                x={x(0) - 4}
                y={PROFIL_VIEWBOX.hauteur - 7}
              >
                km
              </text>
            </g>
            {/* Aires par palier fusionnées : la couleur EST l’information de
                technicité, redite en toutes lettres par la légende. */}
            <g aria-hidden="true">
              {aires.map((aire) => (
                <path
                  className={`aa-profil__aire aa-profil__aire--${aire.palier}`}
                  d={cheminAire(aire.points, x, y, yBase)}
                  key={`${aire.points[0]?.sM ?? 0}-${aire.palier}`}
                />
              ))}
              <polyline className="aa-profil__arete" points={arete} />
            </g>
            {/* Marqueurs Départ/Arrivée : kilomètre et D+ du segment amont,
                mêmes chiffres publiés que la fiche (source parcours.json). */}
            <g aria-hidden="true">
              {marqueurs.map((marqueur) => {
                const px = x(marqueur.sM);
                const ancre = marqueur.sM < profil.distanceM / 2 ? 'start' : 'end';
                return (
                  <g key={marqueur.id}>
                    <line
                      className="aa-profil__marqueur"
                      x1={px}
                      x2={px}
                      y1={PROFIL_MARGES.haut}
                      y2={yBase}
                    />
                    <circle
                      className="aa-profil__marqueur-point"
                      cx={px}
                      cy={y(marqueur.altitudeM ?? profil.altitudeMinM)}
                      r="2.5"
                    />
                    <text className="aa-profil__marqueur-libelle" textAnchor={ancre} x={ancre === 'start' ? px : px - 3} y={11}>
                      {marqueur.nom}
                      {marqueur.kilometre !== null
                        ? ` · km${NBSP}${formatKm.format(marqueur.kilometre)}`
                        : ''}
                      {marqueur.dplusSegmentAmontM !== null && marqueur.dplusSegmentAmontM > 0
                        ? ` · +${formatM.format(marqueur.dplusSegmentAmontM)}${NBSP}m D+`
                        : ''}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        {/* Île client minimale : overlay curseur (pointeur + clavier) et
            lecture des valeurs — chargée APRÈS montage, null sans JS. */}
        <ProfilCurseurMontage
          epreuve={slugEpreuve}
          points={profil.points}
          distanceM={profil.distanceM}
        />
      </div>
      <p className="aa-profil__synthese">{synthese}</p>
      <ul className="aa-profil__legende">
        {profil.parts.map((part) => (
          <li key={part.palier}>
            <span className={`aa-profil__trait aa-profil__trait--${part.palier}`} />
            <span>
              {LIBELLES_PALIERS[part.palier]} ({BORNES_LEGENDE[part.palier]}) —{' '}
              {formatPct.format(part.part * 100)}{NBSP}% de la distance
            </span>
          </li>
        ))}
      </ul>
      <p className="aa-profil__note">
        Technicité selon la pente, en montée comme en descente — le palier
        mesure la raideur du terrain, pas son sens.
      </p>
    </figure>
  );
}
