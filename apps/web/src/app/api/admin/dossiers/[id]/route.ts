import { NextResponse, type NextRequest } from 'next/server';

import { toAdminApiError } from '@/modules/inscriptions/errors';
import { DossierNotFoundError } from '@/modules/inscriptions/errors';
import { getDossierDetail } from '@/modules/inscriptions/service';

import { adminErrorResponse, guardAdmin } from '../../guard';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const { id } = await context.params;
  try {
    const detail = await getDossierDetail(guarded.session, id);
    if (!detail) {
      return adminErrorResponse(toAdminApiError(new DossierNotFoundError()));
    }
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
