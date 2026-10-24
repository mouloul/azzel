import { NextResponse, type NextRequest } from 'next/server';

import { adminErrorResponse, guardAdmin } from '@/app/api/admin/guard';
import { sanitizerNomFichier } from '@/modules/rapports/domain';
import { toRapportsApiError } from '@/modules/rapports/errors';
import { genererCommande } from '@/modules/rapports/service';

// Story 7.4 — GET /api/admin/rapports/commande : l'export « commande » du
// processus J-10 (validés par épreuve × taille, médailles, zéro stock).
// Mêmes règles que le rapport : organisateur seul (aucun octet avant la
// garde), CSV RFC 4180 en attachment daté (nom SANITIZÉ — slug d'édition
// base libre, aucune injection d'en-tête), no-store, 503 douce — le fichier
// n'existe qu'entier ou pas du tout.

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const { nomFichier, contenu } = await genererCommande(guarded.session);
    return new NextResponse(Buffer.from(contenu, 'utf8'), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${sanitizerNomFichier(nomFichier)}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return adminErrorResponse(toRapportsApiError(error));
  }
}
