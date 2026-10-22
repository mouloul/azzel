'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  estResultatAttributionValide,
  libelleAttributionDossards,
} from '@/lib/attribution-dossards';

// Story 3.4 — bouton « Attribuer les dossards » de /admin/dossiers : lot
// idempotent côté serveur, le résultat (« 12 dossards attribués (101–112) » /
// « rien à attribuer ») est affiché et annoncé (role="status"). La réponse est
// validée en forme : un 200 malformé ne s'affiche jamais en « undefined ».

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

export function AttributionDossards() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);

  async function attribuer(): Promise<void> {
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setResultat(null);
    setPending(true);
    try {
      const response = await fetch('/api/admin/dossiers/dossards', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
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
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!estResultatAttributionValide(payload)) {
        setServerError(NETWORK_ERROR);
        return;
      }
      setResultat(libelleAttributionDossards(payload));
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError({
          message: 'Le serveur met trop de temps à répondre.',
          action: 'Réessaie dans un instant.',
        });
      } else {
        setServerError(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="attribution-dossards">
      <button type="button" className="btn-action" onClick={() => void attribuer()} disabled={pending}>
        {pending ? 'Attribution…' : 'Attribuer les dossards'}
      </button>
      {resultat !== null && (
        <p className="hint" role="status">
          {resultat}
        </p>
      )}
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
        </div>
      )}
    </div>
  );
}
