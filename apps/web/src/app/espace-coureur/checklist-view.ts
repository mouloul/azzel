import {
  CHECKLIST_VALIDATION_EXPIREE,
  type ChecklistPiece,
} from '@/modules/inscriptions/service';

export const BANDEAU_DOSSIER_VALIDE = 'Dossier validé — dossard prêt';

export interface EtatPiece {
  texte: string;
  classe: string;
  /** Explication longue, affichée sous le libellé plutôt que dans la pastille. */
  note?: string;
}

export function etatPiece(piece: ChecklistPiece): EtatPiece {
  if (piece.fait) {
    return { texte: 'Fait', classe: 'checklist-etat checklist-etat--fait' };
  }
  if (piece.motifRefus != null) {
    return { texte: 'Refusé', classe: 'checklist-etat checklist-etat--refuse' };
  }
  // Une phrase entière ne tient pas dans une pastille : l'état reste court,
  // l'explication passe en note sous le libellé.
  if (piece.texteSecondaire === CHECKLIST_VALIDATION_EXPIREE) {
    return {
      texte: 'Expirée',
      classe: 'checklist-etat checklist-etat--expire',
      note: piece.texteSecondaire,
    };
  }
  if (piece.texteSecondaire != null) {
    return { texte: piece.texteSecondaire, classe: 'checklist-etat' };
  }
  return { texte: 'À faire', classe: 'checklist-etat' };
}

export function compteurPieces(pieces: readonly ChecklistPiece[]): string {
  const faites = pieces.filter((piece) => piece.fait).length;
  return faites === 1
    ? `1 pièce sur ${pieces.length}`
    : `${faites} pièces sur ${pieces.length}`;
}

export function estComplet(pieces: readonly ChecklistPiece[]): boolean {
  return pieces.length > 0 && pieces.every((piece) => piece.fait);
}
