'use client';

import { useRouter } from 'next/navigation';
import { estErreurDelai, fetchAvecDelai } from '@/lib/fetch-delai';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  MAX_CORPS_LENGTH,
  MAX_GPX_URL_LENGTH,
  MAX_TITRE_LENGTH,
  type ContenuField,
  type ContenuFieldErrors,
  type ContenuSlug,
} from '@/modules/contenus/domain';
import type { ContenuBlocAdmin } from '@/modules/contenus/service';

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

const LIBELLES_SLUGS: Record<ContenuSlug, string> = {
  'parcours-longue': 'Page Parcours',
  'parcours-moyenne': 'Page Parcours',
  'consignes-securite': 'Page La région',
  region: 'Page La région',
  hebergement: 'Page La région',
  restauration: 'Page La région',
  annexes: 'Page La région',
};

interface FormValues {
  titre: string;
  corps: string;
  gpxUrl: string;
}

function valeursInitiales(bloc: ContenuBlocAdmin): FormValues {
  return {
    titre: bloc.titre,
    corps: bloc.corps,
    gpxUrl: bloc.epreuve?.gpxUrl ?? '',
  };
}

async function lireErreur(
  response: Response,
): Promise<{ message: string; action: string; fields?: ContenuFieldErrors } | null> {
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
  // fields doit être un OBJET de champs nommés : un tableau ou tout autre type
  // est ignoré (erreurs champ par champ invisibles sinon, l'enveloppe reste).
  const fields =
    typeof brut === 'object' && brut !== null && !Array.isArray(brut)
      ? (brut as ContenuFieldErrors)
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

function BlocForm({ bloc, onTermine }: { bloc: ContenuBlocAdmin; onTermine: () => void }) {
  const prefix = `contenu-${bloc.slug}`;
  const [values, setValues] = useState<FormValues>(() => valeursInitiales(bloc));
  // Version du verrou optimiste, tenue à jour par la réponse du serveur : la
  // prop ne bouge qu'au router.refresh(), et renvoyer une version périmée
  // enfermait l'organisateur dans une boucle de 409.
  const [version, setVersion] = useState(bloc.updatedAt);

  // Un rafraîchissement (sauvegarde d'un autre bloc, conflit) réaligne la
  // version sur celle du serveur.
  useEffect(() => {
    setVersion(bloc.updatedAt);
  }, [bloc.updatedAt]);
  const [fieldErrors, setFieldErrors] = useState<ContenuFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(
    null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  const errorFor = (key: ContenuField): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key as ContenuField] === 'string') {
        return { ...previous, [key as ContenuField]: undefined };
      }
      return previous;
    });
  }

  /** aria-describedby : le hint permanent + l'erreur quand elle existe. */
  function decritPar(key: ContenuField, avecHint: boolean): string | undefined {
    const parties = [avecHint ? `${prefix}-${key}-hint` : null, errorFor(key) !== null ? `${prefix}-${key}-erreur` : null];
    const utiles = parties.filter((partie): partie is string => partie !== null);
    return utiles.length > 0 ? utiles.join(' ') : undefined;
  }

  function champErreur(key: ContenuField): ReactNode {
    if (errorFor(key) === null) {
      return null;
    }
    return (
      <p id={`${prefix}-${key}-erreur`} className="field-error">
        {errorFor(key)}
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setEnregistre(false);
    setPending(true);
    try {
      const corps: Record<string, unknown> = {
        titre: values.titre,
        corps: values.corps,
        // Verrou optimiste : la version lue accompagne l'édition — obsolète,
        // le serveur répond 409 (conflit d'édition concurrente).
        updatedAt: version,
      };
      if (bloc.epreuve !== null) {
        corps.gpxUrl = values.gpxUrl.trim();
      }
      const response = await fetchAvecDelai(`/api/admin/contenus/${bloc.slug}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        if (response.status === 409) {
          // Conflit : on recharge l'état serveur pour que la tentative
          // suivante parte avec la bonne version, au lieu de rejouer la nôtre.
          onTermine();
        }
        const erreur = await lireErreur(response);
        if (erreur !== null) {
          setServerError({ message: erreur.message, action: erreur.action });
          if (erreur.fields !== undefined) {
            setFieldErrors(erreur.fields);
          }
        } else {
          setServerError(NETWORK_ERROR);
        }
        return;
      }
      const payload = (await response.json()) as {
        contenu?: { updatedAt?: unknown };
      };
      if (typeof payload.contenu?.updatedAt === 'string') {
        setVersion(payload.contenu.updatedAt);
      }
      setEnregistre(true);
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

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${prefix}-titre`}>Titre</label>
        <input
          id={`${prefix}-titre`}
          name="titre"
          type="text"
          value={values.titre}
          maxLength={MAX_TITRE_LENGTH}
          onChange={(event) => update('titre', event.target.value)}
          aria-invalid={errorFor('titre') !== null || undefined}
          aria-describedby={decritPar('titre', false)}
        />
        {champErreur('titre')}
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-corps`}>Contenu</label>
        <textarea
          id={`${prefix}-corps`}
          name="corps"
          value={values.corps}
          maxLength={MAX_CORPS_LENGTH}
          rows={10}
          onChange={(event) => update('corps', event.target.value)}
          aria-invalid={errorFor('corps') !== null || undefined}
          aria-describedby={decritPar('corps', true)}
        />
        <p className="hint" id={`${prefix}-corps-hint`}>
          Texte simple : sépare les paragraphes par une ligne vide. Le HTML n’est
          pas interprété.
        </p>
        {champErreur('corps')}
      </div>
      {bloc.epreuve !== null ? (
        <div className="field">
          <label htmlFor={`${prefix}-gpx`}>
            Adresse du tracé GPX — {bloc.epreuve.nom}
          </label>
          <input
            id={`${prefix}-gpx`}
            name="gpxUrl"
            type="url"
            value={values.gpxUrl}
            placeholder="https://exemple.dz/tracé.gpx"
            maxLength={MAX_GPX_URL_LENGTH}
            onChange={(event) => update('gpxUrl', event.target.value)}
            aria-invalid={errorFor('gpxUrl') !== null || undefined}
            aria-describedby={decritPar('gpxUrl', true)}
          />
          <p className="hint" id={`${prefix}-gpxUrl-hint`}>
            Adresse https facultative (fichier hébergé ailleurs). Vide : la page
            affiche « Tracé à venir ». Laisse le champ tel quel pour conserver
            l’adresse actuelle après modification du texte.
          </p>
          {champErreur('gpxUrl')}
        </div>
      ) : null}
      <div className="sponsors-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {enregistre && (
        <p className="hint" role="status">
          Enregistré — visible sur le site public au rechargement.
        </p>
      )}
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

export function ContenusManager({ blocs }: { blocs: ContenuBlocAdmin[] }) {
  const router = useRouter();

  if (blocs.length === 0) {
    return (
      <p className="hint">
        Aucun bloc en base : exécute les migrations (pnpm -F @azzel/web db:migrate)
        pour créer les contenus de départ.
      </p>
    );
  }

  return (
    <div className="contenus-liste">
      {blocs.map((bloc) => (
        <details className="contenu-bloc" key={bloc.slug} open={blocs.length === 1}>
          <summary>
            <span className="contenu-entete">
              <h2>{bloc.titre}</h2>
              <span className="contenu-meta">{LIBELLES_SLUGS[bloc.slug]}</span>
              {bloc.aConfirmer ? (
                <span className="socle-chip">À confirmer par le comité</span>
              ) : null}
            </span>
          </summary>
          <BlocForm bloc={bloc} onTermine={() => router.refresh()} />
        </details>
      ))}
    </div>
  );
}
