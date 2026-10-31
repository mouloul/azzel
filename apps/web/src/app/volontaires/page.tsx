import { nowIsoUtc, type AnnuaireEdition } from '@azzel/shared';

import { toVolontairesApiError } from '@/app/api/volontaires/guard';
import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';
import { getAnnuaireEdition, getMissionsVolontaireState } from '@/modules/missions/service';

import { VolontairesPwa } from './volontaires-pwa';

import { NOTICE_SCAN_PASSAGE, NOTICE_SCAN_RETRAIT } from './scan/page';

import './volontaires.css';

// Stories 3.3/3.4 — page serveur de la PWA volontaires : requireRolePage
// volontaire, état initial assemblé côté serveur (rendu SSR = plan A), puis le
// composant client revalide à chaque ouverture en ligne et persiste en
// IndexedDB (la poche). L'annuaire (3.4) suit le même paradigme : son échec
// n'entrave JAMAIS la fiche mission (annuaireInitial null → préchargement
// seul, tranché par l'effet client).

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace volontaire',
};

/** Story 4.3 — message affiché quand le mode retrait est demandé sans mission guichet. */
export const MESSAGE_SCAN_RETRAIT =
  'Le scan de retrait est réservé aux volontaires avec une mission « Distribution des dossards ». Ta fiche mission ci-dessous liste tes missions.';

/** Story 4.4 — message affiché quand le mode passages est demandé sans mission scan. */
export const MESSAGE_SCAN_PASSAGE =
  'Le scan des passages est réservé aux volontaires avec une mission « Scan checkpoint » — le checkpoint identifie chaque passage. Ta fiche mission ci-dessous liste tes missions.';

/** Story 4.3/4.4 — clés d'URL du scanner → messages affichés sur la fiche. */
const MESSAGES_SCAN: Record<string, string> = {
  [NOTICE_SCAN_RETRAIT]: MESSAGE_SCAN_RETRAIT,
  [NOTICE_SCAN_PASSAGE]: MESSAGE_SCAN_PASSAGE,
};

export default async function VolontairesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const assistancePhone = readAssistancePhone();
  const guard = await requireRolePage('volontaire');
  if (guard.status === 'db-unavailable') {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
          </div>
        </article>
      </section>
    );
  }
  const session = guard.session;

  let state: Awaited<ReturnType<typeof getMissionsVolontaireState>>;
  try {
    state = await getMissionsVolontaireState(session);
  } catch (error) {
    // Enveloppe terrain (volontaires.*, tutoiement), jamais admin.*.
    const { envelope } = toVolontairesApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Tu es connecté</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
          <p className="hint">
            Ta fiche mission reste lisible hors-ligne si tu l’avais déjà ouverte une fois en
            ligne.
          </p>
          <div className="auth-alt">
            <LogoutButton />
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  // Annuaire (3.4) : dégradation isolée — une erreur ici ne casse pas la page,
  // la revalidation client tranche (null = état « en cours de préchargement »).
  let annuaireInitial: AnnuaireEdition | null = null;
  try {
    annuaireInitial = (await getAnnuaireEdition(session)) ?? null;
  } catch {
    annuaireInitial = null;
  }

  // Story 4.3/4.4 — redirection douce du scanner sans mission du mode : le
  // message est affiché une fois sur la fiche (?scan=<clé>, clé unique du
  // côté scanner). Le paramètre peut être répété : seul le PREMIER élément
  // compte.
  const parametres = (await searchParams) ?? {};
  const scanBrut = parametres.scan;
  const scan = Array.isArray(scanBrut) ? scanBrut[0] : scanBrut;
  const noticeScan = scan === undefined ? null : (MESSAGES_SCAN[scan] ?? null);

  return (
    <VolontairesPwa
      email={session.email}
      etatInitial={{
        // D1 (revue 3.3) — la fiche est liée au compte de la session.
        accountId: session.accountId,
        editionNom: state.editionNom,
        assistancePhone,
        mesMissions: state.mesMissions,
        missions: state.missions,
        generéA: nowIsoUtc(),
      }}
      annuaireInitial={annuaireInitial}
      noticeScan={noticeScan}
    />
  );
}
