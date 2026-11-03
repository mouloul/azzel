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
  return `J’ai lu et j’accepte ${document ? document.titre.toLowerCase() : 'ce document'}`;
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
  const [decharge, setDecharge] = useState(false);
  const [reglement, setReglement] = useState(false);
  const [missingError, setMissingError] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  const documentsBySlug = new Map(state.documents.map((document) => [document.slug, document]));

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
      router.replace('/espace-coureur');
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
    <section className="auth auth-wide">
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
            <details key={document.slug} className="document">
              <summary>
                <span>{document.titre}</span>
                <span className="meta">Version {document.version}</span>
              </summary>
              <div className="document-content">{document.content}</div>
            </details>
          ))}
        </div>

        <form onSubmit={onSubmit} noValidate>
          <fieldset className="fieldset">
            <legend>Acceptations — les deux cases sont obligatoires</legend>
            <label className="option">
              <input
                type="checkbox"
                id="acceptations-decharge"
                checked={decharge}
                onChange={(event) => {
                  setDecharge(event.target.checked);
                  if (event.target.checked) {
                    setMissingError(false);
                  }
                }}
                aria-invalid={missingError && !decharge ? true : undefined}
                aria-describedby={missingError ? 'acceptations-erreur' : undefined}
              />
              <span className="option-label">{documentNote(documentsBySlug.get('decharge'))}</span>
            </label>
            <label className="option">
              <input
                type="checkbox"
                id="acceptations-reglement"
                checked={reglement}
                onChange={(event) => {
                  setReglement(event.target.checked);
                  if (event.target.checked) {
                    setMissingError(false);
                  }
                }}
                aria-invalid={missingError && !reglement ? true : undefined}
                aria-describedby={missingError ? 'acceptations-erreur' : undefined}
              />
              <span className="option-label">{documentNote(documentsBySlug.get('reglement'))}</span>
            </label>
            {missingError && (
              <p id="acceptations-erreur" className="field-error" role="alert">
                Coche les deux cases : les deux acceptations sont obligatoires.
              </p>
            )}
          </fieldset>

          <button type="submit" className="btn-action" disabled={pending}>
            {pending ? 'Enregistrement…' : both ? 'J’accepte les deux documents' : 'Accepter les documents'}
          </button>
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
