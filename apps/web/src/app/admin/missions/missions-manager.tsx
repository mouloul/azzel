'use client';

import { formatLocalDateTime, formatLocalHeure } from '@azzel/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  LIBELLES_MISSION_TYPE,
  MAX_CONSIGNES_LENGTH,
  MAX_LIEU_LENGTH,
  MAX_NOM_LENGTH,
  MAX_TELEPHONE_LENGTH,
  MAX_TITRE_LENGTH,
  MISSION_FIELD_ORDER,
  MISSION_TYPES,
  SECTEUR_FIELD_ORDER,
  datetimeLocalVersIso,
  isoVersDatetimeLocal,
  type MissionField,
  type MissionFieldErrors,
  type MissionType,
  type SecteurField,
  type SecteurFieldErrors,
} from '@/modules/missions/domain';
import type {
  ConflitAffectation,
  MissionSummary,
  SecteurSummary,
  VolontaireOption,
} from '@/modules/missions/service';

// Story 3.2 — manager secteurs/missions : formulaires secteur et mission typée,
// chips couverte/vacante (couverture DÉRIVÉE des affectations), affectation avec
// bandeau d’avertissement de chevauchement (role="status", jamais bloquant).
// Succès role="status", erreurs role="alert" (pattern sponsors/volontaires).

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

type FieldErrors = SecteurFieldErrors | MissionFieldErrors;

async function lireErreur(
  response: Response,
): Promise<{ message: string; action: string; fields?: FieldErrors } | null> {
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
      ? ((payload as { fields: FieldErrors }).fields ?? undefined)
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

// Convertisseurs horaires : helpers client-safe du domaine (testés unitairement,
// piègeux fuseaux — jamais réimplémentés localement).

// ---------------------------------------------------------------------------
// Formulaire secteur (nom, lieu, contact) — création et édition pré-remplie.
// ---------------------------------------------------------------------------

interface SecteurFormValues {
  nom: string;
  lieu: string;
  contact: string;
}

function valeursSecteurInitiales(secteur?: SecteurSummary): SecteurFormValues {
  return {
    nom: secteur?.nom ?? '',
    lieu: secteur?.lieu ?? '',
    contact: secteur?.contact ?? '',
  };
}

function SecteurForm({
  secteur,
  onTermine,
}: {
  secteur?: SecteurSummary;
  onTermine: () => void;
}) {
  const prefix = secteur ? `secteur-${secteur.id}` : 'secteur-ajout';
  const [values, setValues] = useState<SecteurFormValues>(() => valeursSecteurInitiales(secteur));
  const [fieldErrors, setFieldErrors] = useState<SecteurFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  const errorFor = (key: SecteurField): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update(key: keyof SecteurFormValues, value: string): void {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key as SecteurField] === 'string') {
        return { ...previous, [key as SecteurField]: undefined };
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
      const response = await fetch(
        secteur ? `/api/admin/missions/secteur/${secteur.id}` : '/api/admin/missions/secteur',
        {
          method: secteur ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nom: values.nom.trim(),
            lieu: values.lieu.trim(),
            contact: values.contact.trim(),
          }),
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
            setFieldErrors(erreur.fields as SecteurFieldErrors);
            const first = SECTEUR_FIELD_ORDER.find(
              (key) => typeof (erreur.fields as SecteurFieldErrors)?.[key] === 'string',
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
      if (secteur === undefined) {
        setValues(valeursSecteurInitiales());
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

  function champ(key: keyof SecteurFormValues, label: string, placeholder: string, hint?: string) {
    const id = `${prefix}-${key}`;
    const maxLength =
      key === 'nom' ? MAX_NOM_LENGTH : key === 'lieu' ? MAX_LIEU_LENGTH : MAX_TELEPHONE_LENGTH;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={key}
          type={key === 'contact' ? 'tel' : 'text'}
          value={values[key]}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => update(key, event.target.value)}
          aria-invalid={errorFor(key as SecteurField) !== null || undefined}
          aria-describedby={errorFor(key as SecteurField) !== null ? `${id}-erreur` : undefined}
        />
        {hint !== undefined && <p className="hint">{hint}</p>}
        {errorFor(key as SecteurField) !== null && (
          <p id={`${id}-erreur`} className="field-error">
            {errorFor(key as SecteurField)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="fieldset">
        <legend>{secteur ? `Modifier le secteur « ${secteur.nom} »` : 'Nouveau secteur'}</legend>
        {champ('nom', 'Nom (obligatoire)', 'Village départ')}
        {champ('lieu', 'Lieu (obligatoire)', 'Place du village, Aït Aïssi')}
        {champ('contact', 'Contact PC (facultatif)', '+213 555 010 203', 'Téléphone du point de contact sur place.')}
      </fieldset>
      <div className="missions-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : secteur ? 'Enregistrer le secteur' : 'Ajouter le secteur'}
        </button>
        {secteur ? (
          <button type="button" className="btn-contour" onClick={onTermine} disabled={pending}>
            Annuler
          </button>
        ) : null}
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formulaire mission (secteur, type fermé, titre, horaires, consignes).
// ---------------------------------------------------------------------------

export interface MissionFormValues {
  secteurId: string;
  type: MissionType | '';
  titre: string;
  debutLe: string;
  finLe: string;
  barriereLe: string;
  consignes: string;
  estArrivee: boolean;
}

/**
 * Valeurs après changement de TYPE (story 5.2 revue) : hors scan_checkpoint,
 * la barrière horaire et la marque arrivée n'ont pas de sens — reset
 * IMMÉDIAT, sinon une valeur masquée partait au submit (400 invisible).
 */
export function valeursApresChangementType(
  values: MissionFormValues,
  type: MissionType | '',
): MissionFormValues {
  if (type === 'scan_checkpoint') {
    return { ...values, type };
  }
  return { ...values, type, barriereLe: '', estArrivee: false };
}

/**
 * Corps JSON soumis au POST/PUT (story 5.2 revue, pur et testé) : '' → null,
 * datetime-local → ISO UTC, barriereLe et estArrivee TOUJOURS présents — le
 * PUT est un remplacement complet, omettre un champ l'effacerait de facto.
 */
export function corpsMissionSoumis(values: MissionFormValues): Record<string, unknown> {
  return {
    secteurId: values.secteurId,
    type: values.type,
    titre: values.titre.trim(),
    debutLe: datetimeLocalVersIso(values.debutLe),
    finLe: datetimeLocalVersIso(values.finLe),
    consignes: values.consignes.trim(),
    estArrivee: values.estArrivee,
    barriereLe: values.barriereLe === '' ? null : datetimeLocalVersIso(values.barriereLe),
  };
}

function valeursMissionInitiales(
  secteurs: SecteurSummary[],
  mission?: MissionSummary,
): MissionFormValues {
  return {
    secteurId: mission?.secteurId ?? secteurs[0]?.id ?? '',
    type: mission?.type ?? '',
    titre: mission?.titre ?? '',
    debutLe: mission ? isoVersDatetimeLocal(mission.debutLe) : '',
    finLe: mission ? isoVersDatetimeLocal(mission.finLe) : '',
    barriereLe: mission?.barriereLe ? isoVersDatetimeLocal(mission.barriereLe) : '',
    consignes: mission?.consignes ?? '',
    estArrivee: mission?.estArrivee ?? false,
  };
}

// Exporté pour le test de rendu (case arrivée conditionnelle au type scan).
export function MissionForm({
  secteurs,
  mission,
  onTermine,
}: {
  secteurs: SecteurSummary[];
  mission?: MissionSummary;
  onTermine: () => void;
}) {  const prefix = mission ? `mission-${mission.id}` : 'mission-ajout';
  const [values, setValues] = useState<MissionFormValues>(() =>
    valeursMissionInitiales(secteurs, mission),
  );
  const [fieldErrors, setFieldErrors] = useState<MissionFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  const errorFor = (key: MissionField): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update<K extends keyof MissionFormValues>(key: K, value: MissionFormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key as MissionField] === 'string') {
        return { ...previous, [key as MissionField]: undefined };
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
      const response = await fetch(
        mission ? `/api/admin/missions/mission/${mission.id}` : '/api/admin/missions/mission',
        {
          method: mission ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(corpsMissionSoumis(values)),
          // NB : le PUT est un REMPLACEMENT COMPLET de la mission — corpsMissionSoumis
          // envoie donc TOUJOURS estArrivee et barriereLe, même invisibles
          // (type non-scan : false / null par construction du reset de type).
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
            setFieldErrors(erreur.fields as MissionFieldErrors);
            const first = MISSION_FIELD_ORDER.find(
              (key) => typeof (erreur.fields as MissionFieldErrors)?.[key] === 'string',
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
      if (mission === undefined) {
        setValues(valeursMissionInitiales(secteurs));
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

  const champErreur = (key: MissionField): React.ReactNode => {
    if (errorFor(key) === null) {
      return null;
    }
    return (
      <p id={`${prefix}-${key}-erreur`} className="field-error">
        {errorFor(key)}
      </p>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="fieldset">
        <legend>{mission ? `Modifier « ${mission.titre} »` : 'Nouvelle mission'}</legend>
        <div className="field">
          <label htmlFor={`${prefix}-secteurId`}>Secteur (obligatoire)</label>
          <select
            id={`${prefix}-secteurId`}
            name="secteurId"
            value={values.secteurId}
            onChange={(event) => update('secteurId', event.target.value)}
            aria-invalid={errorFor('secteurId') !== null || undefined}
            aria-describedby={errorFor('secteurId') !== null ? `${prefix}-secteurId-erreur` : undefined}
          >
            {secteurs.length === 0 ? <option value="">Crée d’abord un secteur</option> : null}
            {secteurs.map((secteur) => (
              <option key={secteur.id} value={secteur.id}>
                {secteur.nom}
              </option>
            ))}
          </select>
          {champErreur('secteurId')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-type`}>Type (obligatoire)</label>
          <select
            id={`${prefix}-type`}
            name="type"
            value={values.type}
            onChange={(event) => {
              const type = event.target.value as MissionType | '';
              setValues((previous) => valeursApresChangementType(previous, type));
              // Les erreurs des champs resetés partent avec eux (sinon une
              // erreur masquée réapparaîtrait en revenant au type scan).
              setFieldErrors((previous) => {
                if (previous === null) {
                  return previous;
                }
                const suivant: MissionFieldErrors = { ...previous, type: undefined };
                if (type !== 'scan_checkpoint') {
                  suivant.barriereLe = undefined;
                  suivant.estArrivee = undefined;
                }
                return suivant;
              });
            }}
            aria-invalid={errorFor('type') !== null || undefined}
            aria-describedby={errorFor('type') !== null ? `${prefix}-type-erreur` : undefined}
          >
            <option value="">Choisis un type…</option>
            {MISSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {LIBELLES_MISSION_TYPE[type]}
              </option>
            ))}
          </select>
          {champErreur('type')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-titre`}>Titre (obligatoire)</label>
          <input
            id={`${prefix}-titre`}
            name="titre"
            type="text"
            value={values.titre}
            placeholder="Scan checkpoint PK 12"
            maxLength={MAX_TITRE_LENGTH}
            onChange={(event) => update('titre', event.target.value)}
            aria-invalid={errorFor('titre') !== null || undefined}
            aria-describedby={errorFor('titre') !== null ? `${prefix}-titre-erreur` : undefined}
          />
          {champErreur('titre')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-debutLe`}>Début (obligatoire)</label>
          <input
            id={`${prefix}-debutLe`}
            name="debutLe"
            type="datetime-local"
            value={values.debutLe}
            onChange={(event) => update('debutLe', event.target.value)}
            aria-invalid={errorFor('debutLe') !== null || undefined}
            aria-describedby={errorFor('debutLe') !== null ? `${prefix}-debutLe-erreur` : undefined}
          />
          {champErreur('debutLe')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-finLe`}>Fin (obligatoire)</label>
          <input
            id={`${prefix}-finLe`}
            name="finLe"
            type="datetime-local"
            value={values.finLe}
            onChange={(event) => update('finLe', event.target.value)}
            aria-invalid={errorFor('finLe') !== null || undefined}
            aria-describedby={errorFor('finLe') !== null ? `${prefix}-finLe-erreur` : undefined}
          />
          {champErreur('finLe')}
        </div>
        {/* Story 5.2 — la barrière horaire n'existe que pour un checkpoint :
            au-delà d'elle, un coureur retiré non vu déclenche l'alerte PC. */}
        {values.type === 'scan_checkpoint' ? (
          <div className="field">
            <label htmlFor={`${prefix}-barriereLe`}>Barrière horaire (facultative)</label>
            <input
              id={`${prefix}-barriereLe`}
              name="barriereLe"
              type="datetime-local"
              value={values.barriereLe}
              onChange={(event) => update('barriereLe', event.target.value)}
              aria-invalid={errorFor('barriereLe') !== null || undefined}
              aria-describedby={errorFor('barriereLe') !== null ? `${prefix}-barriereLe-erreur` : undefined}
            />
            <p className="hint">
              Heure limite de franchissement : un coureur parti non vu à ce
              checkpoint passé ce délai déclenche une alerte au PC course.
            </p>
            {champErreur('barriereLe')}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`${prefix}-consignes`}>Consignes (facultatif, {MAX_CONSIGNES_LENGTH} caractères max)</label>
          <textarea
            id={`${prefix}-consignes`}
            name="consignes"
            rows={4}
            value={values.consignes}
            maxLength={MAX_CONSIGNES_LENGTH}
            placeholder="Arrive 15 min avant. Materialise la zone. Appelle le PC en cas de doute…"
            onChange={(event) => update('consignes', event.target.value)}
            aria-invalid={errorFor('consignes') !== null || undefined}
            aria-describedby={errorFor('consignes') !== null ? `${prefix}-consignes-erreur` : undefined}
          />
          {champErreur('consignes')}
        </div>
        {/* La marque arrivée n'existe que pour un checkpoint (validation
            domaine + garde service) : la case n'est pas rendue autrement. */}
        {values.type === 'scan_checkpoint' ? (
          <div className="field missions-case">
            <label htmlFor={`${prefix}-estArrivee`} className="missions-case-label">
              <input
                id={`${prefix}-estArrivee`}
                name="estArrivee"
                type="checkbox"
                checked={values.estArrivee}
                onChange={(event) => update('estArrivee', event.target.checked)}
                aria-invalid={errorFor('estArrivee') !== null || undefined}
                aria-describedby={`${prefix}-estArrivee-aide`}
              />
              Checkpoint d’arrivée
            </label>
            <p className="hint" id={`${prefix}-estArrivee-aide`}>
              Un seul par édition : la carte « Arrivés » du PC course compte les
              coureurs ayant franchi ce checkpoint.
            </p>
            {champErreur('estArrivee')}
          </div>
        ) : null}
      </fieldset>
      <div className="missions-actions">
        <button type="submit" className="btn-action" disabled={pending || secteurs.length === 0}>
          {pending ? 'Enregistrement…' : mission ? 'Enregistrer la mission' : 'Ajouter la mission'}
        </button>
        {mission ? (
          <button type="button" className="btn-contour" onClick={onTermine} disabled={pending}>
            Annuler
          </button>
        ) : null}
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Ligne mission : chip couverture, affectations, affectation + désaffectation,
// bandeau d'avertissement de chevauchement (role="status", jamais bloquant).
// ---------------------------------------------------------------------------

function BandeauAvertissement({
  conflits,
  volontaireNom,
}: {
  conflits: ConflitAffectation[];
  volontaireNom: string;
}) {
  return (
    <div role="status" aria-live="polite" className="missions-avertissement">
      <p className="missions-avertissement-titre">
        Chevauchement d’horaires pour {volontaireNom} — affectation enregistrée quand même.
      </p>
      <ul>
        {conflits.map((conflit) => (
          <li key={conflit.missionId}>
            {conflit.titre} ({conflit.typeLabel}, {conflit.secteurNom}) —{' '}
            {formatLocalDateTime(conflit.debutLe)} → {formatLocalDateTime(conflit.finLe)}
          </li>
        ))}
      </ul>
      <p className="hint">
        Vérifie les horaires avec le volontaire : tu peux désaffecter si besoin.
      </p>
    </div>
  );
}

function MissionLigne({
  mission,
  volontaires,
  onModifie,
}: {
  mission: MissionSummary;
  volontaires: VolontaireOption[];
  onModifie: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [avertissement, setAvertissement] = useState<{ volontaireNom: string; conflits: ConflitAffectation[] } | null>(null);
  const [volontaireChoisi, setVolontaireChoisi] = useState('');

  async function affecte(volontaireId: string): Promise<void> {
    if (pending || volontaireId === '') {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setAvertissement(null);
    setPending(true);
    try {
      const response = await fetch('/api/admin/missions/affectation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, volontaireId }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setServerError((await lireErreur(response)) ?? NETWORK_ERROR);
        return;
      }
      const resultat = (await response.json()) as {
        cree: boolean;
        avertissement: { missions: ConflitAffectation[] } | null;
      };
      if (resultat.avertissement !== null) {
        const volontaire = volontaires.find((v) => v.id === volontaireId);
        setAvertissement({
          volontaireNom: volontaire?.nom ?? 'ce volontaire',
          conflits: resultat.avertissement.missions,
        });
      }
      setVolontaireChoisi('');
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

  async function desaffecte(volontaireId: string): Promise<void> {
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setAvertissement(null);
    setPending(true);
    try {
      const response = await fetch('/api/admin/missions/affectation', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, volontaireId }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setServerError((await lireErreur(response)) ?? NETWORK_ERROR);
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

  async function supprime(): Promise<void> {
    if (pending) {
      return;
    }
    if (!window.confirm(`Supprimer « ${mission.titre} » ? Ses affectations partiront avec elle.`)) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/missions/mission/${mission.id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setServerError((await lireErreur(response)) ?? NETWORK_ERROR);
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

  return (
    <div className="mission-ligne">
      <div className="mission-entete">
        <span className="dossier-nom">{mission.titre}</span>
        <span className="chip-meta">{mission.typeLabel}</span>
        <span
          className={
            mission.couverture === 'couverte' ? 'chip-statut chip-couverte' : 'chip-statut chip-vacante'
          }
        >
          {mission.couvertureLabel}
        </span>
        {mission.estArrivee ? <span className="chip-meta">— arrivée</span> : null}
        {mission.barriereLe !== null ? (
          <span className="chip-meta mission-barriere">— barrière {formatLocalHeure(mission.barriereLe)}</span>
        ) : null}
        <span className="meta mission-horaires">
          {formatLocalDateTime(mission.debutLe)} → {formatLocalDateTime(mission.finLe)}
        </span>
        {mission.consignes !== null && mission.consignes.length > 0 ? (
          <details className="mission-consignes">
            <summary>Consignes</summary>
            <p className="meta">{mission.consignes}</p>
          </details>
        ) : null}
      </div>
      {mission.affectations.length > 0 ? (
        <ul className="mission-affectations">
          {mission.affectations.map((affectation) => (
            <li key={affectation.volontaireId}>
              <span>{affectation.volontaireNom}</span>
              <button
                type="button"
                className="btn-lien"
                onClick={() => desaffecte(affectation.volontaireId)}
                disabled={pending}
              >
                Désaffecter
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">Aucun volontaire affecté.</p>
      )}
      {volontaires.length > 0 ? (
        <div className="mission-affecter">
          <label htmlFor={`affecter-${mission.id}`}>Affecter un volontaire</label>
          <select
            id={`affecter-${mission.id}`}
            value={volontaireChoisi}
            onChange={(event) => setVolontaireChoisi(event.target.value)}
          >
            <option value="">Choisis un volontaire…</option>
            {volontaires.map((volontaire) => (
              <option key={volontaire.id} value={volontaire.id}>
                {volontaire.nom}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-lien"
            onClick={() => affecte(volontaireChoisi)}
            disabled={pending || volontaireChoisi === ''}
          >
            {pending ? '…' : 'Affecter'}
          </button>
        </div>
      ) : (
        <p className="hint">
          Aucun volontaire importé — passe par{' '}
          <a className="btn-lien" href="/admin/volontaires">
            l’import de volontaires
          </a>
          .
        </p>
      )}
      <div className="missions-actions">
        <button type="button" className="btn-lien" onClick={onModifie}>
          Modifier
        </button>
        <button type="button" className="btn-lien" onClick={supprime} disabled={pending}>
          {pending ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>
      {avertissement !== null && (
        <BandeauAvertissement conflits={avertissement.conflits} volontaireNom={avertissement.volontaireNom} />
      )}
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloc secteur : en-tête, missions, édition/suppression.
// ---------------------------------------------------------------------------

function SecteurBloc({
  secteur,
  secteurs,
  volontaires,
  missionEnEdition,
  onMissionEdition,
  onSecteurEdition,
  secteurEnEdition,
}: {
  secteur: SecteurSummary;
  secteurs: SecteurSummary[];
  volontaires: VolontaireOption[];
  missionEnEdition: string | null;
  onMissionEdition: (id: string | null) => void;
  onSecteurEdition: () => void;
  secteurEnEdition: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);

  async function supprime(): Promise<void> {
    if (pending) {
      return;
    }
    if (!window.confirm(`Supprimer le secteur « ${secteur.nom} » ?`)) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/missions/secteur/${secteur.id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setServerError((await lireErreur(response)) ?? NETWORK_ERROR);
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

  return (
    <div className="secteur-bloc">
      <div className="secteur-entete">
        <div>
          <span className="dossier-nom">{secteur.nom}</span>
          <span className="meta dossier-email">{secteur.lieu}</span>
          {secteur.contact !== null ? (
            <span className="meta dossier-email">Contact PC : {secteur.contact}</span>
          ) : null}
        </div>
        <div className="missions-actions">
          <button type="button" className="btn-lien" onClick={onSecteurEdition}>
            Modifier
          </button>
          <button type="button" className="btn-lien" onClick={supprime} disabled={pending}>
            {pending ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
      {serverError !== null && <ErreurServeur erreur={serverError} reconnect={reconnect} />}
      {secteurEnEdition ? (
        <SecteurForm secteur={secteur} onTermine={onSecteurEdition} />
      ) : null}
      {secteur.missions.length === 0 && !secteurEnEdition ? (
        <p className="hint">Aucune mission dans ce secteur pour le moment.</p>
      ) : (
        secteur.missions.map((mission) =>
          missionEnEdition === mission.id ? (
            <MissionForm
              key={mission.id}
              secteurs={secteurs}
              mission={mission}
              onTermine={() => {
                onMissionEdition(null);
                router.refresh();
              }}
            />
          ) : (
            <MissionLigne
              key={mission.id}
              mission={mission}
              volontaires={volontaires}
              onModifie={() => onMissionEdition(mission.id)}
            />
          ),
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager : formulaire secteur, liste secteurs → missions, formulaire mission.
// ---------------------------------------------------------------------------

export function MissionsManager({
  edition,
  secteurs,
  volontaires,
}: {
  edition: { id: string; nom: string } | null;
  secteurs: SecteurSummary[];
  volontaires: VolontaireOption[];
}) {
  const router = useRouter();
  const [secteurEnEdition, setSecteurEnEdition] = useState<string | null>(null);
  const [missionEnEdition, setMissionEnEdition] = useState<string | null>(null);

  return (
    <>
      {edition === null ? (
        <p className="hint">
          Aucune édition pour ton organisation — les secteurs se créent une fois
          l’édition en place.
        </p>
      ) : (
        <>
          <SecteurForm onTermine={() => router.refresh()} />
          <div className="missions-liste">
            <h2 className="recap-titre">Secteurs et missions ({secteurs.length})</h2>
            {secteurs.length === 0 ? (
              <p className="hint">
                Aucun secteur pour le moment — crée le premier (village départ,
                ravitaillement, arrivée…) pour y poser des missions.
              </p>
            ) : (
              secteurs.map((secteur) => (
                <SecteurBloc
                  key={secteur.id}
                  secteur={secteur}
                  secteurs={secteurs}
                  volontaires={volontaires}
                  missionEnEdition={missionEnEdition}
                  onMissionEdition={setMissionEnEdition}
                  secteurEnEdition={secteurEnEdition === secteur.id}
                  onSecteurEdition={() => {
                    // Simple bascule d'édition : aucun refresh nécessaire, les
                    // props à jour arrivent avec le prochain refresh utile.
                    setSecteurEnEdition((precedent) =>
                      precedent === secteur.id ? null : secteur.id,
                    );
                  }}
                />
              ))
            )}
          </div>
          {secteurs.length > 0 ? (
            <div className="missions-liste">
              <MissionForm
                secteurs={secteurs}
                onTermine={() => router.refresh()}
              />
            </div>
          ) : null}
          <p className="hint">
            Une mission est <strong>couverte</strong> dès qu’au moins un volontaire
            y est affecté, <strong>vacante</strong> sinon. L’objectif du jour J-1 :
            aucune vacante.
          </p>
        </>
      )}
    </>
  );
}
