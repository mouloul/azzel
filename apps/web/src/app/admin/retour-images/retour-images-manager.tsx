'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  MAX_CITATION_LENGTH,
  MAX_EDITION_LENGTH,
  MAX_PRENOM_LENGTH,
  MAX_TEMOIGNAGES_PAR_ORG,
  TEMOIGNAGE_FIELD_ORDER,
  initiales,
  resolveTrailerPlayer,
  type TemoignageField,
  type TemoignageFieldErrors,
} from '@/modules/retour-images/domain';
import type { TemoignageSummary } from '@/modules/retour-images/service';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

/** Timeout réseau 15 s — AbortController + setTimeout en repli des navigateurs
 *  sans AbortSignal.timeout (Safari < 16) : la requête part toujours bornée. */
async function fetchAvecDelai(url: string, init: RequestInit): Promise<Response> {
  if (typeof AbortSignal.timeout === 'function') {
    return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  }
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

/** Le fallback AbortController rejette avec AbortError, AbortSignal.timeout
 *  avec TimeoutError : les deux se valent (« serveur trop lent »). */
function estErreurDelai(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/** Champs d'erreur nommés côté API : champs témoignage + URL trailer. */
type ChampsErreurAdmin = TemoignageFieldErrors & { trailerUrl?: string };

async function lireErreur(
  response: Response,
): Promise<{ message: string; action: string; fields?: ChampsErreurAdmin }> {
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
  const brut = (payload as { fields?: unknown }).fields;
  const fields =
    typeof brut === 'object' && brut !== null && !Array.isArray(brut)
      ? (brut as ChampsErreurAdmin)
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

function TrailerForm({ trailerUrl }: { trailerUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(trailerUrl ?? '');
  const [touche, setTouche] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  // Écrasement concurrent : la prop change (router.refresh) — on ne
  // re-synchronise l'affichage QUE si l'organisateur n'a pas touché le champ.
  useEffect(() => {
    if (!touche) {
      setUrl(trailerUrl ?? '');
    }
  }, [trailerUrl, touche]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setEnregistre(null);
    setAvertissement(null);
    setFieldError(null);
    setPending(true);
    try {
      const response = await fetchAvecDelai('/api/admin/retour-images/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trailerUrl: url.trim() }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        setServerError({ message: erreur.message, action: erreur.action });
        // Garde typeof : une API dégénérée (valeur non-chaîne) ne doit pas crasher le rendu.
        if (typeof erreur.fields?.trailerUrl === 'string') {
          setFieldError(erreur.fields.trailerUrl);
          document.getElementById('trailer-url')?.focus();
        }
        return;
      }
      setTouche(false);
      // Adresse https acceptée mais non affichable (lien YouTube sans identifiant
      // de vidéo, chemin inconnu…) : la vitrine n'affichera rien — avertissement
      // immédiat à l'enregistrement plutôt qu'un silence côté page publique.
      if (url.trim() !== '' && resolveTrailerPlayer(url.trim()) === null) {
        setAvertissement(
          'Cette adresse ne s’affichera pas sur la vitrine — utilisez un lien YouTube/Vimeo ou un fichier vidéo direct.',
        );
      } else {
        setEnregistre(url.trim() === '' ? 'Vidéo retirée.' : 'Adresse enregistrée.');
      }
      router.refresh();
    } catch (error) {
      if (estErreurDelai(error)) {
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
        <legend>Vidéo de la première édition</legend>
        <div className="field">
          <label htmlFor="trailer-url">Adresse de la vidéo (facultative)</label>
          <input
            id="trailer-url"
            name="trailerUrl"
            type="url"
            value={url}
            placeholder="https://exemple.dz/video"
            onChange={(event) => {
              setTouche(true);
              setUrl(event.target.value);
              setFieldError(null);
            }}
            aria-invalid={fieldError !== null || undefined}
            aria-describedby={fieldError !== null ? 'trailer-url-erreur' : undefined}
          />
          <p className="hint">
            L’adresse doit commencer par https:// (YouTube, Vimeo ou lien direct) —
            laissez vide si la vidéo n’est pas encore prête : le bloc vidéo reste
            absent de la page, sans erreur.
          </p>
          {fieldError !== null && (
            <p id="trailer-url-erreur" className="field-error">
              {fieldError}
            </p>
          )}
        </div>
      </fieldset>
      <button type="submit" className="btn-action" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer la vidéo'}
      </button>
      {enregistre !== null && (
        <p className="hint" role="status">
          {enregistre}
        </p>
      )}
      {avertissement !== null && (
        <p className="field-error" role="alert">
          {avertissement}
        </p>
      )}
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

interface TemoignageFormValues {
  citation: string;
  prenom: string;
  editionReference: string;
  ordre: string;
}

function valeursInitiales(temoignage?: TemoignageSummary): TemoignageFormValues {
  return {
    citation: temoignage?.citation ?? '',
    prenom: temoignage?.prenom ?? '',
    editionReference: temoignage?.editionReference ?? '',
    ordre: temoignage !== undefined ? String(temoignage.ordre) : '',
  };
}

function TemoignageForm({
  temoignage,
  onTermine,
  onAnnule,
}: {
  temoignage?: TemoignageSummary;
  /** Appelé après un enregistrement RÉUSSI (le parent rafraîchit). */
  onTermine: () => void;
  /** Annulation (bouton) : fermeture sans rafraîchissement. */
  onAnnule?: () => void;
}) {
  const prefix = temoignage ? `temoignage-${temoignage.id}` : 'temoignage-ajout';
  const [values, setValues] = useState<TemoignageFormValues>(() => valeursInitiales(temoignage));
  const [touche, setTouche] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<TemoignageFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!touche) {
      setValues(valeursInitiales(temoignage));
    }
  }, [temoignage, touche]);

  const errorFor = (key: TemoignageField): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update<K extends keyof TemoignageFormValues>(key: K, value: TemoignageFormValues[K]): void {
    setTouche(true);
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key as TemoignageField] === 'string') {
        return { ...previous, [key as TemoignageField]: undefined };
      }
      return previous;
    });
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
      const corps: Record<string, unknown> = {
        citation: values.citation.trim(),
        prenom: values.prenom.trim(),
        editionReference: values.editionReference.trim(),
      };
      const ordreTexte = values.ordre.trim();
      if (ordreTexte !== '') {
        corps.ordre = Number(ordreTexte);
      }
      const response = await fetchAvecDelai(
        temoignage ? `/api/admin/retour-images/${temoignage.id}` : '/api/admin/retour-images',
        {
          method: temoignage ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(corps),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        setServerError({ message: erreur.message, action: erreur.action });
        if (erreur.fields !== undefined) {
          setFieldErrors(erreur.fields);
          const first = TEMOIGNAGE_FIELD_ORDER.find(
            (key) => typeof erreur.fields?.[key] === 'string',
          );
          if (first) {
            document.getElementById(`${prefix}-${first}`)?.focus();
          }
        }
        return;
      }
      if (temoignage === undefined) {
        setValues(valeursInitiales());
        setTouche(false);
        setFieldErrors(null);
      }
      onTermine();
    } catch (error) {
      if (estErreurDelai(error)) {
        setServerError(TIMEOUT_ERROR);
      } else {
        setServerError(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  const champTexte = (
    key: 'prenom' | 'editionReference',
    label: string,
    placeholder: string,
    maxLength: number,
  ) => {
    const id = `${prefix}-${key}`;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={key}
          type="text"
          value={values[key]}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => update(key, event.target.value)}
          aria-invalid={errorFor(key) !== null || undefined}
          aria-describedby={errorFor(key) !== null ? `${id}-erreur` : undefined}
        />
        {errorFor(key) !== null && (
          <p id={`${id}-erreur`} className="field-error">
            {errorFor(key)}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="fieldset">
        <legend>
          {temoignage ? `Modifier le témoignage de ${temoignage.prenom}` : 'Nouveau témoignage'}
        </legend>
        <div className="field">
          <label htmlFor={`${prefix}-citation`}>Citation (obligatoire)</label>
          <textarea
            id={`${prefix}-citation`}
            name="citation"
            value={values.citation}
            placeholder="« Une organisation impeccable, des sentiers magnifiques. »"
            maxLength={MAX_CITATION_LENGTH}
            onChange={(event) => update('citation', event.target.value)}
            aria-invalid={errorFor('citation') !== null || undefined}
            aria-describedby={`${prefix}-citation-compteur${
              errorFor('citation') !== null ? ` ${prefix}-citation-erreur` : ''
            }`}
          />
          <p className="hint" id={`${prefix}-citation-compteur`}>
            {values.citation.length}/{MAX_CITATION_LENGTH} caractères — citez le coureur,
            jamais plus d’une phrase courte.
          </p>
          {errorFor('citation') !== null && (
            <p id={`${prefix}-citation-erreur`} className="field-error">
              {errorFor('citation')}
            </p>
          )}
        </div>
        {champTexte('prenom', 'Prénom (obligatoire)', 'Yacine', MAX_PRENOM_LENGTH)}
        {champTexte(
          'editionReference',
          'Édition de référence (obligatoire)',
          'Trail 2026',
          MAX_EDITION_LENGTH,
        )}
        <div className="field">
          <label htmlFor={`${prefix}-ordre`}>Ordre d’affichage (facultatif)</label>
          <input
            id={`${prefix}-ordre`}
            name="ordre"
            type="number"
            className="temoignage-ordre"
            value={values.ordre}
            placeholder="1"
            step={1}
            onChange={(event) => update('ordre', event.target.value)}
            aria-invalid={errorFor('ordre') !== null || undefined}
            aria-describedby={errorFor('ordre') !== null ? `${prefix}-ordre-erreur` : undefined}
          />
          <p className="hint">
            Nombre entier : les témoignages s’affichent du plus petit au plus grand.
            Laissez vide pour placer en fin de liste.
          </p>
          {errorFor('ordre') !== null && (
            <p id={`${prefix}-ordre-erreur`} className="field-error">
              {errorFor('ordre')}
            </p>
          )}
        </div>
      </fieldset>
      <div className="retour-images-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : temoignage ? 'Enregistrer' : 'Ajouter le témoignage'}
        </button>
        {temoignage ? (
          <button
            type="button"
            className="btn-contour"
            onClick={onAnnule ?? onTermine}
            disabled={pending}
          >
            Annuler
          </button>
        ) : null}
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

function LigneTemoignage({
  temoignage,
  onOuvre,
  onFerme,
  onEnregistre,
  enEdition,
}: {
  temoignage: TemoignageSummary;
  /** Ouvre l'édition (rafraîchit : le formulaire repart des données à jour). */
  onOuvre: () => void;
  /** Ferme l'édition (annulation : aucun rafraîchissement utile). */
  onFerme: () => void;
  /** Ferme l'édition après enregistrement (rafraîchit la liste). */
  onEnregistre: () => void;
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
    if (!window.confirm(`Supprimer le témoignage de « ${temoignage.prenom} » ?`)) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      const response = await fetchAvecDelai(`/api/admin/retour-images/${temoignage.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        setServerError({ message: erreur.message, action: erreur.action });
        return;
      }
      router.refresh();
    } catch (error) {
      if (estErreurDelai(error)) {
        setServerError(TIMEOUT_ERROR);
      } else {
        setServerError(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  if (enEdition) {
    return (
      <TemoignageForm
        temoignage={temoignage}
        onTermine={onEnregistre}
        onAnnule={onFerme}
      />
    );
  }

  return (
    <div className="temoignage-ligne">
      <div className="temoignage-entete">
        <span className="avatar-initiales" aria-hidden="true">
          {initiales(temoignage.prenom)}
        </span>
        <div>
          <span className="dossier-nom">{temoignage.prenom}</span>
          <span className="chip-meta">Ordre {temoignage.ordre}</span>
          <span className="meta dossier-email">{temoignage.editionReference}</span>
          <p className="meta temoignage-citation">« {temoignage.citation} »</p>
        </div>
      </div>
      <div className="retour-images-actions">
        <button type="button" className="btn-lien" onClick={onOuvre}>
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

export function RetourImagesManager({
  trailerUrl,
  temoignages,
}: {
  trailerUrl: string | null;
  temoignages: TemoignageSummary[];
}) {
  const router = useRouter();
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <>
      <TrailerForm trailerUrl={trailerUrl} />
      <div className="retour-images-liste">
        <h2 className="recap-titre">Témoignages configurés</h2>
        {temoignages.length === 0 ? (
          <p className="hint">
            Aucun témoignage pour le moment — la section témoignages est absente
            de la page « Retour en images ».
          </p>
        ) : (
          temoignages.map((temoignage) => (
            <LigneTemoignage
              key={temoignage.id}
              temoignage={temoignage}
              enEdition={enEdition === temoignage.id}
              // Rafraîchit à l'OUVERTURE de l'édition et après un enregistrement —
              // jamais à la fermeture par annulation (rien n'a changé côté serveur).
              onOuvre={() => {
                setEnEdition(temoignage.id);
                router.refresh();
              }}
              onFerme={() => setEnEdition(null)}
              onEnregistre={() => {
                setEnEdition(null);
                router.refresh();
              }}
            />
          ))
        )}
      </div>
      {temoignages.length >= MAX_TEMOIGNAGES_PAR_ORG ? (
        <p className="hint">
          Maximum atteint : {MAX_TEMOIGNAGES_PAR_ORG} témoignages par organisation —
          supprime-en un avant d’en ajouter un nouveau.
        </p>
      ) : (
        <TemoignageForm onTermine={() => router.refresh()} />
      )}
    </>
  );
}
