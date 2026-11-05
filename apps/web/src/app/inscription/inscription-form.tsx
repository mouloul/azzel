'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { AssistanceButton } from '@/components/assistance-button';

import {
  AGE_CATEGORY_LABELS,
  FIELD_ORDER,
  TSHIRT_SIZES,
  deriveAgeAndCategory,
  formatDateFrUtc,
  hasFieldErrors,
  validateInscriptionInput,
  GENRES,
  GENRE_LABELS,
  type FieldErrors,
  type InscriptionFormInput,
  type TshirtSize,
} from '@/modules/inscriptions/domain';

import type { HebergementState, InscriptionState } from '@/modules/inscriptions/service';

const EMPTY_INPUT: InscriptionFormInput = {
  epreuve: '',
  prenom: '',
  nom: '',
  telephone: '',
  contactUrgenceNom: '',
  contactUrgenceTelephone: '',
  dateNaissance: '',
  tailleTshirt: '',
  genre: '',
  hebergement: '',
};

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const OBLIGATOIRE = <span className="champ-obligatoire"> (obligatoire)</span>;

function fieldId(key: keyof InscriptionFormInput): string {
  return `inscription-${key}`;
}

function errorId(key: keyof InscriptionFormInput): string {
  return `inscription-erreur-${key}`;
}

function aideId(key: keyof InscriptionFormInput): string {
  return `inscription-aide-${key}`;
}

function prefill(state: InscriptionState): InscriptionFormInput {
  const coureur = state.coureur;
  if (!coureur) {
    return { ...EMPTY_INPUT };
  }
  return {
    epreuve: coureur.epreuve,
    prenom: coureur.prenom,
    nom: coureur.nom,
    telephone: coureur.telephone,
    contactUrgenceNom: coureur.contactUrgenceNom,
    contactUrgenceTelephone: coureur.contactUrgenceTelephone,
    dateNaissance: coureur.dateNaissance,
    tailleTshirt: coureur.tailleTshirt,
    genre: coureur.genre ?? '',
    hebergement: coureur.hebergement ? 'oui' : '',
  };
}

export function InscriptionForm({
  state,
  assistancePhone,
  hebergement,
  children,
}: {
  state: InscriptionState;
  assistancePhone: string;
  hebergement: HebergementState;
  children?: ReactNode;
}) {
  const router = useRouter();
  const edition = state.edition;
  const [values, setValues] = useState<InscriptionFormInput>(() => prefill(state));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  if (!edition) {
    return null;
  }

  const epreuveSlugs = state.epreuves.map((epreuve) => epreuve.slug);
  const liveErrors = validateInscriptionInput(values, epreuveSlugs, edition.dateCourse);
  const complete = !hasFieldErrors(liveErrors);
  const derived = complete ? deriveAgeAndCategory(values.dateNaissance, edition.dateCourse) : null;
  const chosenEpreuve = state.epreuves.find((epreuve) => epreuve.slug === values.epreuve);

  function update(key: keyof InscriptionFormInput, value: string): void {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key] === 'string') {
        return { ...previous, [key]: undefined };
      }
      return previous;
    });
  }

  const errorFor = (key: keyof InscriptionFormInput): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    const errors = validateInscriptionInput(values, epreuveSlugs, edition.dateCourse);
    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      const first = FIELD_ORDER.find((key) => typeof errors[key] === 'string');
      if (first) {
        document.getElementById(fieldId(first))?.focus();
      }
      return;
    }
    setFieldErrors(null);
    setPending(true);
    try {
      const response = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        if (response.status === 401) {
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
          if (typeof payload === 'object' && payload !== null && 'fields' in payload) {
            const fields = (payload as { fields?: unknown }).fields;
            if (typeof fields === 'object' && fields !== null) {
              setFieldErrors(fields as FieldErrors);
              const first = FIELD_ORDER.find((key) =>
                typeof (fields as FieldErrors)[key] === 'string',
              );
              if (first) {
                document.getElementById(fieldId(first))?.focus();
              }
            }
          }
        } else {
          setServerError(NETWORK_ERROR);
        }
        return;
      }
      router.replace('/espace-coureur');
    } catch {
      setServerError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="auth auth-wide dossier-section">
      <article className="card">
        <p className="surtitre">Inscription</p>
        <h1>{state.coureur ? 'Modifier mon inscription' : 'M’inscrire'}</h1>
        <p className="lead">
          {edition.nom} — course le {formatDateFrUtc(edition.dateCourse)}. Vérifie chaque
          information avant de valider.
        </p>
        <p className="hint">
          Les inscriptions se clôturent le {formatDateFrUtc(edition.registrationClosesAt)}.
        </p>
        {state.coureur && (
          <p className="hint">
            Une inscription existe déjà à ton nom : un nouvel envoi met à jour ton dossier.
          </p>
        )}
        {children}
        <div className="dossier-edition">
          <form className="dossier-form" onSubmit={onSubmit} noValidate>
            <fieldset className="fieldset">
              <legend>Ton identité</legend>
              <div className="dossier-duo">
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('prenom')}>
                  Prénom{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('prenom')}
                  name="prenom"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={values.prenom}
                  onChange={(event) => update('prenom', event.target.value)}
                  aria-invalid={errorFor('prenom') !== null || undefined}
                  aria-describedby={
                    errorFor('prenom') !== null
                      ? errorId('prenom')
                      : undefined
                  }
                />
                {errorFor('prenom') !== null && (
                  <p id={errorId('prenom')} className="field-error">
                    {errorFor('prenom')}
                  </p>
                )}
              </div>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('nom')}>
                  Nom{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('nom')}
                  name="nom"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={values.nom}
                  onChange={(event) => update('nom', event.target.value)}
                  aria-invalid={errorFor('nom') !== null || undefined}
                  aria-describedby={errorFor('nom') !== null ? errorId('nom') : undefined}
                />
                {errorFor('nom') !== null && (
                  <p id={errorId('nom')} className="field-error">
                    {errorFor('nom')}
                  </p>
                )}
              </div>
              </div>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('dateNaissance')}>
                  Date de naissance{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('dateNaissance')}
                  name="dateNaissance"
                  type="date"
                  autoComplete="bday"
                  required
                  value={values.dateNaissance}
                  onChange={(event) => update('dateNaissance', event.target.value)}
                  aria-invalid={errorFor('dateNaissance') !== null || undefined}
                  aria-describedby={
                    [aideId('dateNaissance'), errorFor('dateNaissance') !== null ? errorId('dateNaissance') : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                <p id={aideId('dateNaissance')} className="socle-champ-aide">
                  Les épreuves sont réservées aux majeurs. Ta catégorie d’âge est
                  calculée à la date de la course.
                </p>
                {errorFor('dateNaissance') !== null && (
                  <p id={errorId('dateNaissance')} className="field-error">
                    {errorFor('dateNaissance')}
                  </p>
                )}
              </div>
              <div className="socle-champ">
                <span className="socle-etiquette" id={aideId('genre')}>
                  Genre{OBLIGATOIRE}
                </span>
                <div
                  className="option-group option-group--duo"
                  role="radiogroup"
                  aria-labelledby={aideId('genre')}
                  aria-describedby={errorFor('genre') !== null ? errorId('genre') : undefined}
                >
                  {GENRES.map((genre, index) => (
                    <label key={genre} className="option">
                      <input
                        type="radio"
                        name="genre"
                        id={index === 0 ? fieldId('genre') : `${fieldId('genre')}-${genre}`}
                        value={genre}
                        checked={values.genre === genre}
                        onChange={() => update('genre', genre)}
                        aria-invalid={errorFor('genre') !== null || undefined}
                      />
                      <span className="option-label">{GENRE_LABELS[genre]}</span>
                    </label>
                  ))}
                </div>
                {errorFor('genre') !== null && (
                  <p id={errorId('genre')} className="field-error" role="alert">
                    {errorFor('genre')}
                  </p>
                )}
              </div>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('telephone')}>
                  Téléphone{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('telephone')}
                  name="telephone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={values.telephone}
                  onChange={(event) => update('telephone', event.target.value)}
                  aria-invalid={errorFor('telephone') !== null || undefined}
                  aria-describedby={
                    [aideId('telephone'), errorFor('telephone') !== null ? errorId('telephone') : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                <p id={aideId('telephone')} className="socle-champ-aide">
                  Format local (05…) ou international (+213…).
                </p>
                {errorFor('telephone') !== null && (
                  <p id={errorId('telephone')} className="field-error">
                    {errorFor('telephone')}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <legend>Ton épreuve</legend>
              <div
                className="option-group option-group--duo"
                role="radiogroup"
                aria-label="Épreuve"
              >
                {state.epreuves.map((epreuve, index) => (
                  <label key={epreuve.slug} className="option">
                    <input
                      type="radio"
                      name="epreuve"
                      id={index === 0 ? fieldId('epreuve') : fieldId('epreuve') + '-' + epreuve.slug}
                      value={epreuve.slug}
                      checked={values.epreuve === epreuve.slug}
                      onChange={() => update('epreuve', epreuve.slug)}
                      aria-invalid={errorFor('epreuve') !== null || undefined}
                      aria-describedby={
                        [aideId('epreuve'), errorFor('epreuve') !== null ? errorId('epreuve') : null]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    />
                    <span className="option-label">{epreuve.nom}</span>
                    <span className="meta">{epreuve.distanceKm} km</span>
                  </label>
                ))}
              </div>
              <p id={aideId('epreuve')} className="socle-champ-aide">
                Une seule épreuve{OBLIGATOIRE}.
              </p>
              {errorFor('epreuve') !== null && (
                <p id={errorId('epreuve')} className="field-error" role="alert">
                  {errorFor('epreuve')}
                </p>
              )}
            </fieldset>

            <fieldset className="fieldset">
              <legend>Contact d’urgence</legend>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('contactUrgenceNom')}>
                  Nom du contact d’urgence{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('contactUrgenceNom')}
                  name="contactUrgenceNom"
                  type="text"
                  required
                  value={values.contactUrgenceNom}
                  onChange={(event) => update('contactUrgenceNom', event.target.value)}
                  aria-invalid={errorFor('contactUrgenceNom') !== null || undefined}
                  aria-describedby={
                    [aideId('contactUrgenceNom'), errorFor('contactUrgenceNom') !== null ? errorId('contactUrgenceNom') : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                <p id={aideId('contactUrgenceNom')} className="socle-champ-aide">
                  Personne joignée le jour de la course en cas de besoin.
                </p>
                {errorFor('contactUrgenceNom') !== null && (
                  <p id={errorId('contactUrgenceNom')} className="field-error">
                    {errorFor('contactUrgenceNom')}
                  </p>
                )}
              </div>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('contactUrgenceTelephone')}>
                  Téléphone du contact d’urgence{OBLIGATOIRE}
                </label>
                <input
                  id={fieldId('contactUrgenceTelephone')}
                  name="contactUrgenceTelephone"
                  type="tel"
                  inputMode="tel"
                  required
                  value={values.contactUrgenceTelephone}
                  onChange={(event) => update('contactUrgenceTelephone', event.target.value)}
                  aria-invalid={errorFor('contactUrgenceTelephone') !== null || undefined}
                  aria-describedby={
                    errorFor('contactUrgenceTelephone') !== null
                      ? errorId('contactUrgenceTelephone')
                      : undefined
                  }
                />
                {errorFor('contactUrgenceTelephone') !== null && (
                  <p id={errorId('contactUrgenceTelephone')} className="field-error">
                    {errorFor('contactUrgenceTelephone')}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <legend>T-shirt</legend>
              <div className="socle-champ">
                <label className="socle-etiquette" htmlFor={fieldId('tailleTshirt')}>
                  Taille de t-shirt{OBLIGATOIRE}
                </label>
                <select
                  id={fieldId('tailleTshirt')}
                  name="tailleTshirt"
                  required
                  value={values.tailleTshirt}
                  onChange={(event) => update('tailleTshirt', event.target.value)}
                  aria-invalid={errorFor('tailleTshirt') !== null || undefined}
                  aria-describedby={
                    errorFor('tailleTshirt') !== null ? errorId('tailleTshirt') : undefined
                  }
                >
                  <option value="">Choisir une taille</option>
                  {TSHIRT_SIZES.map((size: TshirtSize) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                {errorFor('tailleTshirt') !== null && (
                  <p id={errorId('tailleTshirt')} className="field-error">
                    {errorFor('tailleTshirt')}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <legend>Hébergement</legend>
              {/* Option contingentée : la case est désactivée quand il n'y a
                  plus de lits, jamais masquée — un coureur venu pour
                  l'hébergement doit comprendre pourquoi il ne le trouve pas. */}
              <label className="option option--case">
                <input
                  type="checkbox"
                  id={fieldId('hebergement')}
                  name="hebergement"
                  value="oui"
                  checked={values.hebergement === 'oui'}
                  disabled={hebergement.complet && values.hebergement !== 'oui'}
                  onChange={(event) =>
                    update('hebergement', event.target.checked ? 'oui' : '')
                  }
                  aria-describedby={aideId('hebergement')}
                />
                <span className="option-label">
                  {`Je souhaite un hébergement (${hebergement.prixDa} DA)`}
                </span>
              </label>
              <p id={aideId('hebergement')} className="socle-champ-aide">
                {hebergement.complet
                  ? 'Hébergement complet : tous les lits sont pris. Tu peux t’inscrire sans.'
                  : `Il reste ${hebergement.restantes} place${hebergement.restantes > 1 ? 's' : ''} sur ${hebergement.capacite}. Le montant s’ajoute à ton versement : un seul paiement, une seule preuve.`}
              </p>
            </fieldset>

            {/* Barre d'envoi collante : le formulaire fait plus d'un écran,
                et le bouton ne doit pas obliger à redescendre tout en bas. */}
            <div className="dossier-envoi">
              <button type="submit" className="btn-action" disabled={pending}>
                {pending ? 'Envoi…' : state.coureur ? 'Enregistrer les modifications' : 'Valider mon inscription'}
              </button>
            </div>
          </form>

          <aside className="dossier-recap" aria-label="Récapitulatif de ton inscription">
            {complete && derived !== null ? (
              <div className="recap" role="status" aria-live="polite">
                <p className="recap-titre">Récapitulatif avant envoi</p>
                <p>
                  <strong>
                    {values.prenom} {values.nom}
                  </strong>{' '}
                  — {chosenEpreuve?.nom ?? values.epreuve} ({chosenEpreuve?.distanceKm ?? '?'} km)
                </p>
                <p>
                  Catégorie le jour de la course : {AGE_CATEGORY_LABELS[derived.category]} ({derived.age}{' '}
                  ans)
                </p>
                <p>
                  Contact d’urgence : {values.contactUrgenceNom} · {values.contactUrgenceTelephone}
                </p>
                <p>T-shirt : {values.tailleTshirt}</p>
              </div>
            ) : (
              <p className="dossier-recap-vide hint">
                Le récapitulatif apparaît quand tous les champs obligatoires sont remplis.
              </p>
            )}
          </aside>
        </div>
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
