import type { ChecklistPiece } from '@/modules/inscriptions/service';

export const BANDEAU_DOSSIER_VALIDE = 'Dossier validé — dossard prêt';

export interface EtatPiece {
  texte: string;
  classe: string;
}

export function etatPiece(piece: ChecklistPiece): EtatPiece {
  if (piece.fait) {
    return { texte: 'Fait', classe: 'checklist-etat checklist-etat--fait' };
  }
  if (piece.motifRefus != null) {
    return { texte: 'Refusé', classe: 'checklist-etat checklist-etat--refuse' };
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
