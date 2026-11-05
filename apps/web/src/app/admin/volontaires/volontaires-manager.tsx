'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import {
  IMPORT_ACCEPT_ATTRIBUTE,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LIBELLE,
  MAX_IMPORT_LINES,
  type ImportStatut,
  type RapportImport,
} from '@/modules/missions/domain';
import type { VolontaireSummary } from '@/modules/missions/service';

// Story 3.1 — manager volontaires : import (multipart), rapport accessible
// ligne par ligne, liste avec renvoi manuel d'invitation. Succès role="status",
// erreurs role="alert" (pattern sponsors).
// Story 10.3 — tableaux sur le gabarit commun .socle-table ; statuts en
// pastilles du socle (point + libellé, jamais la couleur seule).

const NETWORK_ERROR = {
  message: 'Connexion au serveur impossible.',
  action: 'Vérifie ta connexion puis réessaie.',
};

const TIMEOUT_ERROR = {
  message: 'Le serveur met trop de temps à répondre.',
  action: 'Réessaie dans un instant.',
};

/* Pastille d'état du rapport d'import : créé → succès, rejeté → danger,
   ignoré → point neutre (rien à signaler). */
const PASTILLE_IMPORT: Record<ImportStatut, string> = {
  'créé': 'socle-pastille--succes',
  'ignoré': '',
  'rejeté': 'socle-pastille--danger',
};

/* Pastille du statut d'invitation : la couleur du point suit l'avancement,
   le libellé porte le sens. */
const PASTILLE_INVITATION: Record<VolontaireSummary['statutInvitation'], string> = {
  en_file: 'socle-pastille--sync-attente',
  envoyee: 'socle-pastille--sync-envoye',
  echec: 'socle-pastille--danger',
  active: 'socle-pastille--succes',
  aucune: 'socle-pastille--attention',
};

function libelleStatut(statut: ImportStatut): string {
  return statut === 'créé' ? 'Créé' : statut === 'ignoré' ? 'Ignoré' : 'Rejeté';
}

async function lireErreur(
  response: Response,
): Promise<{ message: string; action: string } | null> {
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
  return { message: error.message, action: error.action };
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

/* Exporté pour le test de gabarit (story 10.3) : rendu pur, aucun état. */
export function RapportImport({ rapport }: { rapport: RapportImport }) {
  return (
    <div className="volontaires-rapport">
      <div role="status" aria-live="polite" className="volontaires-resume">
        <p className="recap-titre">Rapport d’import</p>
        <p>
          <strong>{rapport.resume.crees}</strong> créés ·{' '}
          <strong>{rapport.resume.ignores}</strong> ignorés ·{' '}
          <strong>{rapport.resume.rejetes}</strong> rejetés ·{' '}
          <strong>{rapport.resume.invitationsEnFile}</strong> invitations en file
          d’envoi.
        </p>
      </div>
      <div className="table-wrap">
        <table className="socle-table volontaires-table">
          <caption className="sr-only">
            Résultat de l’import, ligne par ligne : numéro de ligne, nom, email,
            statut et raison.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="socle-num">
                Ligne
              </th>
              <th scope="col">Nom</th>
              <th scope="col">Email</th>
              <th scope="col">Statut</th>
              <th scope="col">Raison</th>
            </tr>
          </thead>
          <tbody>
            {rapport.lignes.map((ligne) => (
              <tr key={ligne.ligne}>
                <td data-libelle="Ligne" className="socle-num">
                  {ligne.ligne}
                </td>
                <td data-libelle="Nom">{ligne.nom || '—'}</td>
                <td data-libelle="Email">{ligne.email || '—'}</td>
                <td data-libelle="Statut">
                  <span className={`socle-pastille ${PASTILLE_IMPORT[ligne.statut]}`}>
                    <span className="socle-pastille-point" aria-hidden="true" />
                    {libelleStatut(ligne.statut)}
                  </span>
                </td>
                <td data-libelle="Raison">{ligne.raison ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rapport.resume.rejetes > 0 && (
        <p className="hint">
          Corrige les lignes rejetées dans ton fichier puis réimporte-le : les
          lignes déjà créées seront signalées « ignoré », rien n’est dupliqué.
        </p>
      )}
    </div>
  );
}

function ImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [rapport, setRapport] = useState<RapportImport | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    const fichier = fileInputRef.current?.files?.[0];
    if (!fichier) {
      setErreur({
        message: 'Aucun fichier sélectionné.',
        action: 'Choisis un fichier .xlsx ou .csv puis réessaie.',
      });
      return;
    }
    if (fichier.size > MAX_IMPORT_BYTES) {
      setErreur({
        message: `Le fichier dépasse la taille maximale (${MAX_IMPORT_LIBELLE}).`,
        action: 'Allège le fichier puis réessaie.',
      });
      return;
    }
    setErreur(null);
    setReconnect(false);
    setRapport(null);
    setPending(true);
    try {
      const corps = new FormData();
      corps.append('fichier', fichier);
      const response = await fetch('/api/admin/volontaires/import', {
        method: 'POST',
        body: corps,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setErreur((await lireErreur(response)) ?? NETWORK_ERROR);
        return;
      }
      const payload = (await response.json()) as { rapport: RapportImport };
      setRapport(payload.rapport);
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setErreur(TIMEOUT_ERROR);
      } else {
        setErreur(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="fieldset">
        <legend>Importer des volontaires</legend>
        <div className="field">
          <label htmlFor="volontaires-fichier">
            Fichier .xlsx ou .csv ({MAX_IMPORT_LIBELLE}, {MAX_IMPORT_LINES}{' '}
            lignes max)
          </label>
          <input
            ref={fileInputRef}
            id="volontaires-fichier"
            name="fichier"
            type="file"
            accept={IMPORT_ACCEPT_ATTRIBUTE}
          />
          <p className="hint">
            Trois colonnes : Nom, Email, Téléphone (facultatif). L’en-tête est
            reconnu et ignoré.{' '}
            <a className="btn-lien" href="/api/admin/volontaires/modele">
              Télécharger le gabarit .xlsx
            </a>
          </p>
        </div>
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Import en cours…' : 'Importer et envoyer les invitations'}
        </button>
      </fieldset>
      {erreur !== null && <ErreurServeur erreur={erreur} reconnect={reconnect} />}
      {rapport !== null && <RapportImport rapport={rapport} />}
    </form>
  );
}

function LigneVolontaire({ volontaire }: { volontaire: VolontaireSummary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const actif = volontaire.statutInvitation === 'active';

  async function renvoie(): Promise<void> {
    if (pending || actif) {
      return;
    }
    setErreur(null);
    setSucces(null);
    setReconnect(false);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/volontaires/${volontaire.id}/invitation`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        setErreur((await lireErreur(response)) ?? NETWORK_ERROR);
        return;
      }
      setSucces(`Invitation remise en file pour ${volontaire.email}.`);
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setErreur(TIMEOUT_ERROR);
      } else {
        setErreur(NETWORK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <tr>
        <td data-libelle="Nom">{volontaire.nom}</td>
        <td data-libelle="Email">{volontaire.email}</td>
        <td data-libelle="Téléphone">{volontaire.telephone ?? '—'}</td>
        <td data-libelle="Invitation">
          <span
            className={`socle-pastille ${PASTILLE_INVITATION[volontaire.statutInvitation]}`}
          >
            <span className="socle-pastille-point" aria-hidden="true" />
            {volontaire.statutInvitationLabel}
          </span>
        </td>
        <td data-libelle="Action">
          <button
            type="button"
            className="btn-lien"
            onClick={renvoie}
            disabled={pending || actif}
          >
            {actif ? '—' : pending ? 'Envoi…' : 'Renvoyer l’invitation'}
          </button>
        </td>
      </tr>
      {erreur !== null && (
        <tr>
          <td colSpan={5}>
            <ErreurServeur erreur={erreur} reconnect={reconnect} />
          </td>
        </tr>
      )}
      {succes !== null && (
        <tr>
          <td colSpan={5}>
            <p role="status" aria-live="polite" className="hint">
              {succes}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export function VolontairesManager({ volontaires }: { volontaires: VolontaireSummary[] }) {
  return (
    <>
      <ImportForm />
      <div className="sponsors-liste volontaires-liste">
        <h2 className="recap-titre">Volontaires armés ({volontaires.length})</h2>
        {volontaires.length === 0 ? (
          <p className="hint">
            Aucun volontaire pour le moment — la liste se remplit au premier
            import.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="socle-table volontaires-table">
              <caption className="sr-only">
                Liste des volontaires : nom, email, téléphone, statut de
                l’invitation et action de renvoi.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Email</th>
                  <th scope="col">Téléphone</th>
                  <th scope="col">Invitation</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {volontaires.map((volontaire) => (
                  <LigneVolontaire key={volontaire.id} volontaire={volontaire} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Statuts : En file (email prêt à partir), Envoyée, Échec (SMTP — le
          rejeu <code>emails:send</code> repartira), À renvoyer (aucun email
          d’invitation en cours — utilise « Renvoyer l’invitation »), Activé
          (première connexion faite). Les volontaires se connectent sur{' '}
          <code>/connexion</code> avec leur email et un code reçu par email.
        </p>
      </div>
    </>
  );
}
