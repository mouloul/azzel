import { NextResponse, type NextRequest } from 'next/server';

import { adminErrorResponse, guardAdmin } from '@/app/api/admin/guard';
import { sanitizerNomFichier } from '@/modules/rapports/domain';
import { toRapportsApiError } from '@/modules/rapports/errors';
import { genererRapportPostCourse } from '@/modules/rapports/service';

// Story 7.4 — GET /api/admin/rapports/post-course : le fichier UNIQUE couvrant
// l'édition (FR-26). Organisateur seul (guardAdmin : 401/403/503 enveloppes
// admin.*, AUCUN octet de CSV), CSV RFC 4180 (UTF-8 BOM, CRLF) en attachment
// daté, no-store. Le contenu est assemblé ENTIÈREMENT avant la réponse : une
// base indisponible ne sort jamais un CSV à moitié servi (503 douce). Le nom
// servi est SANITIZÉ (slug d'édition base libre : aucun CRLF ni guillemet ne
// peut traverser Content-Disposition).

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const { nomFichier, contenu } = await genererRapportPostCourse(guarded.session);
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
