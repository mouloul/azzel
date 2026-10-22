'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/modules/iam/constants';

// Story 3.1 — activation volontaire : le lien /invitation?jeton=… est
// unilatéral (aucune donnée affichée au-delà de la validité du jeton), le
// mot de passe est défini ici puis la session s'ouvre sur /volontaires.

interface ErrorPayload {
  message: string;
  action: string;
}

const NETWORK_ERROR: ErrorPayload = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const LIEN_INCOMPLET: ErrorPayload = {
  message: 'Ce lien d’invitation est incomplet.',
  action: 'Ouvre le lien reçu par email tel quel, ou appelle l’équipe.',
};

function toErrorPayload(payload: unknown): ErrorPayload | null {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
    if (typeof error?.message === 'string' && typeof error?.action === 'string') {
      return { message: error.message, action: error.action };
    }
  }
  return null;
}

export function InvitationForm() {
  const router = useRouter();
  const parametres = useSearchParams();
  const jeton = parametres.get('jeton') ?? '';
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<ErrorPayload | null>(
    jeton === '' ? LIEN_INCOMPLET : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (motDePasse.length < PASSWORD_MIN_LENGTH) {
      setErreur({
        message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
        action: 'Choisis un mot de passe plus long puis réessaie.',
      });
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur({
        message: 'Les deux mots de passe ne correspondent pas.',
        action: 'Resaisis-les à l’identique puis réessaie.',
      });
      return;
    }
    setPending(true);
    setErreur(null);
    try {
      const response = await fetch('/api/iam/invitation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jeton, motDePasse }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setErreur(toErrorPayload(payload) ?? NETWORK_ERROR);
        return;
      }
      router.replace('/volontaires');
    } catch {
      setErreur(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="lead">
        Choisis un mot de passe pour ton accès volontaire : il servira à chaque
        connexion, avec ton email.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="mot-de-passe">Mot de passe ({PASSWORD_MIN_LENGTH} caractères minimum)</label>
          <input
            id="mot-de-passe"
            name="motDePasse"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirmation">Confirme ton mot de passe</label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-action" disabled={pending || jeton === ''}>
          {pending ? 'Activation…' : 'Activer mon accès'}
        </button>
      </form>
      {erreur !== null && (
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">{erreur.message}</p>
          <p className="error-action">
            {erreur.action} Besoin d’aide ?{' '}
            <a className="btn-lien" href="/connexion-volontaire">
              Retour à la connexion volontaire
            </a>
          </p>
        </div>
      )}
    </>
  );
}
