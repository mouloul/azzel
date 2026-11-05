/** I10 (revue épopée 10) — confirmation native AVANT la déconnexion.
 *
 * « Se déconnecter » est destructeur : il purge le token, la session, le
 * cache e-dossard (l'e-dossard hors-ligne disparaît du téléphone) et la
 * file des positions en attente d'envoi (NFR-6). Hors réseau/identifiants,
 * la perte est irrécupérable le jour J : la décision (titre, message qui
 * dit ce qui est réellement perdu, libellés des boutons) vit dans cette
 * fonction PURE testée ; App.tsx ne fait que la présenter via Alert.alert,
 * sans toucher à l'effet de la déconnexion elle-même.
 */

export interface ChoixAlerteDeconnexion {
  /** Un e-dossard est présent sur l'appareil (cache hors-ligne). */
  aEdossard: boolean;
  /** Positions capturées non encore envoyées (file d'attente). */
  positionsEnAttente: number;
}

export interface AlerteDeconnexion {
  titre: string;
  message: string;
  boutons: {
    texte: string;
    style: 'cancel' | 'destructive';
    /** Le seul bouton qui déclenche la déconnexion. */
    confirme: boolean;
  }[];
}

export function alerteDeconnexion({ aEdossard, positionsEnAttente }: ChoixAlerteDeconnexion): AlerteDeconnexion {
  const perdus: { texte: string; participe: string }[] = [];
  if (aEdossard) {
    perdus.push({ texte: 'ton e-dossard hors-ligne', participe: 'enregistré' });
  }
  if (positionsEnAttente > 0) {
    perdus.push({
      texte:
        positionsEnAttente === 1
          ? '1 position en attente d’envoi'
          : `${positionsEnAttente} positions en attente d’envoi`,
      participe: positionsEnAttente === 1 ? 'enregistrée' : 'enregistrées',
    });
  }
  const message =
    perdus.length > 0
      ? `Tu vas perdre ${perdus.map((p) => p.texte).join(' et ')} ${
          perdus.length > 1 ? 'enregistrés' : perdus[0].participe
        } sur ce téléphone.`
      : 'Ta session et les données de ce téléphone seront supprimées.';
  return {
    titre: 'Supprimer ton e-dossard de ce téléphone ?',
    message,
    boutons: [
      { texte: 'Annuler', style: 'cancel', confirme: false },
      { texte: 'Me déconnecter', style: 'destructive', confirme: true },
    ],
  };
}
