'use client';

import { formatLocalDateTime } from '@azzel/shared';
import { useEffect, useState } from 'react';

import { AssistanceButton, assistancePhoneHref } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { libelleHorsLigne, libelleSynchronise } from '@/lib/fraicheur';
import {
  ecrireEtatVolontaires,
  lireEtatVolontaires,
  type EtatVolontaires,
} from '@/lib/idb-volontaires';
import { readStoredTheme, writeStoredTheme } from '@/lib/theme';
import type { MissionVolontaireView } from '@/modules/missions/service';

// Story 3.3 — PWA volontaires : revalidation à CHAQUE ouverture en ligne
// (réponse persistée en IndexedDB → fiche dans la poche dès l'affectation),
// badge d'état role="status" (« synchronisé à HH:MM » / « HORS-LIGNE PRÊT »),
// invitation au mode sombre à la première ouverture, fiches une colonne avec
// contact PC en gros bouton tel:. Le scan reste une mission parmi d'autres :
// l'épopée 4 greffera caméra et outbox sur ce shell — ne rien verrouiller.

type StatutSync = 'synchrone' | 'hors-ligne';

const ERREUR_SESSION_EXPIREE = {
  message: 'Ta session a expiré ou a été fermée.',
  action: 'Reconnecte-toi pour rafraîchir ta fiche mission.',
};

function Consignes({ texte }: { texte: string | null }) {
  if (texte === null || texte.trim().length === 0) {
    return null;
  }
  const lignes = texte
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
  if (lignes.length === 0) {
    return null;
  }
  return (
    <div className="volontaires-consignes-bloc">
      <h4 className="volontaires-surtitre">Consignes</h4>
      <ul className="volontaires-consignes-liste">
        {lignes.map((ligne, index) => (
          <li key={index}>{ligne}</li>
        ))}
      </ul>
    </div>
  );
}

function FicheMission({ mission }: { mission: MissionVolontaireView }) {
  return (
    <article className="volontaires-fiche">
      <p className="volontaires-surtitre volontaires-fiche-role">{mission.typeLabel}</p>
      <h3 className="volontaires-fiche-titre">{mission.titre}</h3>
      <dl className="volontaires-fiche-details">
        <div className="volontaires-fiche-detail">
          <dt className="volontaires-surtitre">Secteur</dt>
          <dd className="volontaires-fiche-valeur">
            {mission.secteurNom}
            {mission.secteurLieu !== null ? ` — ${mission.secteurLieu}` : ''}
          </dd>
        </div>
        <div className="volontaires-fiche-detail">
          <dt className="volontaires-surtitre">Horaires</dt>
          <dd className="volontaires-fiche-valeur" suppressHydrationWarning>
            {formatLocalDateTime(mission.debutLe)} → {formatLocalDateTime(mission.finLe)}
          </dd>
        </div>
      </dl>
      {mission.secteurContact !== null ? (
        <a
          className="volontaires-tel"
          href={assistancePhoneHref(mission.secteurContact)}
          aria-label={`Appeler le PC du secteur au ${mission.secteurContact}`}
        >
          <span className="volontaires-tel-libelle">Appeler le PC du secteur</span>
          <span className="volontaires-tel-numero">{mission.secteurContact}</span>
        </a>
      ) : null}
      <Consignes texte={mission.consignes} />
    </article>
  );
}

export function VolontairesPwa({
  etatInitial,
  email,
}: {
  etatInitial: EtatVolontaires;
  email: string;
}) {
  const [etat, setEtat] = useState<EtatVolontaires>(etatInitial);
  // Rendu serveur = données fraîches au chargement : le badge démarre
  // « synchronisé », l'effet de revalidation tranche ensuite (hydration sans
  // divergence).
  const [statut, setStatut] = useState<StatutSync>('synchrone');
  const [sessionExpiree, setSessionExpiree] = useState(false);
  const [invitationSombre, setInvitationSombre] = useState(false);

  // Revalidation : à chaque ouverture, on rappelle l'API en ligne. Succès →
  // IndexedDB (la poche). Échec → IndexedDB d'abord (le plus frais gagne,
  // comparaison ISO lexicographique), sinon l'état serveur amorce la poche.
  // Le badge « HORS-LIGNE PRÊT » ne s'affiche que réseau réellement coupé :
  // un 5xx en ligne n'est pas « hors-ligne », l'état le plus frais reste
  // affiché comme synchronisé.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const response = await fetch('/api/volontaires/etat', { cache: 'no-store' });
        if (response.status === 401 || response.status === 403) {
          if (!annule) {
            setSessionExpiree(true);
          }
          return;
        }
        if (!response.ok) {
          throw new Error('etat injoignable');
        }
        const payload = (await response.json()) as EtatVolontaires;
        if (annule) {
          return;
        }
        setEtat(payload);
        setStatut('synchrone');
        await ecrireEtatVolontaires(payload);
      } catch {
        const enCache = await lireEtatVolontaires();
        if (annule) {
          return;
        }
        if (enCache !== null) {
          if (enCache.generéA > etatInitial.generéA) {
            setEtat(enCache);
          }
        } else {
          await ecrireEtatVolontaires(etatInitial);
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setStatut('hors-ligne');
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Invitation au mode sombre : uniquement à la première ouverture (aucun
  // choix mémorisé). La bascule de l'en-tête du site reste disponible ensuite.
  useEffect(() => {
    setInvitationSombre(readStoredTheme() === null);
  }, []);

  const choisirTheme = (theme: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStoredTheme(theme);
    setInvitationSombre(false);
  };

  if (sessionExpiree) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Tu es déconnecté</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{ERREUR_SESSION_EXPIREE.message}</p>
            <p className="error-action">
              <a className="btn-lien" href="/connexion-volontaire">
                Se reconnecter
              </a>
            </p>
          </div>
          <div className="auth-alt">
            <a className="btn-contour" href="/connexion-volontaire">
              Se reconnecter
            </a>
            <AssistanceButton phone={etat.assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="volontaires-pwa">
      <header className="volontaires-entete">
        <p className="surtitre">Espace volontaire</p>
        <h1>Ton espace mission</h1>
        <p className="lead">
          Ton accès volontaire est lié à <strong>{email}</strong>.
          {etat.editionNom !== null ? ` Édition : ${etat.editionNom}.` : ''} Ajoute cette page à
          ton écran d’accueil : ta fiche reste lisible même sans réseau.
        </p>
        <p
          role="status"
          className={
            statut === 'hors-ligne'
              ? 'volontaires-badge volontaires-badge--hors-ligne'
              : 'volontaires-badge volontaires-badge--synchro'
          }
          suppressHydrationWarning
        >
          <span aria-hidden="true" className="volontaires-badge-point" />
          {statut === 'hors-ligne' ? 'HORS-LIGNE PRÊT' : libelleSynchronise(etat.generéA)}
        </p>
        <p className="volontaires-fraicheur" suppressHydrationWarning>
          {statut === 'hors-ligne' ? libelleHorsLigne(etat.generéA) : 'Ta fiche est à jour.'}
        </p>
        {invitationSombre && (
          <div className="volontaires-bandeau-sombre">
            <p className="volontaires-bandeau-texte">
              <strong>Départ à l’aube ?</strong> Passe en mode sombre pour lire ta fiche tôt,
              sans t’éblouir.
            </p>
            <div className="volontaires-bandeau-actions">
              <button
                type="button"
                className="btn-action"
                onClick={() => choisirTheme('dark')}
              >
                Oui, mode sombre
              </button>
              <button
                type="button"
                className="btn-contour"
                onClick={() => choisirTheme('light')}
              >
                Plus tard
              </button>
            </div>
          </div>
        )}
      </header>

      <h2 className="volontaires-titre">Ta fiche mission</h2>
      {etat.mesMissions.length === 0 ? (
        <p className="hint volontaires-attente">
          Tu n’as pas encore de mission attribuée. Dès que l’équipe t’affecte une mission, elle
          arrive ici à ta prochaine ouverture — même sans réseau après coup. En attendant, appelle
          l’équipe si tu as un doute.
        </p>
      ) : (
        <div className="volontaires-fiches">
          {etat.mesMissions.map((mission) => (
            <FicheMission key={mission.id} mission={mission} />
          ))}
        </div>
      )}

      <h2 className="volontaires-titre">Toutes les missions de l’édition</h2>
      {etat.missions.length === 0 ? (
        <p className="hint">Les missions de l’édition ne sont pas encore publiées.</p>
      ) : (
        <ul className="volontaires-toutes-missions">
          {etat.missions.map((mission) => (
            <li key={mission.id} className="volontaires-mission-courte">
              <span className="volontaires-mission-titre">
                <strong>{mission.titre}</strong>
                <span className="volontaires-chip">
                  {mission.couverture === 'couverte'
                    ? 'couverture assurée'
                    : 'vacante — besoins volontaires'}
                </span>
              </span>
              <span className="meta" suppressHydrationWarning>
                {mission.typeLabel} · {mission.secteurNom} ·{' '}
                {formatLocalDateTime(mission.debutLe)} → {formatLocalDateTime(mission.finLe)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="volontaires-actions-bas">
        <LogoutButton />
        <AssistanceButton phone={etat.assistancePhone} />
      </div>

      {/* Toujours visible, même en scrollant au milieu des fiches. */}
      <div className="volontaires-barre-assistance">
        <AssistanceButton phone={etat.assistancePhone} />
      </div>
    </section>
  );
}
