'use client';

import { formatLocalDateTime } from '@azzel/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { AssistanceButton } from '@/components/assistance-button';

import type { AcceptancesState, DocumentSummary } from '@/modules/inscriptions/service';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

function documentNote(document: DocumentSummary | undefined): string {
  return document
    ? `J’ai lu et j’accepte « ${document.titre} »`
    : 'J’ai lu et j’accepte ce document';
}

export function AcceptancesForm({
  state,
  assistancePhone,
  children,
}: {
  state: AcceptancesState;
  assistancePhone: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  // Retour sur l'écran après acceptation : les cases restent cochées (l'acceptation
  // est déjà enregistrée côté serveur) et les documents comptent comme déroulés.
  const [decharge, setDecharge] = useState(state.acceptances.decharge !== null);
  const [reglement, setReglement] = useState(state.acceptances.reglement !== null);
  // Documents deja deroules. Un document refermé RESTE déroulé : on ne redemande
  // pas de le rouvrir, la condition est de l'avoir ouvert une fois.
  const [deroules, setDeroules] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        (['decharge', 'reglement'] as const).filter(
          (slug) => state.acceptances[slug] !== null,
        ),
      ),
  );
  const [missingError, setMissingError] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  const documentsBySlug = new Map(state.documents.map((document) => [document.slug, document]));

  /**
   * Ouvrir le document conditionne la case : on ne peut pas accepter un texte
   * qu'on n'a pas affiché. Ce n'est PAS une preuve de lecture — rien ne garantit
   * que le texte a été lu — mais cela supprime le cas où l'on coche sans même
   * avoir vu de quoi il s'agit.
   */
  function marquerDeroule(slug: string): void {
    setDeroules((anciens) => {
      if (anciens.has(slug)) {
        return anciens;
      }
      const suivants = new Set(anciens);
      suivants.add(slug);
      return suivants;
    });
  }

  const aideDeroulerId = (slug: string): string => `acceptations-deroule-${slug}`;

  const both = decharge && reglement;
  const dechargeAccepte = state.acceptances.decharge;
  const reglementAccepte = state.acceptances.reglement;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    if (!decharge || !reglement) {
      setMissingError(true);
      const first = !decharge ? 'acceptations-decharge' : 'acceptations-reglement';
      document.getElementById(first)?.focus();
      return;
    }
    setMissingError(false);
    setPending(true);
    try {
      const response = await fetch('/api/inscriptions/acceptances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decharge: true, reglement: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setReconnect(true);
        }
        if (response.status === 403 || response.status === 409) {
          router.refresh();
        }
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (typeof payload === 'object' && payload !== null && 'error' in payload) {
          const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
          if (typeof error?.message === 'string' && typeof error?.action === 'string') {
            setServerError({ message: error.message, action: error.action });
          } else {
            setServerError(NETWORK_ERROR);
          }
        } else {
          setServerError(NETWORK_ERROR);
        }
        return;
      }
      // Le serveur indique la pièce suivante ; chemin interne uniquement.
      let suite = '/espace-coureur';
      try {
        const charge = (await response.json()) as { prochaineEtape?: unknown };
        if (
          typeof charge.prochaineEtape === 'string' &&
          charge.prochaineEtape.startsWith('/') &&
          !charge.prochaineEtape.startsWith('//')
        ) {
          suite = charge.prochaineEtape;
        }
      } catch {
        // Réponse illisible : les acceptations sont enregistrées.
      }
      router.replace(suite);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError(TIMEOUT_ERROR);
      } else {
        setServerError(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth auth-wide dossier-section">
      <article className="card">
        <p className="surtitre">Documents obligatoires</p>
        <h1>Décharge et règlement</h1>
        <p className="lead">
          Lis les deux documents puis coche les deux cases : ton acceptation est horodatée
          serveur et enregistre la version en cours.
        </p>
        {dechargeAccepte !== null && reglementAccepte !== null && (
          <p className="hint">
            Déjà acceptés le {formatLocalDateTime(dechargeAccepte.acceptedAt)} — décharge{' '}
            {dechargeAccepte.version} · règlement {reglementAccepte.version}. Accepter à
            nouveau met à jour l’horodatage et la version.
          </p>
        )}
        {children}

        <div className="documents">
          {state.documents.map((document) => (
            <details
              key={document.slug}
              className="document"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  marquerDeroule(document.slug);
                }
              }}
            >
              <summary>
                <span>{document.titre}</span>
                {/* Le titre du <summary> porte déjà l'action pour un lecteur
                    d'écran ; le chevron est décoratif et son infobulle ne
                    sert qu'au survol. */}
                <span className="document-chevron" title="Dérouler" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false" role="presentation">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </summary>
              <div className="document-content">{document.content}</div>
            </details>
          ))}
        </div>

        <form className="dossier-form" onSubmit={onSubmit} noValidate>
          <fieldset className="fieldset">
            <legend>Acceptations — les deux cases sont obligatoires</legend>
            {(
              [
                ['decharge', decharge, setDecharge],
                ['reglement', reglement, setReglement],
              ] as const
            ).map(([slug, coche, setCoche]) => {
              const verrouille = !deroules.has(slug);
              return (
                <div className="acceptation" key={slug}>
                  <label
                    className={
                      verrouille ? 'option option--verrouillee' : 'option'
                    }
                  >
                    <input
                      type="checkbox"
                      id={`acceptations-${slug}`}
                      checked={coche}
                      disabled={verrouille}
                      onChange={(event) => {
                        setCoche(event.target.checked);
                        if (event.target.checked) {
                          setMissingError(false);
                        }
                      }}
                      aria-invalid={missingError && !coche ? true : undefined}
                      aria-describedby={
                        [
                          verrouille ? aideDeroulerId(slug) : null,
                          missingError ? 'acceptations-erreur' : null,
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    />
                    <span className="option-label">
                      {documentNote(documentsBySlug.get(slug))}
                    </span>
                  </label>
                  {/* Une case désactivée sans explication laisse le coureur
                      bloqué sans savoir pourquoi : le motif est écrit, et il
                      disparaît dès que le document a été ouvert. */}
                  {verrouille && (
                    <p id={aideDeroulerId(slug)} className="socle-champ-aide">
                      Déroule le document ci-dessus pour pouvoir l’accepter.
                    </p>
                  )}
                </div>
              );
            })}
            {missingError && (
              <p id="acceptations-erreur" className="field-error" role="alert">
                Coche les deux cases : les deux acceptations sont obligatoires.
              </p>
            )}
          </fieldset>

          <div className="dossier-envoi">
            <p className="dossier-envoi__suite">
              Étape suivante : le dépôt de ta preuve de paiement.
            </p>
            <button type="submit" className="btn-action" disabled={pending}>
              {pending ? 'Enregistrement…' : both ? 'J’accepte les deux documents' : 'Accepter les documents'}
            </button>
          </div>
        </form>

        {serverError !== null && (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{serverError.message}</p>
            <p className="error-action">
              {serverError.action}
              {reconnect && (
                <>
                  {' '}
                  <a className="btn-lien" href="/connexion">
                    Se reconnecter
                  </a>
                </>
              )}
            </p>
            <div className="auth-alt">
              <AssistanceButton phone={assistancePhone} />
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
