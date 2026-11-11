'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { MAX_REFUSAL_REASON_LENGTH } from '@/modules/inscriptions/domain';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

type Decision = 'valider' | 'refuser';

/** Rendu par la page uniquement pour un dossier en validation. */
export function DecisionForm({ coureurId }: { coureurId: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>('valider');
  const [motif, setMotif] = useState('');
  const [missingMotif, setMissingMotif] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setEnregistre(null);
    if (decision === 'refuser' && motif.trim().length === 0) {
      setMissingMotif(true);
      document.getElementById('decision-motif')?.focus();
      return;
    }
    setMissingMotif(false);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/dossiers/${coureurId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          motif: decision === 'refuser' ? motif.trim() : undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        if (response.status === 409) {
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
      setMotif('');
      setEnregistre(
        decision === 'valider' ? 'Dossier validé.' : 'Refus enregistré avec son motif.',
      );
      router.refresh();
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
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="fieldset">
        <legend>Décision</legend>
        <label className="option">
          <input
            type="radio"
            name="decision"
            value="valider"
            checked={decision === 'valider'}
            onChange={() => setDecision('valider')}
          />
          <span className="option-label">Valider le dossier (sans motif)</span>
        </label>
        <label className="option">
          <input
            type="radio"
            name="decision"
            value="refuser"
            checked={decision === 'refuser'}
            onChange={() => setDecision('refuser')}
          />
          <span className="option-label">Refuser le dossier (motif obligatoire)</span>
        </label>
        {decision === 'refuser' ? (
          <div className="field">
            <label htmlFor="decision-motif">Motif du refus (visible par le coureur)</label>
            <textarea
              id="decision-motif"
              rows={3}
              maxLength={MAX_REFUSAL_REASON_LENGTH}
              value={motif}
              onChange={(event) => {
                setMotif(event.target.value);
                if (event.target.value.trim().length > 0) {
                  setMissingMotif(false);
                }
              }}
              aria-invalid={missingMotif ? true : undefined}
              aria-describedby={missingMotif ? 'decision-erreur' : undefined}
            />
            {missingMotif && (
              <p id="decision-erreur" className="field-error" role="alert">
                Le motif est obligatoire pour refuser un dossier.
              </p>
            )}
          </div>
        ) : null}
      </fieldset>
      <button type="submit" className="btn-action" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer la décision'}
      </button>
      {enregistre !== null && (
        <p className="hint" role="status">
          {enregistre}
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
    </form>
  );
}
