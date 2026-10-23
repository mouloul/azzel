import { readAssistancePhone } from '@/lib/assistance-phone';
import { missionRetraitEnCours, missionScanEnCours } from '@/lib/scan/mission-scan';
import { requireRolePage } from '@/modules/iam/session';
import { getMissionsVolontaireState } from '@/modules/missions/service';
import { redirect } from 'next/navigation';

import { ScanClient, type ModeScan } from './scan-client';

import './scan.css';

// Story 4.2 — page serveur du scanner : garde volontaire (requireRolePage),
// assistance et libellé de la mission scan en cours transmis au composant
// client. Dégradation isolée : un échec d'état missions n'entrave JAMAIS le
// scanner (libellé par défaut) — la validation des scans est 100 % locale
// (IndexedDB), zéro réseau.
//
// Story 4.3 — le mode est un PARAMÈTRE (mêmes moteur et écrans) :
// ?mode=retrait (guichet, débloqué par une mission distribution_dossards « en
// cours ») sinon checkpoints (4.2). URL directe du mode retrait sans mission
// guichet → redirection douce vers la fiche, avec message (le mode est débloqué
// par la mission).
//
// Story 4.4 — le mode checkpoints (défaut) devient lui aussi gated par la
// mission : le checkpoint EST la mission scan_checkpoint en cours (son id
// référence le passage, son titre badge le cadre caméra) — fenêtre courante
// d'abord, repli première mission du type assumé (préparation avant la
// course). Sans mission scan → redirection douce avec message DÉDIÉ (pattern
// retrait) ; échec d'état → redirection silencieuse (l'indisponibilité n'est
// pas l'absence).

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Scan des e-dossards',
};

/** Paramètre compris par la page : seul `retrait` change le mode. */
export const MODE_RETRAIT = 'retrait' as const;

/** Clé d'URL du message renvoyé à la fiche volontaires (mode retrait). */
export const NOTICE_SCAN_RETRAIT = 'retrait-sans-mission' as const;

/** Clé d'URL du message renvoyé à la fiche volontaires (mode passages). */
export const NOTICE_SCAN_PASSAGE = 'passage-sans-mission' as const;

export default async function ScanPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string | string[] }>;
}) {
  const assistancePhone = readAssistancePhone();
  const guard = await requireRolePage('volontaire');
  if (guard.status === 'db-unavailable') {
    return (
      <section className="auth scan-page-etat">
        <article className="card">
          <p className="surtitre">Scan des e-dossards</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
          </div>
        </article>
      </section>
    );
  }

  // Story 4.3 — `mode` peut arriver en tableau (?mode=a&mode=b) : seul le
  // PREMIER élément compte, comme pour tout paramètre répété.
  const parametres = (await searchParams) ?? {};
  const modeBrut = parametres.mode;
  const modeValeur = Array.isArray(modeBrut) ? modeBrut[0] : modeBrut;
  const modeScan: ModeScan = modeValeur === MODE_RETRAIT ? 'retrait' : 'checkpoint';

  // État missions : badge du cadre caméra (mission en cours du mode) et —
  // pour les DEUX modes — condition d'accès (le mode est débloqué par la
  // mission). Hors-ligne / base indisponible : redirection silencieuse
  // (l'indisponibilité n'est pas l'absence de mission).
  let mesMissions: Awaited<ReturnType<typeof getMissionsVolontaireState>>['mesMissions'] = [];
  let etatMissionsPret = true;
  try {
    const state = await getMissionsVolontaireState(guard.session);
    mesMissions = state.mesMissions;
  } catch {
    // Dégradation isolée (4.2) devenue gating (4.3/4.4) : sans état missions,
    // la redirection est SILENCIEUSE (pas de message « réservé », qui
    // mentirait sur la cause).
    etatMissionsPret = false;
  }

  if (modeScan === 'retrait') {
    const missionGuichet = etatMissionsPret
      ? missionRetraitEnCours(mesMissions, new Date())
      : null;
    if (missionGuichet === null) {
      // Le mode est débloqué par la mission : retour à la fiche — avec
      // message seulement si l'état missions a répondu (absence réelle).
      redirect(etatMissionsPret ? `/volontaires?scan=${NOTICE_SCAN_RETRAIT}` : '/volontaires');
    }
    return (
      <ScanClient
        assistancePhone={assistancePhone}
        missionLabel={missionGuichet.titre}
        mode="retrait"
      />
    );
  }

  // Mode checkpoints (4.4) : le checkpoint EST la mission scan_checkpoint en
  // cours (fenêtre courante d'abord, repli première mission du type assumé —
  // préparation avant la course) — son id référence chaque passage (clé
  // naturelle édition+coureur+checkpoint), son titre badge le cadre caméra.
  // Gating identique au retrait : URL directe sans mission scan → redirection
  // douce AVEC message dédié ; échec d'état → silencieuse.
  const missionPassage = etatMissionsPret ? missionScanEnCours(mesMissions, new Date()) : null;
  if (missionPassage === null) {
    redirect(etatMissionsPret ? `/volontaires?scan=${NOTICE_SCAN_PASSAGE}` : '/volontaires');
  }
  return (
    <ScanClient
      assistancePhone={assistancePhone}
      missionLabel={missionPassage.titre}
      checkpointId={missionPassage.id}
    />
  );
}
