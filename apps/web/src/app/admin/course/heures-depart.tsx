'use client';

import { formatLocalDateTime } from '@azzel/shared';
import { useState, type FormEvent } from 'react';

import {
  corpsHeuresDepartSoumis,
  estEtatServeurValide,
  heuresDepartModifiees,
  valeursHeuresDepartInitiales,
  ERREUR_HEURES_DELAI,
  ERREUR_HEURES_RESEAU,
  ERREUR_HEURES_SERVEUR,
  lireErreurHeuresDepart,
  type EpreuveHeureDepartForm,
  type ValeursHeuresDepart,
} from '@/lib/course/heures-depart-form';

// Story 7.1 — carte « Heures de départ » du PC course (/admin/course) : une
// ligne par épreuve de l'édition (nom, distance, datetime-local en heure
// locale du poste), Enregistrer → PUT /api/admin/course/heures-depart, retour
// à l'état SERVEUR (la réponse remplace l'état local). La carte vit derrière
// la garde organisateur de la page : un volontaire ne la voit jamais.
// La lecture de réponse (erreurs, état serveur) est déléguée aux pures du
// lib — jamais de parse local, jamais de crash sur un 200 malformé.

const TIMEOUT_ENVOI_MS = 15_000;

export function HeuresDepart({ epreuvesInitiales }: { epreuvesInitiales: EpreuveHeureDepartForm[] }) {
  const prefix = 'heures-depart';
  const [serveur, setServeur] = useState<EpreuveHeureDepartForm[]>(epreuvesInitiales);
  const [values, setValues] = useState<ValeursHeuresDepart>(() =>
    valeursHeuresDepartInitiales(epreuvesInitiales),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const [serverError, setServerError] = useState<{ message: string; action: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [succes, setSucces] = useState(false);
  const [pending, setPending] = useState(false);

  function update(epreuveId: string, value: string): void {
    setValues((previous) => ({ ...previous, [epreuveId]: value }));
    setFieldErrors((previous) => {
      if (previous && typeof previous[epreuveId] === 'string') {
        const suivant = { ...previous };
        delete suivant[epreuveId];
        return suivant;
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
    setSucces(false);
    setPending(true);
    try {
      const response = await fetch('/api/admin/course/heures-depart', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpsHeuresDepartSoumis(values, serveur)),
        signal: AbortSignal.timeout(TIMEOUT_ENVOI_MS),
      });
      // Réseau OK : tout le reste (erreur OU état) se lit depuis le corps —
      // « serveur injoignable » ne peut plus venir d'ici.
      const corps: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setReconnect(true);
        }
        const erreur = lireErreurHeuresDepart(response.status, corps);
        setServerError({ message: erreur.message, action: erreur.action });
        if (erreur.fields !== undefined) {
          setFieldErrors(erreur.fields);
        }
        return;
      }
      // Retour à l'état SERVEUR : un 200 malformé n'efface RIEN (erreur
      // générique), la carte ne resynchronise que du contrat valide.
      if (!estEtatServeurValide(corps)) {
        setServerError({ ...ERREUR_HEURES_SERVEUR });
        return;
      }
      const recues = corps.heures.epreuves;
      setServeur(recues);
      setValues(valeursHeuresDepartInitiales(recues));
      setFieldErrors(null);
      setSucces(true);
    } catch (error) {
      // Transport SEUL : réseau ou délai — les messages dédiés vivent ici.
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        setServerError({ ...ERREUR_HEURES_DELAI });
      } else {
        setServerError({ ...ERREUR_HEURES_RESEAU });
      }
    } finally {
      setPending(false);
    }
  }

  if (serveur.length === 0) {
    return null;
  }

  // Erreur structurelle (fields.heures : liste illisible, épreuve en double) :
  // bandeau au NIVEAU de la carte, pas sous une ligne précise.
  const erreurStructurelle =
    typeof fieldErrors?.heures === 'string' ? fieldErrors.heures : null;

  return (
    <section className="course-heures" aria-labelledby="course-heures-titre">
      <h2 className="course-heures-titre" id="course-heures-titre">
        Heures de départ
      </h2>
      <p className="hint">
        Une heure officielle par épreuve (départs échelonnés) : les classements
        comparent chaque coureur à l’heure de départ de SA course. Heure locale
        du poste, enregistrée en référence serveur.
      </p>
      {erreurStructurelle !== null && (
        <p id={`${prefix}-structurel-erreur`} className="field-error" role="alert">
          {erreurStructurelle}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate>
        <fieldset className="fieldset" disabled={pending}>
          <ul className="course-heures-liste">
            {serveur.map((epreuve) => {
              const id = `${prefix}-${epreuve.epreuveId}`;
              const erreur = typeof fieldErrors?.[epreuve.epreuveId] === 'string';
              return (
                <li className="course-heures-ligne" key={epreuve.epreuveId}>
                  <label htmlFor={id}>
                    {epreuve.epreuveNom}
                    <span className="course-heures-distance"> · {epreuve.distanceKm} km</span>
                  </label>
                  <input
                    id={id}
                    name={id}
                    type="datetime-local"
                    value={values[epreuve.epreuveId] ?? ''}
                    onChange={(event) => update(epreuve.epreuveId, event.target.value)}
                    aria-invalid={erreur || undefined}
                    aria-describedby={
                      erreur
                        ? `${id}-erreur`
                        : epreuve.heureDepart !== null
                          ? `${id}-enregistree`
                          : undefined
                    }
                  />
                  {epreuve.heureDepart !== null ? (
                    <p className="hint" id={`${id}-enregistree`}>
                      Enregistrée : {formatLocalDateTime(epreuve.heureDepart)} (heure locale)
                    </p>
                  ) : (
                    <p className="hint">Non configurée — classement indisponible pour cette épreuve.</p>
                  )}
                  {erreur && (
                    <p id={`${id}-erreur`} className="field-error">
                      {fieldErrors?.[epreuve.epreuveId]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="course-heures-actions">
          <button
            type="submit"
            className="btn-action"
            disabled={pending || !heuresDepartModifiees(values, serveur)}
          >
            {pending ? 'Enregistrement…' : 'Enregistrer les heures de départ'}
          </button>
        </div>
        {succes && (
          <p className="course-heures-succes" role="status">
            Heures de départ enregistrées.
          </p>
        )}
        {serverError !== null && (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{serverError.message}</p>
            <p className="error-action">
              {serverError.action}
              {reconnect && (
                <>
                  {' '}
                  <a className="btn-lien" href="/connexion" target="_blank" rel="noopener">
                    Se reconnecter
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </form>
    </section>
  );
}
