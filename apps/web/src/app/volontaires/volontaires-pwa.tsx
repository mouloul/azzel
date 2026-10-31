'use client';

import { estAnnuaireValide, formatLocalDateTime, type AnnuaireEdition } from '@azzel/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AssistanceButton, assistancePhoneHref } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { resoudreAnnuaireHorsLigne, type StatutAnnuaire } from '@/lib/annuaire-replique';
import {
  libelleHorsLigne,
  libelleHorsLigneAnnuaire,
  libelleNonRafraichi,
  libelleSynchronise,
} from '@/lib/fraicheur';
import {
  ecrireAnnuaire,
  ecrireEtatVolontaires,
  lierPocheAuCompte,
  lireAnnuaire,
  lireEtatVolontaires,
  type EtatVolontaires,
} from '@/lib/idb-volontaires';
import { demanderStockagePersistant, rechaufferShellVolontaires } from '@/lib/pwa-volontaires';
import {
  deciderRevalidationEtat,
  ENTETE_SOURCE_SW,
  etatLePlusFrais,
  type ReponseEtatLue,
  type StatutSync,
} from '@/lib/revalidation-etat';
import { missionRetraitEnCours, missionScanEnCours } from '@/lib/scan/mission-scan';
import {
  deferThemeInvitation,
  isThemeInvitationDeferred,
  notifyThemeChange,
  readStoredTheme,
  writeStoredTheme,
} from '@/lib/theme';
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
//
// Revue 3.3 (D1) — la poche est liée au COMPTE : au montage, une fiche
// stockée d'un autre compte est purgée (IndexedDB fiche/annuaire + caches
// az-volontaires-*, jamais l'outbox ni l'appareilId) AVANT toute lecture.
// Une session expirée ne remplace plus la fiche : bandeau « reconnecte-toi »
// au-dessus de la fiche conservée.

/** Marqueur de fiche saine : seul ce rendu devient le shell hors-ligne du SW. */
export const MARQUEUR_SHELL_FICHE = 'fiche';

/**
 * Bandeau « session expirée » (composant pur, testé) : la fiche reste
 * affichée en dessous (poche ou état initial), la reconnexion rafraîchira.
 * Le bandeau sync reste monté à côté (AD-5).
 */
export function BandeauReconnexion() {
  return (
    <div role="alert" className="error-box">
      <p className="error-message">Ta session a expiré ou a été fermée.</p>
      <p className="error-action">
        Ta fiche ci-dessous est celle enregistrée sur cet appareil.{' '}
        <a className="btn-lien" href={CONNEXION_PATH}>
          Reconnecte-toi
        </a>{' '}
        pour la rafraîchir.
      </p>
    </div>
  );
}

function libelleBadge(statut: StatutSync, generéA: string): string {
  switch (statut) {
    case 'hors-ligne':
      return 'HORS-LIGNE PRÊT';
    case 'non-rafraichi':
      return 'NON RAFRAÎCHI';
    default:
      return libelleSynchronise(generéA);
  }
}

function libelleFraicheur(statut: StatutSync, generéA: string): string {
  switch (statut) {
    case 'hors-ligne':
      return libelleHorsLigne(generéA);
    case 'non-rafraichi':
      return libelleNonRafraichi(generéA);
    default:
      return 'Ta fiche est à jour.';
  }
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

  // D1 — liaison de la poche au compte de la session, partagée par les deux
  // revalidations (état ET annuaire) : aucune ne lit la poche avant elle. Une
  // purge a vidé le shell que le SW venait de cacher : il est réchauffé.
  const liaison = useRef<Promise<void> | null>(null);
  const assurerLiaison = (): Promise<void> => {
    liaison.current ??= lierPocheAuCompte(etatInitial.accountId).then((purgee) => {
      if (purgee) {
        rechaufferShellVolontaires();
      }
    });
    return liaison.current;
  };

  // Revalidation : à chaque ouverture, on rappelle l'API en ligne. La
  // décision réponse → statut est pure (lib/revalidation-etat) : succès →
  // IndexedDB (la poche) ; repli du SW (X-Azzel-Source) → « HORS-LIGNE
  // PRÊT », jamais réécrit comme frais ; tout autre échec → fraîcheur réelle
  // (« non rafraîchi — données du … »). Dans les deux cas le plus frais de
  // l'état serveur, de la poche et de la réplique SW gagne (Date.getTime()) ;
  // la poche vide est amorcée. 401/403 : fiche conservée + bandeau.
  useEffect(() => {
    let annule = false;
    (async () => {
      await assurerLiaison();
      let lue: ReponseEtatLue | null = null;
      try {
        const response = await fetch('/api/volontaires/etat', { cache: 'no-store' });
        const payload: unknown = await response.json().catch(() => null);
        lue = { status: response.status, source: response.headers.get(ENTETE_SOURCE_SW), payload };
      } catch {
        lue = null;
      }
      if (annule) {
        return;
      }
      const enLigne = typeof navigator === 'undefined' || navigator.onLine !== false;
      const decision = deciderRevalidationEtat(lue, etatInitial.accountId, enLigne);
      if (decision.issue === 'frais') {
        setEtat(decision.etat);
        setStatut('synchrone');
        // Fetch etat OK : l'ouverture en ligne est établie — on réveille le
        // bandeau sync (qui, de toute façon, tente aussi à son montage, AD-5).
        setDeclenchementSync((precedent) => precedent + 1);
        await ecrireEtatVolontaires(decision.etat);
        return;
      }
      if (decision.issue === 'session-expiree') {
        setSessionExpiree(true);
      }
      const enCache = await lireEtatVolontaires();
      if (annule) {
        return;
      }
      const choisi =
        etatLePlusFrais(
          [etatInitial, enCache, decision.issue === 'repli' ? decision.replique : null],
          etatInitial.accountId,
        ) ?? etatInitial;
      setEtat(choisi);
      setStatut(decision.issue === 'repli' ? decision.statut : 'non-rafraichi');
      if (enCache === null) {
        await ecrireEtatVolontaires(choisi);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Stockage persistant demandé à l'ouverture : limite l'éviction de la poche.
  useEffect(() => {
    void demanderStockagePersistant();
  }, []);

  // Invitation au mode sombre : tant qu'aucun choix n'est mémorisé, sauf si
  // « Plus tard » l'a reportée pour cette session (elle revient ensuite). La
  // bascule de l'en-tête du site reste disponible.
  useEffect(() => {
    setInvitationSombre(readStoredTheme() === null && !isThemeInvitationDeferred());
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
      await assurerLiaison();
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

  const choisirSombre = () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    writeStoredTheme('dark');
    // La bascule d'en-tête suit (sinon son libellé reste sur le thème lu au montage).
    notifyThemeChange('dark');
    setInvitationSombre(false);
  };

  // « Plus tard » : rien n'est mémorisé comme choix, l'invitation revient à
  // la prochaine ouverture.
  const reporterInvitation = () => {
    deferThemeInvitation();
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

  return (
    <section className="volontaires-pwa" data-az-shell={MARQUEUR_SHELL_FICHE}>
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
            statut === 'synchrone'
              ? 'volontaires-badge volontaires-badge--synchro'
              : 'volontaires-badge volontaires-badge--hors-ligne'
          }
          suppressHydrationWarning
        >
          <span aria-hidden="true" className="volontaires-badge-point" />
          {libelleBadge(statut, etat.generéA)}
        </p>
        <p className="volontaires-fraicheur" suppressHydrationWarning>
          {libelleFraicheur(statut, etat.generéA)}
        </p>
        {sessionExpiree && <BandeauReconnexion />}
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
                onClick={choisirSombre}
              >
                Oui, mode sombre
              </button>
              <button
                type="button"
                className="btn-contour"
                onClick={reporterInvitation}
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
