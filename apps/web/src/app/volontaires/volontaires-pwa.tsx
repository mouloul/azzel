'use client';

import { estAnnuaireValide, formatLocalDateTime, type AnnuaireEdition } from '@azzel/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AssistanceButton, assistancePhoneHref } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { resoudreAnnuaireHorsLigne, type StatutAnnuaire } from '@/lib/annuaire-replique';
import { libelleHorsLigne, libelleHorsLigneAnnuaire, libelleSynchronise } from '@/lib/fraicheur';
import {
  ecrireAnnuaire,
  ecrireEtatVolontaires,
  lireAnnuaire,
  lireEtatVolontaires,
  type EtatVolontaires,
} from '@/lib/idb-volontaires';
import { missionRetraitEnCours, missionScanEnCours } from '@/lib/scan/mission-scan';
import { readStoredTheme, writeStoredTheme } from '@/lib/theme';
import { CONNEXION_PATH } from '@/modules/iam/constants';
import type { MissionVolontaireView } from '@/modules/missions/service';

import { BandeauSync } from './bandeau-sync';

// Stories 3.3/3.4 — PWA volontaires : revalidation à CHAQUE ouverture en ligne
// (réponse persistée en IndexedDB → fiche dans la poche dès l'affectation),
// badge d'état role="status" (« synchronisé à HH:MM » / « HORS-LIGNE PRÊT »),
// invitation au mode sombre à la première ouverture, fiches une colonne avec
// contact PC en gros bouton tel:. Story 3.4 : section « Annuaire des coureurs »
// — réplique préchargée à chaque ouverture en ligne (badge DÉDIÉ, annonce
// séparée au lecteur d'écran), consommée par le scan de l'épopée 4. Pas de
// liste affichée : seul l'état de préchargement est requis.

type StatutSync = 'synchrone' | 'hors-ligne';

const ERREUR_SESSION_EXPIREE = {
  message: 'Ta session a expiré ou a été fermée.',
  action: 'Reconnecte-toi pour rafraîchir ta fiche mission.',
};

/**
 * Écran « session expirée » (composant pur, testé) : la reconnexion reste le
 * chemin pour la FICHE, mais le bandeau sync RESTE MONTÉ (AD-5) — la boîte
 * d'envoi appartient à l'appareil, le Bearer sync survit à la session morte.
 */
export function EcranSessionExpiree({ assistancePhone }: { assistancePhone: string }) {
  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace volontaire</p>
        <h1>Tu es déconnecté</h1>
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">{ERREUR_SESSION_EXPIREE.message}</p>
          <p className="error-action">
            <a className="btn-lien" href={CONNEXION_PATH}>
              Se reconnecter
            </a>
          </p>
        </div>
        <div className="auth-alt">
          <a className="btn-contour" href={CONNEXION_PATH}>
            Se reconnecter
          </a>
          <AssistanceButton phone={assistancePhone} />
        </div>
      </article>
      <BandeauSync assistancePhone={assistancePhone} />
    </section>
  );
}

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

function libelleAnnuaire(statut: StatutAnnuaire, annuaire: AnnuaireEdition | null): string {
  switch (statut) {
    case 'pret':
      return `Annuaire prêt — ${annuaire?.coureurs.length ?? 0} coureurs`;
    case 'hors-ligne':
      return annuaire !== null ? libelleHorsLigneAnnuaire(annuaire.genereA) : 'hors-ligne';
    case 'aucun':
      return 'aucun coureur à dossard — rien à précharger';
    case 'non-enregistre':
      return 'Annuaire chargé mais non enregistré sur cet appareil — réessaie';
    case 'indisponible':
      return 'Annuaire indisponible — réessaie en ligne';
    default:
      return 'Annuaire en cours de préchargement…';
  }
}

function statutInitialAnnuaire(annuaire: AnnuaireEdition | null): StatutAnnuaire {
  if (annuaire == null) {
    return 'chargement';
  }
  return annuaire.coureurs.length > 0 ? 'pret' : 'aucun';
}

export function VolontairesPwa({
  etatInitial,
  annuaireInitial,
  email,
  noticeScan = null,
}: {
  etatInitial: EtatVolontaires;
  annuaireInitial: AnnuaireEdition | null;
  email: string;
  /** Message éphémère (ex. mode retrait sans mission guichet) — null sinon. */
  noticeScan?: string | null;
}) {
  const [etat, setEtat] = useState<EtatVolontaires>(etatInitial);
  // Rendu serveur = données fraîches au chargement : le badge démarre
  // « synchronisé », l'effet de revalidation tranche ensuite (hydration sans
  // divergence).
  const [statut, setStatut] = useState<StatutSync>('synchrone');
  const [sessionExpiree, setSessionExpiree] = useState(false);
  const [invitationSombre, setInvitationSombre] = useState(false);
  // Story 3.4 — annuaire : le rendu serveur amorce l'état (badge dédié), la
  // revalidation tranche ensuite. Deux annonces séparées au lecteur d'écran :
  // chaque badge porte son nom (« Annuaire… »).
  const [annuaire, setAnnuaire] = useState<AnnuaireEdition | null>(annuaireInitial);
  const [statutAnnuaire, setStatutAnnuaire] = useState<StatutAnnuaire>(
    statutInitialAnnuaire(annuaireInitial),
  );
  // Story 4.5 — signal « ouverture en ligne » pour le bandeau sync : incrémenté
  // quand le fetch etat a réussi. AD-5 : même SANS ce signal (session morte,
  // fetch 401), le bandeau tente la sync à son montage dès que le réseau est
  // là — le Bearer appareil n'exige aucune session ; ce signal ne fait que
  // réveiller un bandeau déjà monté après un rapatriement d'état.
  const [declenchementSync, setDeclenchementSync] = useState(0);

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
        // Fetch etat OK : l'ouverture en ligne est établie — on réveille le
        // bandeau sync (qui, de toute façon, tente aussi à son montage, AD-5).
        setDeclenchementSync((precedent) => precedent + 1);
        await ecrireEtatVolontaires(payload);
      } catch {
        const enCache = await lireEtatVolontaires();
        if (annule) {
          return;
        }
        if (enCache !== null) {
          // Fraîcheur par valeur (Date.getTime()), jamais par les chaînes —
          // même racine que le repli annuaire 3.4.
          if (
            new Date(enCache.generéA).getTime() > new Date(etatInitial.generéA).getTime()
          ) {
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

  // Story 3.4 — revalidation de l'annuaire, même paradigme que l'état : à
  // chaque ouverture en ligne, fetch → IndexedDB (la poche du scanneur), avec
  // délai maximal (une requête suspendue ne bloque pas le badge à vie). Échec
  // → résolution pure extraite (lib/annuaire-replique) : la poche d'abord (le
  // plus frais gagne par Date.getTime()), l'état serveur amorce sinon — et
  // quand l'initial gagne, la poche est réécrite pour ne pas diverger de l'UI.
  // Un fetch réussi mais NON enregistré en poche (quota, mode privé iOS) ne
  // ment jamais : état dédié « non enregistré ».
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const response = await fetch('/api/volontaires/annuaire', {
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 401 || response.status === 403) {
          if (!annule) {
            setSessionExpiree(true);
          }
          return;
        }
        if (!response.ok) {
          throw new Error('annuaire injoignable');
        }
        const payload = await response.json();
        if (!estAnnuaireValide(payload)) {
          throw new Error('annuaire hors contrat');
        }
        if (annule) {
          return;
        }
        setAnnuaire(payload);
        const enregistre = await ecrireAnnuaire(payload);
        if (annule) {
          return;
        }
        if (!enregistre) {
          setStatutAnnuaire('non-enregistre');
          return;
        }
        setStatutAnnuaire(payload.coureurs.length > 0 ? 'pret' : 'aucun');
      } catch {
        const enCache = await lireAnnuaire();
        if (annule) {
          return;
        }
        const enLigne = typeof navigator === 'undefined' || navigator.onLine !== false;
        const choix = resoudreAnnuaireHorsLigne(enCache, annuaireInitial, enLigne);
        setAnnuaire(choix.annuaire);
        setStatutAnnuaire(choix.statut);
        if (choix.annuaire !== null && choix.annuaire !== enCache) {
          // Amorce de poche ou initial plus frais que la poche : l'UI affiche
          // cette réplique, la poche doit porter exactement la même.
          await ecrireAnnuaire(choix.annuaire);
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const choisirTheme = (theme: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStoredTheme(theme);
    setInvitationSombre(false);
  };

  // Story 4.2 — le scanner n'est qu'une mission parmi d'autres : l'entrée
  // « Démarrer le scan » n'apparaît que si une mission scan_checkpoint est
  // affectée au volontaire. Le libellé suit la mission scan en cours (helper
  // pur partagé avec la page scanner).
  const missionScan = missionScanEnCours(etat.mesMissions, new Date());
  // Story 4.3 — même règle pour le guichet : « Scan retrait » n'apparaît que
  // si une mission distribution_dossards est affectée (le mode du scanner est
  // débloqué par la mission).
  const missionRetrait = missionRetraitEnCours(etat.mesMissions, new Date());

  // Story 4.3 — intitulé de section selon les missions : guichet pur →
  // « Retrait des dossards » ; sinon le libellé générique (scan seul ou les
  // deux modes ensemble).
  const titreSectionScan =
    missionRetrait !== null && missionScan === null
      ? 'Retrait des dossards'
      : 'Scan des e-dossards';

  // Story 4.3 (revue) — la notice est PONCTUELLE : après affichage, le
  // paramètre d'URL est nettoyé (router.replace sans scroll ni historique)
  // pour ne pas réapparaître au rechargement ; l'état local garde le texte à
  // l'écran malgré la revalidation déclenchée par le replace.
  const router = useRouter();
  const [noticeAffichee] = useState(noticeScan);
  useEffect(() => {
    if (noticeScan !== null) {
      router.replace('/volontaires', { scroll: false });
    }
  }, [noticeScan, router]);

  if (sessionExpiree) {
    return <EcranSessionExpiree assistancePhone={etat.assistancePhone} />;
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

      {/* Story 4.5 (UX-DR-8) — bandeau sync PERMANENT : compteur d'attente,
          états ◷/envoi/✓/révoqué, journal en lecture seule. */}
      <BandeauSync assistancePhone={etat.assistancePhone} declenchement={declenchementSync} />

      {noticeAffichee !== null && (
        <p role="status" aria-live="polite" className="volontaires-notice">
          {noticeAffichee}
        </p>
      )}

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

      {(missionScan !== null || missionRetrait !== null) && (
        <section className="volontaires-scan" aria-labelledby="volontaires-scan-titre">
          <h2 className="volontaires-titre" id="volontaires-scan-titre">
            {titreSectionScan}
          </h2>
          {missionScan !== null && (
            <a className="volontaires-scan-lien" href="/volontaires/scan">
              <span className="volontaires-scan-libelle">Démarrer le scan</span>
              <span className="volontaires-scan-mission">{missionScan.titre}</span>
            </a>
          )}
          {missionRetrait !== null && (
            <a className="volontaires-scan-lien" href="/volontaires/scan?mode=retrait">
              <span className="volontaires-scan-libelle">Scan retrait</span>
              <span className="volontaires-scan-mission">{missionRetrait.titre}</span>
            </a>
          )}
          {missionRetrait !== null ? (
            <p className="volontaires-annuaire-texte">
              Le scanner lit les e-dossards des coureurs et fonctionne même sans réseau — l’annuaire
              ci-dessous suffit. Au guichet, « Scan retrait » enregistre chaque dossard remis, même
              hors-ligne.
            </p>
          ) : (
            <p className="volontaires-annuaire-texte">
              Le scanner lit les e-dossards des coureurs et fonctionne même sans réseau — l’annuaire
              ci-dessous suffit.
            </p>
          )}
        </section>
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

      <section className="volontaires-annuaire" aria-labelledby="volontaires-annuaire-titre">
        <h2 className="volontaires-titre" id="volontaires-annuaire-titre">
          Annuaire des coureurs
        </h2>
        <p className="volontaires-surtitre">Avant le départ</p>
        <p
          role="status"
          aria-live="polite"
          className={
            statutAnnuaire === 'hors-ligne'
              ? 'volontaires-badge volontaires-badge--hors-ligne'
              : 'volontaires-badge volontaires-badge--synchro'
          }
          suppressHydrationWarning
        >
          <span aria-hidden="true" className="volontaires-badge-point" />
          {libelleAnnuaire(statutAnnuaire, annuaire)}
        </p>
        <p className="volontaires-annuaire-texte">
          L’annuaire de l’édition se précharge tout seul à chaque ouverture en ligne : les scans
          reconnaîtront les dossards même sans réseau. Aucune liste à lire ici.
        </p>
      </section>

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
