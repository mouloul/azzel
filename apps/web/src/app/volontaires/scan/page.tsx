import { readAssistancePhone } from '@/lib/assistance-phone';
import { missionScanEnCours } from '@/lib/scan/mission-scan';
import { requireRolePage } from '@/modules/iam/session';
import { LIBELLES_MISSION_TYPE } from '@/modules/missions/domain';
import { getMissionsVolontaireState } from '@/modules/missions/service';

import { ScanClient } from './scan-client';

import './scan.css';

// Story 4.2 — page serveur du scanner : garde volontaire (requireRolePage),
// assistance et libellé de la mission scan en cours transmis au composant
// client. Dégradation isolée : un échec d'état missions n'entrave JAMAIS le
// scanner (libellé par défaut) — la validation des scans est 100 % locale
// (IndexedDB), zéro réseau.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Scan des e-dossards',
};

export default async function ScanPage() {
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

  // Mission scan en cours (badge du cadre caméra) — la mission dont la fenêtre
  // horaire contient l'instant, repli première mission scan, sinon le libellé
  // du type (source unique : LIBELLES_MISSION_TYPE).
  let missionLabel = LIBELLES_MISSION_TYPE['scan_checkpoint'];
  try {
    const state = await getMissionsVolontaireState(guard.session);
    missionLabel = missionScanEnCours(state.mesMissions, new Date())?.titre ?? missionLabel;
  } catch {
    // Hors-ligne / base indisponible : le scanner reste utilisable.
  }

  return <ScanClient assistancePhone={assistancePhone} missionLabel={missionLabel} />;
}
