'use client';

import { formatLocalTime } from '@azzel/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import {
  LIBELLE_ACTION_ABANDON,
  LIBELLE_CONTACT_NON_RENSEIGNE,
  NOTE_SANS_ALERTE,
  lienAppelerSecteur,
  libelleAlerte,
  libelleDepuisAttente,
  libelleDepuisBarriere,
  trierAlertesCourse,
} from '@/lib/course/alertes-course';
import {
  aDesErreursAbandon,
  corpsAbandonSoumis,
  optionsMotifAbandon,
  premierChampAbandonEnErreur,
  validerFormulaireAbandon,
  valeursAbandonInitiales,
  type ValeursFormulaireAbandon,
} from '@/lib/course/abandon-form';
import {
  ariaLabelAnnulation,
  aDesErreursAnnulation,
  corpsAnnulationSoumis,
  validerFormulaireAnnulation,
  valeursAnnulationInitiales,
  type CibleAnnulation,
  type ValeursFormulaireAnnulation,
} from '@/lib/course/annulation-form';
import {
  appliquerResultatPolling,
  interpreterReponseEtat,
  libelleEtatCourse,
  type EtatPolling,
} from '@/lib/course/fraicheur-course';
import {
  MAX_LIEU_ABANDON_LENGTH,
  MAX_MOTIF_ANNULATION_LENGTH,
  type AbandonFieldErrors,
  type AnnulationFieldErrors,
} from '@/modules/chrono/domain';
import type { EtatCourse } from '@/modules/chrono/service';

// Story 5.1 — tableau de bord live du PC course (UX-DR-12, NFR-5) : état
// initial SSR en props, puis polling 5 s de GET /api/admin/course/etat. Mise
// à jour d'état SANS rechargement ni flash (setState ciblé, aucune animation —
// prefers-reduced-motion respecté par construction). Onglet caché : polling ET
// horloge en pause, reprise immédiate au retour (visibilitychange). Réseau
// dégradé : le dernier état RESTE affiché, sa fraîcheur vieillit, un point
// « reconnexion… » discret apparaît — jamais d'écran vide.
//
// Story 5.3 — saisie des abandons : bouton d'en-tête + action ACTIVE des
// lignes d'alerte (formulaire PRÉ-REMPLI du dossard alerté). Router-less :
// state local, POST /api/admin/course/abandon, re-poll IMMÉDIAT — les
// compteurs (Abandonnés, En course) et les alertes suivent au passage.
//
// Story 5.4 — annulation auditable : chaque ligne de board porte « … »
// (survol/focus) → dialogue inline de confirmation (motif OBLIGATOIRE) →
// POST /api/admin/course/annulation, re-poll IMMÉDIAT — la ligne disparaît
// au polling suivant, compteurs/alertes recalculés. Un SEUL dialogue à la
// fois (abandon OU annulation, verrou d'envoi partagé).

const POLLING_MS = 5_000;
const HORLOGE_MS = 1_000;
const TIMEOUT_FETCH_MS = 10_000;
const TIMEOUT_ENVOI_MS = 15_000;
/** Bandeau succès « Abandon enregistré » : expire après ~8 s (timeout nettoyé). */
const SUCCES_ABANDON_MS = 8_000;
/** Story 5.4 — alias sémantique : même durée, dit ce qu'il mesure (dialogue). */
const SUCCES_DIALOGUE_MS = SUCCES_ABANDON_MS;
/** Heure de board avant le montage client (jamais l'heure du serveur). */
const HEURE_ATTENTE = '--:--:--';

const ERREUR_RESEAU = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifiez votre connexion puis réessayez.',
};

const ERREUR_DELAI = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessayez dans un instant.',
};

function totalPartants(etat: EtatCourse): number {
  return etat.partants.reduce((total, epreuve) => total + epreuve.total, 0);
}

function Carte({
  chiffre,
  titre,
  note,
  children,
}: {
  chiffre: number;
  titre: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="course-carte">
      <p className="course-carte-chiffre">{chiffre}</p>
      <p className="course-carte-titre">{titre}</p>
      {note !== undefined && <p className="course-carte-note">{note}</p>}
      {children}
    </div>
  );
}

/** Lit l'enveloppe d'erreur d'une réponse API (champs du formulaire compris). */
async function lireErreur<TFields extends object = AbandonFieldErrors>(
  response: Response,
): Promise<{ message: string; action: string; fields?: TFields } | null> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return ERREUR_RESEAU;
  }
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return ERREUR_RESEAU;
  }
  const error = (payload as { error?: { message?: unknown; action?: unknown } }).error;
  if (typeof error?.message !== 'string' || typeof error?.action !== 'string') {
    return ERREUR_RESEAU;
  }
  const brut =
    'fields' in payload &&
    typeof (payload as { fields?: unknown }).fields === 'object' &&
    (payload as { fields?: unknown }).fields !== null
      ? ((payload as { fields: TFields }).fields ?? undefined)
      : undefined;
  return { message: error.message, action: error.action, fields: brut };
}

/** Lien « Se reconnecter » (401/403) : nouvel onglet, la saisie en cours n'est pas perdue. */
function LienReconnexion(): React.ReactNode {
  return (
    <a className="btn-lien" href="/connexion" target="_blank" rel="noopener">
      Se reconnecter
    </a>
  );
}

// ---------------------------------------------------------------------------
// Story 5.3 — formulaire inline d'abandon : dossard (recherche), lieu, motif
// fermé, heure datetime-local (défaut = ouverture du formulaire). Erreurs
// champ locales PUIS serveur (pattern missions-manager), succès remonté au
// parent qui re-polle immédiatement. Tous les champs se verrouillent pendant
// l'envoi (pending) ; le parent est informé (onEnvoiChange) pour ignorer un
// clic d'ouverture concurrent ; Annuler/Escape restent actifs.
// ---------------------------------------------------------------------------

export function FormulaireAbandon({
  dossardInitial,
  onFerme,
  onEnvoiChange,
  onEnregistre,
}: {
  dossardInitial: number | null;
  onFerme: () => void;
  /** Signale le début/fin d'un envoi au parent (verrou d'ouverture). */
  onEnvoiChange: (enCours: boolean) => void;
  /** Succès : dossard confirmé (repli local validé, jamais 0/NaN) ou null. */
  onEnregistre: (dossard: number | null) => void;
}) {
  const prefix = 'abandon';
  const [values, setValues] = useState<ValeursFormulaireAbandon>(() =>
    valeursAbandonInitiales(dossardInitial, new Date()),
  );
  const [fieldErrors, setFieldErrors] = useState<AbandonFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  const errorFor = (key: keyof ValeursFormulaireAbandon): string | null => {
    const message = fieldErrors?.[key];
    return typeof message === 'string' ? message : null;
  };

  function update<K extends keyof ValeursFormulaireAbandon>(
    key: K,
    value: ValeursFormulaireAbandon[K],
  ): void {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[key] === 'string') {
        return { ...previous, [key]: undefined };
      }
      return previous;
    });
  }

  /** Escape ferme le formulaire (même pendant un envoi — voir Annuler). */
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onFerme();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    // Validation locale d'abord : mêmes règles que le serveur, retour
    // immédiat + focus du premier champ en erreur.
    const erreurs = validerFormulaireAbandon(values, new Date());
    if (aDesErreursAbandon(erreurs)) {
      setFieldErrors(erreurs);
      const premier = premierChampAbandonEnErreur(erreurs);
      if (premier !== null) {
        document.getElementById(`${prefix}-${premier}`)?.focus();
      }
      return;
    }
    setPending(true);
    onEnvoiChange(true);
    try {
      const response = await fetch('/api/admin/course/abandon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpsAbandonSoumis(values)),
        signal: AbortSignal.timeout(TIMEOUT_ENVOI_MS),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur(response);
        if (erreur !== null) {
          setServerError({ message: erreur.message, action: erreur.action });
          if (erreur.fields !== undefined) {
            setFieldErrors(erreur.fields);
            const premier = premierChampAbandonEnErreur(erreur.fields);
            if (premier !== null) {
              document.getElementById(`${prefix}-${premier}`)?.focus();
            }
          }
        } else {
          setServerError(ERREUR_RESEAU);
        }
        return;
      }
      // Garde du payload de succès (corps null/non-objet, dossard aberrant) :
      // repli sur le dossard SAISI — validé localement avant l'envoi et
      // verrouillé depuis —, sinon succès SANS numéro. Jamais « dossard 0/NaN ».
      const payload: unknown = await response.json().catch(() => null);
      const dossardRecu =
        typeof payload === 'object' && payload !== null
          ? (payload as { abandon?: { dossard?: unknown } }).abandon?.dossard
          : undefined;
      const dossardLocal = Number.parseInt(values.dossard.trim(), 10);
      const dossard =
        typeof dossardRecu === 'number' && Number.isInteger(dossardRecu) && dossardRecu >= 1
          ? dossardRecu
          : Number.isInteger(dossardLocal) && dossardLocal >= 1
            ? dossardLocal
            : null;
      onEnregistre(dossard);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError(ERREUR_DELAI);
      } else {
        setServerError(ERREUR_RESEAU);
      }
    } finally {
      onEnvoiChange(false);
      setPending(false);
    }
  }

  function champErreur(key: keyof ValeursFormulaireAbandon): React.ReactNode {
    if (errorFor(key) === null) {
      return null;
    }
    return (
      <p id={`${prefix}-${key}-erreur`} className="field-error">
        {errorFor(key)}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="course-abandon" onKeyDown={onKeyDown}>
      <fieldset className="fieldset" disabled={pending}>
        <legend>Saisir un abandon</legend>
        <div className="field">
          <label htmlFor={`${prefix}-dossard`}>Dossard (obligatoire)</label>
          <input
            id={`${prefix}-dossard`}
            name="dossard"
            type="number"
            min={1}
            step={1}
            value={values.dossard}
            placeholder="101"
            autoFocus
            onChange={(event) => update('dossard', event.target.value)}
            aria-invalid={errorFor('dossard') !== null || undefined}
            aria-describedby={errorFor('dossard') !== null ? `${prefix}-dossard-erreur` : undefined}
          />
          {champErreur('dossard')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-lieu`}>Lieu (obligatoire)</label>
          <input
            id={`${prefix}-lieu`}
            name="lieu"
            type="text"
            value={values.lieu}
            maxLength={MAX_LIEU_ABANDON_LENGTH}
            placeholder="Col 1200, ravitaillement km 18…"
            onChange={(event) => update('lieu', event.target.value)}
            aria-invalid={errorFor('lieu') !== null || undefined}
            aria-describedby={errorFor('lieu') !== null ? `${prefix}-lieu-erreur` : undefined}
          />
          {champErreur('lieu')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-motif`}>Motif (obligatoire)</label>
          <select
            id={`${prefix}-motif`}
            name="motif"
            value={values.motif}
            onChange={(event) => update('motif', event.target.value as ValeursFormulaireAbandon['motif'])}
            aria-invalid={errorFor('motif') !== null || undefined}
            aria-describedby={errorFor('motif') !== null ? `${prefix}-motif-erreur` : undefined}
          >
            <option value="">Choisissez un motif…</option>
            {optionsMotifAbandon().map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </select>
          {champErreur('motif')}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-heure`}>Heure de l’abandon (obligatoire)</label>
          <input
            id={`${prefix}-heure`}
            name="heure"
            type="datetime-local"
            value={values.heure}
            onChange={(event) => update('heure', event.target.value)}
            aria-invalid={errorFor('heure') !== null || undefined}
            aria-describedby={
              errorFor('heure') !== null
                ? `${prefix}-heure-aide ${prefix}-heure-erreur`
                : `${prefix}-heure-aide`
            }
          />
          <p className="hint" id={`${prefix}-heure-aide`}>
            Heure locale donnée par le terrain — préremplie avec l’heure actuelle.
          </p>
          {champErreur('heure')}
        </div>
      </fieldset>
      <div className="course-abandon-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer l’abandon'}
        </button>
        <button type="button" className="btn-contour" onClick={onFerme}>
          Annuler
        </button>
      </div>
      {serverError !== null && (
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">{serverError.message}</p>
          <p className="error-action">
            {serverError.action}
            {reconnect && (
              <>
                {' '}
                {/* Nouvel onglet : la saisie en cours n'est pas perdue par
                    la navigation vers /connexion. */}
                <LienReconnexion />
              </>
            )}
          </p>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Story 5.4 — dialogue inline d'annulation auditable (gabarit abandon 5.3) :
// motif OBLIGATOIRE (1–500), confirmation explicite de la cible (dossard à
// checkpoint + HEURE locale du passage), avertissement définitif assumé.
// role="dialog" aria-modal : Escape écouté au DOCUMENT (la fermeture ne
// dépend PAS du focus interne — un fieldset disabled ne coupe jamais la
// sortie) et le Tab reste PIÉGÉ dans le dialogue. Le passage annulé reste
// archivé (AD-8) : le dialogue le DIT — le geste du PC est une correction
// tracée, jamais une suppression. Succès (« annulé » OU « déjà annulé »,
// idempotent) remonté au parent qui re-polle immédiatement ; les refus
// serveur (409 retrait, 404 introuvable, 400 champ — même l'erreur
// evenementId, rendue et focalisée) s'affichent dans la boîte d'erreur.
// ---------------------------------------------------------------------------

export function DialogueAnnulation({
  cible,
  maintenant,
  onFerme,
  onEnvoiChange,
  onAnnule,
}: {
  cible: CibleAnnulation;
  /** Horloge client — null au rendu serveur : l'heure locale n'est calculée qu'après montage (calque boards). */
  maintenant: Date | null;
  onFerme: () => void;
  /** Signale le début/fin d'un envoi au parent (verrou d'ouverture). */
  onEnvoiChange: (enCours: boolean) => void;
  /** Succès : dossard confirmé (repli sur la cible) + drapeau idempotent. */
  onAnnule: (resultat: { dossard: number | null; dejaAnnule: boolean }) => void;
}) {
  const prefix = 'annulation';
  const [values, setValues] = useState<ValeursFormulaireAnnulation>(valeursAnnulationInitiales);
  const [fieldErrors, setFieldErrors] = useState<AnnulationFieldErrors | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [pending, setPending] = useState(false);

  // Escape au NIVEAU DOCUMENT : la fermeture ne dépend d'AUCUN focus interne
  // (les keydown d'un fieldset disabled ne bouillonnent pas — écouter le
  // formulaire y serait sourd). Le dialogue ouvert = composant monté, le
  // nettoyage retire l'écoute à la fermeture.
  useEffect(() => {
    const surTouche = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onFerme();
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onFerme]);

  /** aria-modal : le Tab CYCLE dans le dialogue (premier ⇄ dernier focusable). */
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key !== 'Tab') {
      return;
    }
    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      ),
    );
    if (focusables.length === 0) {
      return;
    }
    const premier = focusables[0] as HTMLElement;
    const dernier = focusables[focusables.length - 1] as HTMLElement;
    const actif = document.activeElement;
    if (event.shiftKey && (actif === premier || !event.currentTarget.contains(actif))) {
      event.preventDefault();
      dernier.focus();
    } else if (!event.shiftKey && (actif === dernier || !event.currentTarget.contains(actif))) {
      event.preventDefault();
      premier.focus();
    }
  }

  /** Focus du premier élément en erreur : champ motif, sinon l'erreur de cible. */
  function focusErreur(): void {
    (document.getElementById(`${prefix}-motif`) ?? document.getElementById(`${prefix}-evenement-erreur`))
      ?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setServerError(null);
    setReconnect(false);
    // Validation locale d'abord : motif obligatoire 1–500 (mêmes règles que
    // le serveur), retour immédiat + focus du champ.
    const erreurs = validerFormulaireAnnulation(cible, values);
    if (aDesErreursAnnulation(erreurs)) {
      setFieldErrors(erreurs);
      focusErreur();
      return;
    }
    setPending(true);
    onEnvoiChange(true);
    try {
      const response = await fetch('/api/admin/course/annulation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpsAnnulationSoumis(cible, values)),
        signal: AbortSignal.timeout(TIMEOUT_ENVOI_MS),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = await lireErreur<AnnulationFieldErrors>(response);
        if (erreur !== null) {
          setServerError({ message: erreur.message, action: erreur.action });
          if (erreur.fields !== undefined) {
            setFieldErrors(erreur.fields);
            focusErreur();
          }
        } else {
          setServerError(ERREUR_RESEAU);
        }
        return;
      }
      // Garde du payload de succès (corps null/non-objet, dossard aberrant) :
      // repli sur la cible du board — dossard de la ligne cliquée, jamais
      // « dossard 0/NaN ». Idem pour le drapeau idempotent (défaut : annulé).
      const payload: unknown = await response.json().catch(() => null);
      const recu =
        typeof payload === 'object' && payload !== null
          ? (payload as { annulation?: { dossard?: unknown; dejaAnnule?: unknown } }).annulation
          : undefined;
      const dossard =
        typeof recu?.dossard === 'number' && Number.isInteger(recu.dossard) && recu.dossard >= 1
          ? recu.dossard
          : cible.dossard;
      onAnnule({ dossard, dejaAnnule: recu?.dejaAnnule === true });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError(ERREUR_DELAI);
      } else {
        setServerError(ERREUR_RESEAU);
      }
    } finally {
      onEnvoiChange(false);
      setPending(false);
    }
  }

  const erreurMotif = typeof fieldErrors?.motif === 'string' ? fieldErrors.motif : null;
  const erreurEvenement =
    typeof fieldErrors?.evenementId === 'string' ? fieldErrors.evenementId : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="course-annulation"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Annuler un passage"
    >
      <fieldset className="fieldset" disabled={pending}>
        <legend>Annuler un passage</legend>
        <p className="course-annulation-cible">
          Passage dossard {cible.dossard} à {cible.checkpointTitre} —{' '}
          {/* Heure CLIENT-ONLY (calque boards) : avant montage, emplacement
              d'attente — aucun écart de fuseau masqué par l'hydratation. */}
          {maintenant === null ? HEURE_ATTENTE : formatLocalTime(cible.horodatageReception)}
        </p>
        <p className="hint" id={`${prefix}-archive-aide`}>
          Opération définitive : aucun retour arrière. Le passage reste archivé
          (audit) : il disparaît des boards et des compteurs, le classement est
          recalculé. Ce geste est tracé (auteur, heure, motif).
        </p>
        {erreurEvenement !== null && (
          <p id={`${prefix}-evenement-erreur`} className="field-error" tabIndex={-1}>
            {erreurEvenement}
          </p>
        )}
        <div className="field">
          <label htmlFor={`${prefix}-motif`}>Motif (obligatoire)</label>
          <textarea
            id={`${prefix}-motif`}
            name="motif"
            rows={3}
            value={values.motif}
            maxLength={MAX_MOTIF_ANNULATION_LENGTH}
            placeholder="Mauvais scan du dossard voisin, doublon appareil…"
            autoFocus
            onChange={(event) => {
              setValues({ motif: event.target.value });
              setFieldErrors((previous) =>
                previous && typeof previous.motif === 'string' ? { ...previous, motif: undefined } : previous,
              );
            }}
            aria-invalid={erreurMotif !== null || undefined}
            aria-describedby={
              erreurMotif !== null
                ? `${prefix}-archive-aide ${prefix}-motif-erreur`
                : `${prefix}-archive-aide`
            }
          />
          {erreurMotif !== null && (
            <p id={`${prefix}-motif-erreur`} className="field-error">
              {erreurMotif}
            </p>
          )}
        </div>
      </fieldset>
      <div className="course-abandon-actions">
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Annulation…' : 'Annuler ce passage'}
        </button>
        <button type="button" className="btn-contour" onClick={onFerme}>
          Annuler
        </button>
      </div>
      {serverError !== null && (
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">{serverError.message}</p>
          <p className="error-action">
            {serverError.action}
            {reconnect && (
              <>
                {' '}
                <LienReconnexion />
              </>
            )}
          </p>
        </div>
      )}
    </form>
  );
}

/** Rendu pur (testé en SSR) : cartes, fraîcheur, boards UX-DR-12. */
export function VueCourse({
  etat,
  enEchec,
  maintenant,
  onOuvrirAbandon,
  onOuvrirAnnulation,
  children,
}: {
  etat: EtatCourse;
  enEchec: boolean;
  /** Horloge de rendu — null côté serveur (fraîcheur initiale à ~0 s). */
  maintenant: Date | null;
  /** Story 5.3 — ouvre le formulaire d'abandon (dossard prérempli depuis une alerte). */
  onOuvrirAbandon: (dossard: number | null) => void;
  /** Story 5.4 — ouvre le dialogue d'annulation de la ligne de board cliquée. */
  onOuvrirAnnulation: (cible: CibleAnnulation) => void;
  /** Bloc formulaire d'abandon — rendu côté client uniquement (jamais en SSR). */
  children?: React.ReactNode;
}) {
  const horloge = maintenant ?? new Date(etat.genereA);
  return (
    <div className="course-live">
      {/* NFR-5 + a11y : l'âge chiffré est aria-hidden et se met à jour en
          silence (toutes les secondes — jamais annoncé au lecteur d'écran) ;
          la zone role="status" n'existe que pour la TRANSITION réseau, son
          apparition/disparition est la seule chose annoncée. */}
      <div className="course-entete">
        <p className="course-fraicheur">
          <span className="course-fraicheur-age" aria-hidden="true" suppressHydrationWarning>
            {libelleEtatCourse(etat, horloge)}
          </span>
          {enEchec ? (
            <span className="course-reconnexion" role="status">
              · reconnexion…
            </span>
          ) : null}
        </p>
        {/* Story 5.3 — saisie d'un abandon au PC : le terrain appelle, le PC
            trace (le volontaire PWA ne saisit pas en V1). */}
        <button
          type="button"
          className="btn-contour course-bouton-abandon"
          onClick={() => onOuvrirAbandon(null)}
        >
          Saisir un abandon
        </button>
      </div>
      {children}

      <div className="course-cartes">
        <Carte chiffre={etat.retraits} titre="Retraits" />
        <Carte chiffre={totalPartants(etat)} titre="Partants">
          <ul className="course-partants">
            {etat.partants.map((epreuve) => (
              <li key={epreuve.epreuveId}>
                <span>{epreuve.epreuveNom}</span>
                <span className="course-partants-nombre">{epreuve.total}</span>
              </li>
            ))}
          </ul>
        </Carte>
        <Carte chiffre={etat.enCourse} titre="En course" />
        <Carte
          chiffre={etat.arrives}
          titre="Arrivés"
          note={etat.arriveeDefinie ? undefined : 'aucun checkpoint d’arrivée défini'}
        />
        {/* Story 5.3 — compteur réel des abandons de l'édition (append-only,
            AD-3 : un coureur abandonné y figure au plus une fois). */}
        <Carte chiffre={etat.abandones} titre="Abandonnés" />
      </div>

      {/* Story 5.2 — bloc alertes hors-délais (UX-DR-12) : clignotement CSS
          borné 1 flash/s, désactivé sous prefers-reduced-motion — le texte
          intégral porte l'alerte dans tous les cas. L'heure locale de la
          barrière suit le calque board : emplacement avant montage, heure
          client ensuite (aucun écart de fuseau masqué par l'hydratation).
          Vide : bloc ABSENT, note discrète à la place (l'alerte batterie
          n'existe pas avant le suivi GPS des coureurs). */}
      {etat.alertes.length > 0 ? (
        <section className="course-alertes" aria-labelledby="course-alertes-titre">
          <h2 className="course-alertes-titre" id="course-alertes-titre">
            Alertes hors-délais ({etat.alertes.length})
          </h2>
          <ul className="course-alertes-liste">
            {trierAlertesCourse(etat.alertes).map((alerte) => {
              const lien = lienAppelerSecteur(alerte.contactSecteur);
              return (
                <li
                  className="course-alerte"
                  key={`${alerte.dossard}-${alerte.checkpointId}`}
                >
                  <p className="course-alerte-texte">
                    {libelleAlerte(
                      alerte,
                      maintenant === null
                        ? libelleDepuisAttente()
                        : libelleDepuisBarriere(alerte.barriereLe),
                    )}
                  </p>
                  <div className="course-alerte-actions">
                    {lien !== null ? (
                      <a className="btn-lien" href={lien}>
                        Appeler le secteur
                      </a>
                    ) : (
                      <span className="course-alerte-inactif">{LIBELLE_CONTACT_NON_RENSEIGNE}</span>
                    )}
                    {/* Story 5.3 — action ACTIVE : formulaire prérempli du
                        dossard alerté (boucle sécurité fermée). aria-label
                        explicite : le bouton se porte à lui-même le dossard. */}
                    <button
                      type="button"
                      className="btn-lien"
                      onClick={() => onOuvrirAbandon(alerte.dossard)}
                      aria-label={`Saisir l’abandon — dossard ${alerte.dossard}`}
                    >
                      {LIBELLE_ACTION_ABANDON}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="course-sans-alerte">{NOTE_SANS_ALERTE}</p>
      )}

      <div className="course-boards">
        {etat.checkpoints.length === 0 ? (
          <p className="hint">
            Aucun checkpoint sur cette édition — crée des missions « Scan
            checkpoint » pour voir les passages.
          </p>
        ) : (
          etat.checkpoints.map((checkpoint) => (
            <section
              className="course-board"
              key={checkpoint.id}
              aria-labelledby={`board-${checkpoint.id}`}
            >
              <h2 className="course-board-titre" id={`board-${checkpoint.id}`}>
                {checkpoint.titre}
                {checkpoint.estArrivee ? ' — arrivée' : ''}
              </h2>
              {checkpoint.passages.length === 0 ? (
                <p className="course-board-vide">En attente du premier passage…</p>
              ) : (
                <ul className="course-board-liste">
                  {checkpoint.passages.map((passage) => (
                    <li className="course-board-ligne" key={passage.evenementId}>
                      <span className="course-dossard">{passage.dossard}</span>
                      {/* Heure CLIENT-ONLY (calque de l'horloge fraîcheur) :
                          le serveur rend un emplacement, l'heure locale n'est
                          calculée qu'après montage — aucun écart de fuseau
                          masqué par l'hydratation. */}
                      <span className="course-heure">
                        {maintenant === null
                          ? HEURE_ATTENTE
                          : formatLocalTime(passage.horodatageReception)}
                      </span>
                      {/* Story 5.4 — la ligne devient ACTIONNABLE : « … »
                          discret (visible au survol ET au focus clavier),
                          aria-label complet — la cible se porte à elle-même.
                          evenementId = l'événement ARBITRÉ qui fait foi sur
                          cette ligne, jamais un doublon archivé. */}
                      <button
                        type="button"
                        className="course-ligne-annuler"
                        aria-label={ariaLabelAnnulation({
                          dossard: passage.dossard,
                          checkpointTitre: checkpoint.titre,
                        })}
                        onClick={() =>
                          onOuvrirAnnulation({
                            evenementId: passage.evenementId,
                            dossard: passage.dossard,
                            checkpointTitre: checkpoint.titre,
                            horodatageReception: passage.horodatageReception,
                          })
                        }
                      >
                        …
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export function CourseLive({ etatInitial }: { etatInitial: EtatCourse }) {
  const [polling, setPolling] = useState<EtatPolling>({ etat: etatInitial, enEchec: false });
  // Horloge de rendu : null côté serveur, posée au montage — aucun libellé de
  // fraîcheur calculé avec l'heure du serveur ne peut mentir à l'hydratation.
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  // Story 5.3 — formulaire d'abandon : ouvert côté client uniquement, avec le
  // dossard éventuellement prérempli depuis une ligne d'alerte. Chaque
  // ouverture porte un NUMÉRO (clé de remontée : un succès ne ferme que SON
  // formulaire) ; un envoi en cours VERROUILLE toute nouvelle ouverture.
  const [abandon, setAbandon] = useState<{ ouverture: number; dossard: number | null } | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [succesAbandon, setSuccesAbandon] = useState<{ dossard: number | null } | null>(null);
  // Story 5.4 — dialogue d'annulation : ouvert côté client uniquement depuis
  // une ligne de board (même contrat de remontée que l'abandon).
  const [annulation, setAnnulation] = useState<{ ouverture: number; cible: CibleAnnulation } | null>(
    null,
  );
  const [succesAnnulation, setSuccesAnnulation] = useState<{
    dossard: number | null;
    dejaAnnule: boolean;
  } | null>(null);
  const ouvertureSuivante = useRef(0);
  const minuterieSucces = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Miroirs ref des surfaces ouvertes : la réponse d'un envoi peut revenir
  // APRÈS fermeture/remplacement du dialogue — le numéro d'ouverture est
  // comparé AU MOMENT DU RETOUR (calque verrou abandon), un succès tardif
  // n'agit QUE sur le dialogue encore actif.
  const abandonRef = useRef(abandon);
  const annulationRef = useRef(annulation);
  useEffect(() => {
    abandonRef.current = abandon;
  }, [abandon]);
  useEffect(() => {
    annulationRef.current = annulation;
  }, [annulation]);

  const rafraichir = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/course/etat', {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
      });
      if (!response.ok) {
        setPolling((precedent) => appliquerResultatPolling(precedent, { ok: false }));
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      setPolling((precedent) =>
        appliquerResultatPolling(precedent, interpreterReponseEtat(payload)),
      );
    } catch {
      setPolling((precedent) => appliquerResultatPolling(precedent, { ok: false }));
    }
  }, []);

  const effacerMinuterieSucces = useCallback(() => {
    if (minuterieSucces.current !== null) {
      clearTimeout(minuterieSucces.current);
      minuterieSucces.current = null;
    }
  }, []);

  const ouvrirAbandon = useCallback(
    (dossard: number | null) => {
      // Verrou : un clic d'ouverture pendant un ENVOI est ignoré — jamais
      // deux formulaires vivants, jamais de saisie perdue en vol.
      if (envoiEnCours) {
        return;
      }
      effacerMinuterieSucces();
      setSuccesAbandon(null);
      setSuccesAnnulation(null);
      setAnnulation(null);
      ouvertureSuivante.current += 1;
      setAbandon({ ouverture: ouvertureSuivante.current, dossard });
    },
    [envoiEnCours, effacerMinuterieSucces],
  );

  const fermerAbandon = useCallback(() => {
    setAbandon(null);
  }, []);

  // Succès : bandeau « Abandon enregistré — dossard N » (expiré après ~8 s,
  // minuterie nettoyée) + re-poll IMMÉDIAT. Le bandeau n'est posé QUE si SON
  // formulaire est encore la surface active (numéro d'ouverture comparé au
  // retour) : un succès retardé ne referme JAMAIS une ouverture plus récente
  // et ne surgit pas pendant un dialogue d'annulation ouvert entre-temps.
  const abandonEnregistre = useCallback(
    (ouverture: number, dossard: number | null) => {
      // Le re-poll reste universel : l'écriture a eu lieu côté serveur,
      // l'état doit la refléter au plus vite.
      void rafraichir();
      if (abandonRef.current?.ouverture !== ouverture) {
        return;
      }
      effacerMinuterieSucces();
      setAbandon(null);
      setSuccesAbandon({ dossard });
      minuterieSucces.current = setTimeout(() => setSuccesAbandon(null), SUCCES_ABANDON_MS);
    },
    [effacerMinuterieSucces, rafraichir],
  );

  // Story 5.4 — ouverture du dialogue d'annulation depuis une ligne de
  // board : même verrou d'envoi, UN seul dialogue à la fois (l'abandon
  // ouvert est remplacé).
  const ouvrirAnnulation = useCallback(
    (cible: CibleAnnulation) => {
      if (envoiEnCours) {
        return;
      }
      effacerMinuterieSucces();
      setSuccesAbandon(null);
      setSuccesAnnulation(null);
      setAbandon(null);
      ouvertureSuivante.current += 1;
      setAnnulation({ ouverture: ouvertureSuivante.current, cible });
    },
    [envoiEnCours, effacerMinuterieSucces],
  );

  const fermerAnnulation = useCallback(() => {
    setAnnulation(null);
  }, []);

  // Succès : bandeau « Passage annulé — dossard N » (ou « déjà annulé » —
  // idempotent, même succès) + re-poll IMMÉDIAT : la ligne disparaît et les
  // compteurs/alertes se recalculent au passage. Le bandeau n'est posé QUE
  // si SON dialogue est encore la surface active (numéro d'ouverture comparé
  // au retour) : une réponse tardive après fermeture/remplacement (abandon
  // ouvert entre-temps) est ignorée.
  const passageAnnule = useCallback(
    (ouverture: number, resultat: { dossard: number | null; dejaAnnule: boolean }) => {
      // Le re-poll reste universel : l'annulation a eu lieu côté serveur,
      // le board doit la refléter au plus vite.
      void rafraichir();
      if (annulationRef.current?.ouverture !== ouverture) {
        return;
      }
      effacerMinuterieSucces();
      setAnnulation(null);
      setSuccesAnnulation(resultat);
      minuterieSucces.current = setTimeout(() => setSuccesAnnulation(null), SUCCES_DIALOGUE_MS);
    },
    [effacerMinuterieSucces, rafraichir],
  );

  // Minuterie du bandeau succès toujours nettoyée au démontage.
  useEffect(() => effacerMinuterieSucces, [effacerMinuterieSucces]);

  useEffect(() => {
    setMaintenant(new Date());
    // Onglet caché : les intervals tournent mais les handlers no-op — le
    // polling est EN PAUSE (aucun fetch), l'horloge aussi ; au retour,
    // rafraîchissement IMMÉDIAT (visibilitychange) puis reprise du rythme.
    const tick = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
      }
    };
    const poll = () => {
      if (!document.hidden) {
        void rafraichir();
      }
    };
    const auRetour = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
        void rafraichir();
      }
    };
    const horlogeId = window.setInterval(tick, HORLOGE_MS);
    const pollingId = window.setInterval(poll, POLLING_MS);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(horlogeId);
      window.clearInterval(pollingId);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [rafraichir]);

  return (
    <VueCourse
      etat={polling.etat}
      enEchec={polling.enEchec}
      maintenant={maintenant}
      onOuvrirAbandon={ouvrirAbandon}
      onOuvrirAnnulation={ouvrirAnnulation}
    >
      {abandon !== null ? (
        <FormulaireAbandon
          key={abandon.ouverture}
          dossardInitial={abandon.dossard}
          onFerme={fermerAbandon}
          onEnvoiChange={setEnvoiEnCours}
          onEnregistre={(dossard) => abandonEnregistre(abandon.ouverture, dossard)}
        />
      ) : annulation !== null ? (
        <DialogueAnnulation
          key={annulation.ouverture}
          cible={annulation.cible}
          maintenant={maintenant}
          onFerme={fermerAnnulation}
          onEnvoiChange={setEnvoiEnCours}
          onAnnule={(resultat) => passageAnnule(annulation.ouverture, resultat)}
        />
      ) : succesAbandon !== null ? (
        <p className="course-abandon-succes" role="status">
          {succesAbandon.dossard !== null
            ? `Abandon enregistré — dossard ${succesAbandon.dossard}`
            : 'Abandon enregistré'}
        </p>
      ) : succesAnnulation !== null ? (
        <p className="course-dialogue-succes" role="status">
          {succesAnnulation.dossard !== null
            ? succesAnnulation.dejaAnnule
              ? `Passage déjà annulé — dossard ${succesAnnulation.dossard}`
              : `Passage annulé — dossard ${succesAnnulation.dossard}`
            : succesAnnulation.dejaAnnule
              ? 'Passage déjà annulé'
              : 'Passage annulé'}
        </p>
      ) : null}
    </VueCourse>
  );
}
