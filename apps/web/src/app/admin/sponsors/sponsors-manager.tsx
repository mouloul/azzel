'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  MAX_SPONSOR_NAME_LENGTH,
  MAX_SPONSOR_URL_LENGTH,
  SPONSOR_FIELD_ORDER,
  type SponsorField,
  type SponsorFieldErrors,
  type SponsorMode,
} from '@/modules/sponsors/domain';
import type { SponsorSummary } from '@/modules/sponsors/service';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

const OPTION_A_EXPLICATION =
  'Un seul partenaire : son nom s’affiche en capitales sur la bande forêt de la page d’accueil, avec la mention « Partenaire signature ».';
const OPTION_B_EXPLICATION =
  'Plusieurs partenaires : chaque emplacement de la grille a la même taille, dans l’ordre d’ajout, sans mise en avant.';

interface FormValues {
  name: string;
  url: string;
  logoUrl: string;
  signature: boolean;
}

function valeursInitiales(sponsor?: SponsorSummary): FormValues {
  return {
    name: sponsor?.nom ?? '',
    url: sponsor?.url ?? '',
    logoUrl: sponsor?.logoUrl ?? '',
    signature: sponsor?.signature ?? false,
  };
}

async function lireErreur(
  response: Response,
): Promise<{ message: string; action: string; fields?: SponsorFieldErrors } | null> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return NETWORK_ERROR;
  }
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return NETWORK_ERROR;
  }
  const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
  if (typeof error?.message !== 'string' || typeof error?.action !== 'string') {
    return NETWORK_ERROR;
  }
  const fields =
    'fields' in payload &&
    typeof (payload as { fields?: unknown }).fields === 'object' &&
    (payload as { fields?: unknown }).fields !== null
      ? ((payload as { fields: SponsorFieldErrors }).fields ?? undefined)
      : undefined;
  return { message: error.message, action: error.action, fields };
}

function ErreurServeur({
  erreur,
  reconnect,
}: {
  erreur: { message: string; action: string };
  reconnect: boolean;
}) {
  return (
    <div role="alert" aria-live="assertive" className="error-box">
      <p className="error-message">{erreur.message}</p>
      <p className="error-action">
        {erreur.action}
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
  );
}

function SponsorForm({
  mode,
  sponsor,
  onTermine,
}: {
  mode: SponsorMode;
  sponsor?: SponsorSummary;
  onTermine: () => void;
}) {
  const prefix = sponsor ? `sponsor-${sponsor.id}` : 'sponsor-ajout';
  const [values, setValues] = useState<FormValues>(() => valeursInitiales(sponsor));
  const [touche, setTouche] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SponsorFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  // Écrasement concurrent : le sponsor prop change (router.refresh) — si le
  // formulaire n'a pas été touché, on re-synchronise les valeurs affichées.
  useEffect(() => {
    if (!touche) {
      setValues(valeursInitiales(sponsor));
    }
  }, [sponsor, touche]);

  const errorFor = (key: SponsorField): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setTouche(true);
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key as SponsorField] === 'string') {
        return { ...previous, [key as SponsorField]: undefined };
      }
      return previous;
    });
  }

  function champ(
    key: Exclude<SponsorField, never>,
    label: string,
    type: string,
    placeholder: string,
    hinte?: string,
  ) {
    const id = `${prefix}-${key}`;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={key}
          type={type}
          value={values[key]}
          placeholder={placeholder}
          maxLength={key === 'name' ? MAX_SPONSOR_NAME_LENGTH : MAX_SPONSOR_URL_LENGTH}
          onChange={(event) => update(key, event.target.value)}
          aria-invalid={errorFor(key) !== null || undefined}
          aria-describedby={errorFor(key) !== null ? `${id}-erreur` : undefined}
        />
        {hinte !== undefined && <p className="hint">{hinte}</p>}
        {errorFor(key) !== null && (
          <p id={`${id}-erreur`} className="field-error">
            {errorFor(key)}
          </p>
        )}
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      // En mode B, la clé signature est OMISE : le serveur préserve le flag
      // existant (modifier un sponsor en mode B ne doit pas le détruire).
      const corps: Record<string, unknown> = {
        name: values.name.trim(),
        url: values.url.trim(),
        logoUrl: values.logoUrl.trim(),
      };
      if (mode === 'A') {
        corps.signature = values.signature;
      }
      const response = await fetch(
        sponsor ? `/api/admin/sponsors/${sponsor.id}` : '/api/admin/sponsors',
        {
          method: sponsor ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(corps),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        if (erreur !== null) {
          setServerError({ message: erreur.message, action: erreur.action });
          if (erreur.fields !== undefined) {
            setFieldErrors(erreur.fields);
            const first = SPONSOR_FIELD_ORDER.find(
              (key) => typeof erreur.fields?.[key] === 'string',
            );
            if (first) {
              document.getElementById(`${prefix}-${first}`)?.focus();
            }
          }
        } else {
          setServerError(NETWORK_ERROR);
        }
        return;
      }
      if (sponsor === undefined) {
        // Formulaire de création réinitialisé : un re-clic ne recrée rien.
        setValues(valeursInitiales());
        setTouche(false);
        setFieldErrors(null);
      }
      onTermine();
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
        <legend>{sponsor ? `Modifier « ${sponsor.nom} »` : 'Nouveau sponsor'}</legend>
        {champ('name', 'Nom (obligatoire)', 'text', 'Ifri')}
        {champ('url', 'Site web (facultatif)', 'url', 'https://exemple.dz')}
        {champ(
          'logoUrl',
          'Adresse du logo (facultatif)',
          'url',
          'https://exemple.dz/logo.png',
          'Préférez une adresse https:// — les logos http ne s’affichent pas sur un site https.',
        )}
        {mode === 'A' ? (
          <label className="option">
            <input
              type="checkbox"
              name="signature"
              checked={values.signature}
              onChange={(event) => update('signature', event.target.checked)}
            />
            <span className="option-label">
              Partenaire signature — seul emplacement affiché en option A
            </span>
          </label>
        ) : null}
      </fieldset>
      <div className="sponsors-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : sponsor ? 'Enregistrer' : 'Ajouter le sponsor'}
        </button>
        {sponsor ? (
          <button type="button" className="btn-contour" onClick={onTermine} disabled={pending}>
            Annuler
          </button>
        ) : null}
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

function LigneSponsor({
  mode,
  sponsor,
  onModifie,
  enEdition,
}: {
  mode: SponsorMode;
  sponsor: SponsorSummary;
  onModifie: () => void;
  enEdition: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);

  async function supprime(): Promise<void> {
    if (pending) {
      return;
    }
    if (!window.confirm(`Supprimer « ${sponsor.nom} » ?`)) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/sponsors/${sponsor.id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        setServerError(erreur ?? NETWORK_ERROR);
        return;
      }
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

  if (enEdition) {
    return <SponsorForm mode={mode} sponsor={sponsor} onTermine={onModifie} />;
  }

  return (
    <div className="sponsor-ligne">
      <div>
        <span className="dossier-nom">{sponsor.nom}</span>
        {mode === 'A' && sponsor.signature ? (
          <span className="chip-meta">Signature</span>
        ) : null}
        {sponsor.url !== null ? (
          <span className="meta dossier-email">{sponsor.url}</span>
        ) : (
          <span className="meta dossier-email">Sans site web</span>
        )}
        {sponsor.logoUrl !== null ? (
          <span className="meta dossier-email">Logo : {sponsor.logoUrl}</span>
        ) : (
          <span className="meta dossier-email">Sans logo</span>
        )}
      </div>
      <div className="sponsors-actions">
        <button type="button" className="btn-lien" onClick={onModifie}>
          Modifier
        </button>
        <button type="button" className="btn-lien" onClick={supprime} disabled={pending}>
          {pending ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </div>
  );
}

function ModeForm({ mode }: { mode: SponsorMode }) {
  const router = useRouter();
  const [choix, setChoix] = useState<SponsorMode>(mode);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || choix === mode) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setEnregistre(null);
    setPending(true);
    try {
      const response = await fetch('/api/admin/sponsors/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: choix }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        setServerError(erreur ?? NETWORK_ERROR);
        return;
      }
      setEnregistre('Mode enregistré.');
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
        <legend>Mode d’affichage sur la page d’accueil</legend>
        <label className="option">
          <input
            type="radio"
            name="mode"
            value="A"
            checked={choix === 'A'}
            onChange={() => setChoix('A')}
          />
          <span className="option-label">Option A — un partenaire signature. {OPTION_A_EXPLICATION}</span>
        </label>
        <label className="option">
          <input
            type="radio"
            name="mode"
            value="B"
            checked={choix === 'B'}
            onChange={() => setChoix('B')}
          />
          <span className="option-label">Option B — plusieurs partenaires. {OPTION_B_EXPLICATION}</span>
        </label>
        <p className="hint">
          Sans aucun sponsor configuré, la section partenaires n’apparaît pas sur
          la page d’accueil.
        </p>
      </fieldset>
      <button type="submit" className="btn-action" disabled={pending || choix === mode}>
        {pending ? 'Enregistrement…' : 'Appliquer le mode'}
      </button>
      {enregistre !== null && (
        <p className="hint" role="status">
          {enregistre}
        </p>
      )}
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

export function SponsorsManager({
  mode,
  sponsors,
}: {
  mode: SponsorMode;
  sponsors: SponsorSummary[];
}) {
  const router = useRouter();
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <>
      <ModeForm mode={mode} />
      <div className="sponsors-liste">
        <h2 className="recap-titre">Sponsors configurés</h2>
        {sponsors.length === 0 ? (
          <p className="hint">
            Aucun sponsor pour le moment — la section partenaires est absente de
            la page d’accueil.
          </p>
        ) : (
          sponsors.map((sponsor) => (
            <LigneSponsor
              key={sponsor.id}
              mode={mode}
              sponsor={sponsor}
              enEdition={enEdition === sponsor.id}
              onModifie={() => {
                setEnEdition((precedent) =>
                  precedent === sponsor.id ? null : sponsor.id,
                );
                router.refresh();
              }}
            />
          ))
        )}
      </div>
      <SponsorForm mode={mode} onTermine={() => router.refresh()} />
    </>
  );
}
