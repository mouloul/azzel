'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

// Story 3.1 — connexion volontaire : email + mot de passe (scrypt). Messages
// génériques (aucune énumération de comptes), tutoiement côté volontaire.

interface ErrorPayload {
  message: string;
  action: string;
}

const NETWORK_ERROR: ErrorPayload = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
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

export default function ConnexionVolontairePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ErrorPayload | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setErreur(null);
    try {
      const response = await fetch('/api/iam/connexion-volontaire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, motDePasse }),
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
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace volontaire</p>
        <h1>Connexion volontaire</h1>
        <p className="lead">
          Connecte-toi avec ton email et le mot de passe défini depuis ton
          invitation.
        </p>
        <form onSubmit={onSubmit} noValidate>
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
          <div className="field">
            <label htmlFor="mot-de-passe">Mot de passe</label>
            <input
              id="mot-de-passe"
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(event) => setMotDePasse(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-action" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="hint">
          Pas encore de mot de passe ? Ouvre le lien reçu par email (« Azzel —
          ton accès volontaire »), ou demande à l’équipe de te le renvoyer.
        </p>
        {erreur !== null && (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{erreur.message}</p>
            <p className="error-action">{erreur.action}</p>
          </div>
        )}
      </article>
    </section>
  );
}
