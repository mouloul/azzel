'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { AssistanceButton } from '@/components/assistance-button';
import {
  CODE_TTL_MINUTES,
  COUREUR_HOME_PATH,
  RESEND_COOLDOWN_SEC,
} from '@/modules/iam/constants';

import type { Parcours } from './parcours';

/** Destination renvoyée par /api/auth/verify — jamais une URL absolue. */
function destinationApresConnexion(payload: unknown): string {
  const brut = (payload as { redirectTo?: unknown } | null)?.redirectTo;
  return typeof brut === 'string' && brut.startsWith('/') && !brut.startsWith('//')
    ? brut
    : COUREUR_HOME_PATH;
}

interface ErrorPayload {
  message: string;
  action: string;
}

const NETWORK_ERROR: ErrorPayload = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifiez votre connexion puis réessayez.',
};

const TTL_LABEL = `${CODE_TTL_MINUTES} minute${CODE_TTL_MINUTES > 1 ? 's' : ''}`;

interface PostResult {
  ok: boolean;
  status: number;
  payload: unknown;
  retryAfterSec: number | null;
}

async function postJson(url: string, body: unknown): Promise<PostResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const retryAfter = response.headers.get('retry-after');
  return {
    ok: response.ok,
    status: response.status,
    payload,
    retryAfterSec:
      retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null,
  };
}

function toErrorPayload(payload: unknown): ErrorPayload {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
    if (
      typeof error?.message === 'string' &&
      typeof error?.action === 'string'
    ) {
      return { message: error.message, action: error.action };
    }
  }
  return NETWORK_ERROR;
}

/**
 * Habillage du flux selon le parcours : « M'inscrire » et « Me connecter »
 * partagent le même flux email + code (le compte coureur est créé à la
 * première vérification) — seuls surtitre, titre et chapeau changent.
 */
export function libellesParcours(parcours: Parcours): {
  surtitre: string;
  titre: string;
  lead: string;
} {
  if (parcours === 'inscription') {
    return {
      surtitre: 'Créer mon compte',
      titre: 'Créer mon compte',
      lead: `Saisissez votre adresse email : vous recevrez un code à 6 chiffres, valable ${TTL_LABEL}. Vous remplirez ensuite votre inscription.`,
    };
  }
  return {
    surtitre: 'Connexion',
    titre: 'Connexion',
    lead: `Saisissez votre adresse email : vous recevrez un code à 6 chiffres, valable ${TTL_LABEL}.`,
  };
}

export function ConnexionForm({
  assistancePhone,
  parcours = 'connexion',
}: {
  assistancePhone: string;
  parcours?: Parcours;
}) {
  const libelles = libellesParcours(parcours);
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') {
      codeInputRef.current?.focus();
    }
  }, [step]);

  async function requestCode(targetEmail: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await postJson('/api/auth/code', { email: targetEmail });
      if (!result.ok) {
        setError(toErrorPayload(result.payload));
        if (result.status === 429) {
          setResendIn(result.retryAfterSec ?? RESEND_COOLDOWN_SEC);
        }
        return;
      }
      setStep('code');
      setCode('');
      setResendIn(RESEND_COOLDOWN_SEC);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  async function onSubmitEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    await requestCode(email);
  }

  async function onSubmitCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || code.length !== 6) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await postJson('/api/auth/verify', { email, code });
      if (!result.ok) {
        setError(toErrorPayload(result.payload));
        return;
      }
      // Chaque rôle a son espace : l'organisateur allait dans l'espace
      // coureur, où rien ne le renvoyait vers l'administration.
      router.replace(destinationApresConnexion(result.payload));
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth">
      <article className="card">
        {step === 'email' ? (
          <>
            <p className="surtitre">{libelles.surtitre}</p>
            <h1>{libelles.titre}</h1>
            <p className="lead">{libelles.lead}</p>
            <form onSubmit={onSubmitEmail} noValidate>
              <div className="field">
                <label htmlFor="email">Adresse email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="prenom.nom@exemple.dz"
                />
              </div>
              <button
                type="submit"
                className="btn-action"
                disabled={pending || resendIn > 0}
              >
                {pending
                  ? 'Envoi…'
                  : resendIn > 0
                    ? `Réessayer dans ${resendIn} s`
                    : 'Recevoir mon code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="surtitre">{libelles.surtitre}</p>
            <h1>Saisissez votre code</h1>
            <p className="lead">
              Un code à 6 chiffres a été envoyé à <strong>{email}</strong> — valable{' '}
              {TTL_LABEL}.
            </p>
            <form onSubmit={onSubmitCode} noValidate>
              <div className="field">
                <label htmlFor="code">Code à 6 chiffres</label>
                <input
                  ref={codeInputRef}
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D+/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  className="code-input"
                />
              </div>
              <button type="submit" className="btn-action" disabled={pending || code.length !== 6}>
                {pending ? 'Vérification…' : 'Valider mon code'}
              </button>
            </form>
            <div className="auth-alt">
              <button
                type="button"
                className="btn-contour"
                onClick={() => requestCode(email)}
                disabled={pending || resendIn > 0}
              >
                {resendIn > 0 ? `Renvoyer un code (${resendIn} s)` : 'Renvoyer un code'}
              </button>
              <button
                type="button"
                className="btn-lien"
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
                disabled={pending}
              >
                Modifier l’adresse email
              </button>
            </div>
          </>
        )}
        {error !== null && (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{error.message}</p>
            <p className="error-action">{error.action}</p>
          </div>
        )}
        {/* Story 3.1 — connexion UNIQUE tous rôles (coureur, volontaire,
            organisateur) ; canal humain si le code n'arrive pas. */}
        <div className="auth-alt">
          <AssistanceButton phone={assistancePhone} />
        </div>
      </article>
    </section>
  );
}
