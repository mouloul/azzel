import { CODE_TTL_MINUTES } from '@/modules/iam/constants';

/**
 * Recette du 04/11/2026 — « Participer » tombait sur un champ email nu : rien
 * ne disait qu'un code allait arriver par mail, ni ce qui viendrait après.
 *
 * Guide du parcours, affiché à côté du formulaire. Il ne numérote QUE les deux
 * étapes de cet écran (email, code) : au-delà, on change de page et c'est le fil
 * d'étapes du dossier qui prend le relais (Inscription, Documents, Paiement,
 * Validation). Numéroter ici des étapes que cet écran ne suit pas donnerait un
 * compteur fantôme, abandonné à l'étape 2 sur 5. La suite est annoncée en
 * une phrase, sans numéro.
 *
 * Contrat repris du fil d'étapes du dossier (UX-DR-21) : l'étape courante se
 * lit PAR LE TEXTE (« en cours ») autant que par la forme, jamais par la
 * couleur seule. Les étapes à venir ne portent aucune mention d'état — le
 * guide ne promet rien sur ce qui n'a pas encore commencé.
 */

export type EtapeGuide = 'email' | 'code';

const TTL_LABEL = `${CODE_TTL_MINUTES} minute${CODE_TTL_MINUTES > 1 ? 's' : ''}`;

const ETAPES: readonly { titre: string; texte: string }[] = [
  {
    titre: 'Votre adresse email',
    texte: `Vous recevez aussitôt un code à 6 chiffres, valable ${TTL_LABEL}. Aucun mot de passe à retenir.`,
  },
  {
    titre: 'Le code reçu par email',
    texte:
      'Ouvrez votre boîte et recopiez le code. S’il n’arrive pas, regardez les indésirables ou demandez-en un autre.',
  },
];

export function GuideInscription({ etape }: { etape: EtapeGuide }) {
  const indexCourante = etape === 'email' ? 0 : 1;

  return (
    <aside className="guide-inscription" aria-labelledby="titre-guide-inscription">
      <h2 id="titre-guide-inscription">Comment ça se passe</h2>
      <ol className="guide-inscription__etapes">
        {ETAPES.map((item, index) => {
          const faite = index < indexCourante;
          const courante = index === indexCourante;
          // Libellé d'état en UNE chaîne : interpolé morceau par morceau, React
          // le découpe en nœuds séparés et la phrase n'existe plus telle quelle
          // dans le HTML servi (elle resterait lisible, mais introuvable à la
          // recherche et au test).
          const etat = courante
            ? ` — étape ${index + 1} sur ${ETAPES.length}, en cours`
            : faite
              ? ' — fait'
              : null;
          return (
            <li
              key={item.titre}
              className={
                courante
                  ? 'guide-etape guide-etape--courante'
                  : faite
                    ? 'guide-etape guide-etape--faite'
                    : 'guide-etape'
              }
            >
              <span className="guide-etape__marqueur" aria-hidden="true">
                {faite ? '✓' : index + 1}
              </span>
              <span className="guide-etape__textes">
                <span className="guide-etape__titre">
                  {item.titre}
                  {etat !== null ? (
                    <span className="guide-etape__etat">{etat}</span>
                  ) : null}
                </span>
                <span className="guide-etape__texte">{item.texte}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="guide-inscription__suite">
        Vous compléterez ensuite votre inscription sur l’écran suivant — identité et
        épreuve, décharge et règlement, puis preuve de paiement. Un fil d’étapes vous
        y accompagne jusqu’à la validation de votre dossard.
      </p>
    </aside>
  );
}
