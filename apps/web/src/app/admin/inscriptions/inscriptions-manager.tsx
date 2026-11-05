'use client';

import { useState } from 'react';

import {
  LIBELLES_REGLAGES,
  type ChampReglage,
} from '@/modules/inscriptions/domain';
import type { ReglagesAdminState } from '@/modules/inscriptions/service';

const CHAMPS: readonly ChampReglage[] = [
  'capacite',
  'seuilAffichagePlaces',
  'capaciteHebergement',
  'prixDossardDa',
  'prixHebergementDa',
  'delaiPreuveJours',
];

/** Aides de saisie : ce que chaque réglage change pour un visiteur. */
const AIDES: Record<ChampReglage, string> = {
  capacite:
    'Au-delà, les inscriptions partent en liste d’attente. Abaisser ce nombre sous le nombre d’inscrits ne supprime personne.',
  seuilAffichagePlaces:
    'Le compteur public reste muet tant qu’il reste plus de places que ce seuil.',
  capaciteHebergement: 'Nombre de lits. Son compteur est toujours affiché au formulaire.',
  prixDossardDa: 'Montant réclamé au coureur, affiché sur l’écran de dépôt de preuve.',
  prixHebergementDa: 'S’ajoute au dossard, en un seul versement.',
  delaiPreuveJours:
    'Nombre de jours pleins après l’inscription. Ne s’applique qu’aux inscriptions à venir : les échéances déjà posées ne bougent pas.',
};

function formaterInstant(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(new Date(iso));
}

export function InscriptionsManager({ etat }: { etat: ReglagesAdminState }) {
  const [courant, setCourant] = useState(etat);
  const [valeurs, setValeurs] = useState<Record<ChampReglage, string>>(() =>
    Object.fromEntries(
      CHAMPS.map((champ) => [champ, String(etat.reglages[champ])]),
    ) as Record<ChampReglage, string>,
  );
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function appliquer(etatRecu: ReglagesAdminState): void {
    setCourant(etatRecu);
    setValeurs(
      Object.fromEntries(
        CHAMPS.map((champ) => [champ, String(etatRecu.reglages[champ])]),
      ) as Record<ChampReglage, string>,
    );
  }

  async function enregistrer(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setErreurs({});
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/inscriptions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(valeurs),
      });
      const charge = (await reponse.json()) as {
        ok?: boolean;
        etat?: ReglagesAdminState;
        error?: { message?: string };
        fields?: Record<string, string>;
      };
      if (!reponse.ok) {
        setErreurs(charge.fields ?? {});
        setMessage(charge.error?.message ?? 'Enregistrement impossible.');
        return;
      }
      if (charge.etat) {
        appliquer(charge.etat);
      }
      setMessage('Réglages enregistrés.');
    } catch {
      setMessage('Connexion au serveur impossible.');
    } finally {
      setPending(false);
    }
  }

  async function attribuer(coureurId: string): Promise<void> {
    setPending(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/inscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coureurId }),
      });
      const charge = (await reponse.json()) as {
        resultat?: string;
        etat?: ReglagesAdminState;
        error?: { message?: string };
      };
      if (!reponse.ok) {
        setMessage(charge.error?.message ?? 'Attribution impossible.');
        return;
      }
      if (charge.etat) {
        appliquer(charge.etat);
      }
      // Le résultat vient du serveur, sous verrou : « complet » signifie que
      // la place a été prise entre l'affichage de la liste et le clic.
      setMessage(
        charge.resultat === 'attribuee'
          ? 'Place attribuée : le coureur a reçu un nouveau délai de dépôt.'
          : charge.resultat === 'complet'
            ? 'Aucune place libre : plus rien à attribuer pour l’instant.'
            : 'Ce coureur n’est plus en liste d’attente.',
      );
    } catch {
      setMessage('Connexion au serveur impossible.');
    } finally {
      setPending(false);
    }
  }

  const placesRestantes = Math.max(0, courant.reglages.capacite - courant.placesOccupees);
  const litsRestants = Math.max(
    0,
    courant.reglages.capaciteHebergement - courant.hebergementsOccupes,
  );

  return (
    <>
      <dl className="admin-chiffres">
        <div>
          <dt>Dossards pris</dt>
          <dd>{`${courant.placesOccupees} / ${courant.reglages.capacite}`}</dd>
        </div>
        <div>
          <dt>Places restantes</dt>
          <dd>{placesRestantes}</dd>
        </div>
        <div>
          <dt>Hébergements pris</dt>
          <dd>{`${courant.hebergementsOccupes} / ${courant.reglages.capaciteHebergement}`}</dd>
        </div>
        <div>
          <dt>Lits restants</dt>
          <dd>{litsRestants}</dd>
        </div>
        <div>
          <dt>En liste d’attente</dt>
          <dd>{courant.attente.length}</dd>
        </div>
      </dl>

      {message !== null && (
        <p className="admin-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <form onSubmit={enregistrer} noValidate>
        <fieldset className="fieldset">
          <legend>Réglages de l’édition</legend>
          {CHAMPS.map((champ) => (
            <div className="socle-champ" key={champ}>
              <label className="socle-etiquette" htmlFor={`reglage-${champ}`}>
                {LIBELLES_REGLAGES[champ]}
              </label>
              <input
                id={`reglage-${champ}`}
                name={champ}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={valeurs[champ]}
                onChange={(event) =>
                  setValeurs((anciennes) => ({ ...anciennes, [champ]: event.target.value }))
                }
                aria-invalid={erreurs[champ] !== undefined || undefined}
                aria-describedby={`aide-${champ}`}
              />
              <p id={`aide-${champ}`} className="socle-champ-aide">
                {AIDES[champ]}
              </p>
              {erreurs[champ] !== undefined && (
                <p className="field-error">{erreurs[champ]}</p>
              )}
            </div>
          ))}
        </fieldset>
        <button type="submit" className="btn-action" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer les réglages'}
        </button>
      </form>

      <section aria-labelledby="titre-attente">
        <h2 id="titre-attente">Liste d’attente</h2>
        {courant.attente.length === 0 ? (
          <p className="hint">Personne n’attend de place.</p>
        ) : (
          <table className="admin-table">
            <caption className="visually-hidden">
              Coureurs en liste d’attente, du plus ancien au plus récent
            </caption>
            <thead>
              <tr>
                <th scope="col">Coureur</th>
                <th scope="col">Épreuve</th>
                <th scope="col">Hébergement</th>
                <th scope="col">Inscrit le</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {courant.attente.map((coureur) => (
                <tr key={coureur.id}>
                  <td>
                    {`${coureur.prenom} ${coureur.nom}`}
                    <span className="meta"> {coureur.email}</span>
                  </td>
                  <td>{coureur.epreuveNom}</td>
                  <td>{coureur.hebergement ? 'Demandé' : '—'}</td>
                  <td>{formaterInstant(coureur.inscritLe)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-contour"
                      disabled={pending || placesRestantes === 0}
                      onClick={() => void attribuer(coureur.id)}
                    >
                      Attribuer une place
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="titre-journal">
        <h2 id="titre-journal">Historique des réglages</h2>
        {courant.journal.length === 0 ? (
          <p className="hint">Aucun réglage n’a encore été modifié.</p>
        ) : (
          <ul className="admin-journal">
            {courant.journal.map((ligne) => (
              <li key={`${ligne.modifieLe}-${ligne.champ}`}>
                {`${ligne.libelle} : ${ligne.ancienneValeur} → ${ligne.nouvelleValeur}`}
                <span className="meta">
                  {` ${formaterInstant(ligne.modifieLe)}${ligne.modifiePar !== null ? ` · ${ligne.modifiePar}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
