import { encoderPayloadEdossard } from '@azzel/shared';
import QRCode from 'qrcode';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';
import { NoEditionError } from '@/modules/inscriptions/errors';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { obtenirEdossard, type EdossardState } from '@/modules/inscriptions/service';

import './e-dossard.css';

// Story 4.1 — e-dossard QR hors-ligne (NFR-6) : la carte à présenter au
// guichet. Le QR est généré CÔTÉ SERVEUR (lib qrcode, SVG haute définition,
// zéro bundle client — le « 30 jours » repose sur le cache du service worker,
// pas sur du runtime). Il encode `azzel-e1:<jeton>` (contrat shared) — JAMAIS
// le dossard nu. Dossier non validé : message d'attente renvoyant vers la
// checklist, AUCUN QR. Tutoiement (surface coureur).

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ton e-dossard',
};

/** Couleurs du QR : modules encre sur blanc — fixes, lisibles dans les deux modes. */
const QR_ENCRE = '#16281C'; // operationsTokens.texte
const QR_BLANC = '#FFFFFF';

export default async function EdossardPage() {
  const assistancePhone = readAssistancePhone();
  const guard = await requireRolePage('coureur');
  if (guard.status === 'db-unavailable') {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">E-dossard</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
          </div>
        </article>
      </section>
    );
  }
  const session = guard.session;

  let edossard: EdossardState | null = null;
  let qrSvg: string | null = null;
  let failure: ReturnType<typeof toInscriptionsApiError> | null = null;
  let sansEdition = false;
  try {
    edossard = await obtenirEdossard(session);
    if (edossard !== null) {
      // Jeton corrompu en base (CHECK contourné) ou lib QR en échec : la
      // même enveloppe d'échec que le service — jamais un 500 brut.
      const payload = encoderPayloadEdossard(edossard.jeton);
      qrSvg = await QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 1,
        color: { dark: QR_ENCRE, light: QR_BLANC },
      });
    }
  } catch (error) {
    if (error instanceof NoEditionError) {
      sansEdition = true;
    } else {
      failure = toInscriptionsApiError(error);
    }
  }

  if (sansEdition) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">E-dossard</p>
          <h1>Aucune édition disponible</h1>
          <p className="hint">
            Aucune édition n’est configurée pour le moment. Réessaie plus tard.
          </p>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Revenir à mon espace
            </a>
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  if (failure !== null) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">E-dossard</p>
          <h1>E-dossard indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{failure.envelope.error.message}</p>
            <p className="error-action">{failure.envelope.error.action}</p>
          </div>
          <p className="hint">
            Si tu avais déjà ouvert cette page en ligne, ton e-dossard reste
            lisible hors-ligne.
          </p>
          <div className="auth-alt">
            <LogoutButton />
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  if (edossard === null) {
    // Dossier non validé : message d'attente vers la checklist, AUCUN QR.
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">E-dossard</p>
          <h1>Ton e-dossard arrive</h1>
          <p className="lead">
            Ton e-dossard sera prêt dès que ton dossier est validé par
            l’organisation.
          </p>
          <p className="hint">
            Reviens ici après la validation : ton QR code s’affichera, prêt à
            présenter au guichet du retrait des dossards.
          </p>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Revoir ma checklist
            </a>
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  // Le jeton existe dès la première consultation (création paresseuse) : le
  // coureur non numéroté voit quand même son QR — le guichet résoudra le
  // dossard dès l'attribution (story 3.4).
  return (
    <section className="auth edossard">
      {/* Marker lu par le service worker (sw-coureur.js) : SEULE la page
          « QR prêt » a le droit de survivre hors-ligne — la page d'attente
          (dossier non validé) n'est jamais cachée ni servie au guichet. */}
      <article className="card edossard-carte-sombre" data-edossard="pret">
        <p className="surtitre edossard-surtitre">E-dossard — {edossard.editionNom}</p>
        <p className="edossard-identite">
          {edossard.prenom} {edossard.nom}
        </p>
        <p className="edossard-epreuve">{edossard.epreuveNom}</p>
        {edossard.dossard !== null ? (
          <p className="edossard-numero">{edossard.dossard}</p>
        ) : (
          <p className="edossard-numero edossard-numero--attente">Numéro à venir</p>
        )}
        {edossard.dossard === null && (
          <p className="edossard-numero-note">
            Ton numéro est attribué par l’organisation avant la course — ton QR
            fonctionne déjà.
          </p>
        )}
        <p className="edossard-badge" role="status">
          <span aria-hidden="true" className="edossard-badge-point" />
          HORS-LIGNE PRÊT
        </p>
      </article>

      <article className="card edossard-carte-qr">
        <div
          className="edossard-qr"
          role="img"
          aria-label={`QR e-dossard de ${edossard.prenom} ${edossard.nom}`}
          dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
        />
        <p className="edossard-qr-legende">
          Présente ce QR code au guichet du retrait des dossards.
        </p>
      </article>

      <article className="card">
        <h2 className="edossard-conseil-titre">Garde-le dans ta poche</h2>
        <p className="edossard-conseil">
          Ajoute cette page à l’écran d’accueil de ton téléphone (menu
          Partager → « Sur l’écran d’accueil ») : ton e-dossard reste lisible
          sans réseau, même des semaines plus tard.
        </p>
        <div className="auth-alt">
          <LogoutButton />
          <AssistanceButton phone={assistancePhone} />
        </div>
      </article>
    </section>
  );
}
