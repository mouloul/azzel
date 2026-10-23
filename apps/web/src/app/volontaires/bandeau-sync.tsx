'use client';

import { formatLocalDateTime } from '@azzel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { assistancePhoneHref } from '@/components/assistance-button';
import {
  lireEtatFileAttente,
  lireJournal,
  type EntreeJournalSync,
} from '@/lib/idb-volontaires';
import {
  creerDepsEnregistrementAppareil,
  creerDepsSyncTerrain,
  enregistrerAppareilPourSync,
  synchroniserTerrainAvecEnregistrement,
} from '@/lib/sync/sync-terrain';

// Story 4.5 (UX-DR-8, AD-2/AD-5) — bandeau sync PERMANENT de la PWA
// volontaires : « ◷ N en attente » → envoi → « ✓ envoyés — file : 0 », ou
// « Appelle le PC » si l'appareil est révoqué (jamais d'auto-réenregistrement).
// Déclenchements : ouverture en ligne (montée + signal du parent après fetch
// etat OK), événement `online`, bouton du bandeau — un déclenchement pendant
// un envoi en cours est mémorisé et rejoué à la fin. Le journal (details,
// lecture seule) montre les lots, acceptés/doublons/rejets et l'offset horloge
// moyen — l'audit complet vit côté serveur.

export type PhaseSync =
  | 'comptage'
  | 'comptage-impossible'
  | 'attente'
  | 'envoi'
  | 'envoye'
  | 'revoque';

/** Libellé du bandeau (pure, testée) — jamais la couleur seule : icône + texte. */
export function libellerBandeauSync(phase: PhaseSync, enAttente: number): string {
  switch (phase) {
    case 'comptage':
      return 'Sync de la file…';
    case 'comptage-impossible':
      return 'Comptage impossible — réessaie';
    case 'envoi':
      return `⏳ Envoi en cours — ${enAttente} en attente`;
    case 'envoye':
      return '✓ envoyés — file : 0';
    case 'revoque':
      return '⚠ Appareil bloqué par le PC';
    case 'attente':
      return `◷ ${enAttente} en attente`;
  }
}

/** Rendu pur du bandeau (testé phase par phase hors effets). */
export function VueBandeauSync({
  phase,
  enAttente,
  journal,
  assistancePhone,
  surEnvoyer,
}: {
  phase: PhaseSync;
  enAttente: number;
  journal: EntreeJournalSync[];
  assistancePhone: string;
  surEnvoyer: () => void;
}) {
  const classePhase =
    phase === 'envoye' || phase === 'envoi'
      ? 'volontaires-sync volontaires-sync--envoye'
      : phase === 'revoque'
        ? 'volontaires-sync volontaires-sync--revoque'
        : 'volontaires-sync';

  return (
    <section className={classePhase} aria-labelledby="volontaires-sync-titre" suppressHydrationWarning>
      <p
        id="volontaires-sync-titre"
        className="volontaires-sync-etat"
        role="status"
        aria-live="polite"
        suppressHydrationWarning
      >
        {libellerBandeauSync(phase, enAttente)}
      </p>
      {phase === 'revoque' ? (
        <a
          className="volontaires-sync-appelle"
          href={assistancePhoneHref(assistancePhone)}
          aria-label={`Appelle le PC au ${assistancePhone}`}
        >
          Appelle le PC — la sync est bloquée
        </a>
      ) : (
        <button type="button" className="volontaires-sync-bouton" onClick={surEnvoyer}>
          Envoyer maintenant
        </button>
      )}
      <details className="volontaires-sync-journal">
        <summary>{`Journal sync (${journal.length})`}</summary>
        {journal.length === 0 ? (
          <p className="volontaires-sync-journal-vide">Aucun lot encore parti.</p>
        ) : (
          <ul className="volontaires-sync-journal-liste">
            {journal.map((entree) => {
              const compteurs = `${entree.envoyes} envoyé${entree.envoyes > 1 ? 's' : ''} · ${entree.dejaConnus} déjà connu${entree.dejaConnus > 1 ? 's' : ''} · ${entree.rejetes} rejeté${entree.rejetes > 1 ? 's' : ''}`;
              const offset =
                entree.offsetMoyenMs === null
                  ? null
                  : `horloge appareil : ${entree.offsetMoyenMs >= 0 ? '+' : '−'}${Math.abs(Math.round(entree.offsetMoyenMs / 1000))} s vs serveur`;
              return (
                <li key={entree.id} className="volontaires-sync-journal-entree">
                  <span className="volontaires-sync-journal-date" suppressHydrationWarning>
                    {formatLocalDateTime(entree.horodatage)}
                  </span>
                  <span>{compteurs}</span>
                  {entree.motifs.length > 0 ? (
                    <span className="volontaires-sync-journal-motifs">{entree.motifs.join(' ; ')}</span>
                  ) : null}
                  {offset !== null ? (
                    <span className="volontaires-sync-journal-offset">{offset}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </section>
  );
}

export function BandeauSync({
  assistancePhone,
  declenchement = 0,
}: {
  assistancePhone: string;
  /** Signal du parent (incrémenté après fetch etat OK) : « ouverture en ligne ». */
  declenchement?: number;
}) {
  const [phase, setPhase] = useState<PhaseSync>('comptage');
  const [enAttente, setEnAttente] = useState(0);
  const [journal, setJournal] = useState<EntreeJournalSync[]>([]);
  const enCours = useRef(false);
  // Déclenchement pendant un envoi en cours : mémorisé, rejoué en finally —
  // un « online »/bouton ne se perd jamais.
  const relance = useRef(false);

  /** Comptage + journal ; retourne le restant, ou false si comptage impossible. */
  const rafraichir = useCallback(async (): Promise<number | false> => {
    const [etat, entrees] = await Promise.all([lireEtatFileAttente(), lireJournal()]);
    setJournal(entrees);
    if (etat.erreurStockage) {
      // Stockage illisible : jamais de « file : 0 » mensonger.
      setEnAttente(0);
      setPhase('comptage-impossible');
      return false;
    }
    setEnAttente(etat.enAttente);
    return etat.enAttente;
  }, []);

  const lancer = useCallback(async () => {
    if (enCours.current) {
      relance.current = true;
      return;
    }
    enCours.current = true;
    setPhase((precedente) => (precedente === 'revoque' ? precedente : 'envoi'));
    try {
      // sans-jeton → enregistrement (session) → nouvelle tentative : la
      // boîte d'envoi ne dépend d'aucune session (AD-5), seulement du jeton.
      const resultat = await synchroniserTerrainAvecEnregistrement({
        ...creerDepsSyncTerrain(),
        enregistrer: () => enregistrerAppareilPourSync(creerDepsEnregistrementAppareil()),
      });
      const restant = await rafraichir();
      if (restant === false) {
        return;
      }
      if (resultat.statut === 'appareil-revoque') {
        setPhase('revoque');
        return;
      }
      // « ✓ envoyés — file : 0 » SEULEMENT si la file est réellement vide —
      // des rejets restants (non marqués) gardent « ◷ N en attente ».
      setPhase(restant > 0 ? 'attente' : 'envoye');
    } finally {
      enCours.current = false;
      if (relance.current) {
        relance.current = false;
        void lancer();
      }
    }
  }, [rafraichir]);

  // Ouverture : comptage immédiat, puis tentative de sync si en ligne.
  useEffect(() => {
    void (async () => {
      const restant = await rafraichir();
      if (restant === false) {
        return;
      }
      setPhase(restant > 0 ? 'attente' : 'envoye');
      const enLigne = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (enLigne) {
        await lancer();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signal du parent (fetch etat OK) : « l'ouverture en ligne » revalide.
  useEffect(() => {
    if (declenchement > 0) {
      void lancer();
    }
  }, [declenchement, lancer]);

  // Retour du réseau : retry, quoi qu'il reste en file.
  useEffect(() => {
    const auRetour = () => {
      void lancer();
    };
    window.addEventListener('online', auRetour);
    return () => window.removeEventListener('online', auRetour);
  }, [lancer]);

  return (
    <VueBandeauSync
      phase={phase}
      enAttente={enAttente}
      journal={journal}
      assistancePhone={assistancePhone}
      surEnvoyer={() => {
        void lancer();
      }}
    />
  );
}
