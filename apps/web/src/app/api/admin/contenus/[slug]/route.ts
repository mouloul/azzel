import { NextResponse, type NextRequest } from 'next/server';

import { toContenusApiError } from '@/modules/contenus/errors';
import { getContenu, updateContenu } from '@/modules/contenus/service';

import { guardAdmin } from '../../guard';
import { errorResponse, readJsonBody } from '../body';

// API interne de la surface admin (story 2.4) : le GET sert la lecture d'un
// bloc (diagnostic/tests — la page /admin/contenus lit via le service), le PUT
// porte l'édition (verrou optimiste : corps { titre, corps, gpxUrl?,
// updatedAt } — updatedAt = version lue, décalée → 409 admin.contenus.conflit).

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const { slug } = await context.params;
  try {
    const contenu = await getContenu(guarded.session, slug);
    return NextResponse.json(
      { ok: true, contenu },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toContenusApiError(error));
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  const { slug } = await context.params;
  try {
    const contenu = await updateContenu(guarded.session, slug, lu.body);
    return NextResponse.json(
      { ok: true, contenu },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toContenusApiError(error));
  }
}
