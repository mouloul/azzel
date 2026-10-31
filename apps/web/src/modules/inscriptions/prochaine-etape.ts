import type { ChecklistPiece } from '@azzel/shared';

import { COUREUR_HOME_PATH } from '@/modules/iam/constants';
import { getSession } from '@/modules/iam/service';
import type { SessionRecord } from '@/modules/iam/store';

import { getChecklistState } from './service';

/** Chemin interne relatif uniquement : jamais d'URL absolue ni protocole-relative. */
function estCheminInterne(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\');
}

/**
 * Où envoyer un coureur qui vient de se connecter : la première pièce non
 * faite de son dossier, dans l'ordre de la checklist (une seule source de
 * vérité : `/inscription` → `/acceptations` → `/preuve`). Si cette pièce n'a
 * pas de lien (inscriptions fermées, validation en attente…) ou si tout est
 * fait, il atterrit dans son espace.
 */
export function prochaineEtapeCoureur(pieces: readonly ChecklistPiece[]): string {
  const premiereNonFaite = pieces.find((piece) => !piece.fait);
  const href = premiereNonFaite?.actionHref;
  return href !== undefined && estCheminInterne(href) ? href : COUREUR_HOME_PATH;
}

export interface ProchaineEtapeDeps {
  getSession?: (token: string) => Promise<SessionRecord | null>;
  getChecklistState?: (session: SessionRecord) => Promise<{ pieces: ChecklistPiece[] }>;
}

/**
 * Variante serveur, à partir du jeton de session tout juste émis. Ne lève
 * jamais : un dossier illisible (base indisponible, session introuvable) ne
 * doit pas faire échouer la connexion — le coureur atterrit alors dans son
 * espace, qui affiche lui-même l'état d'erreur.
 */
export async function prochaineEtapeCoureurPourJeton(
  token: string,
  deps: ProchaineEtapeDeps = {},
): Promise<string> {
  const lireSession = deps.getSession ?? ((jeton: string) => getSession(jeton));
  const lireChecklist =
    deps.getChecklistState ?? ((session: SessionRecord) => getChecklistState(session));
  try {
    const session = await lireSession(token);
    if (!session) {
      return COUREUR_HOME_PATH;
    }
    const etat = await lireChecklist(session);
    return prochaineEtapeCoureur(etat?.pieces ?? []);
  } catch {
    return COUREUR_HOME_PATH;
  }
}
