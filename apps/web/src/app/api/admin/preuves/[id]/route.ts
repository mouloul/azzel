import { NextResponse, type NextRequest } from 'next/server';

import { toAdminApiError } from '@/modules/inscriptions/errors';
import { readPreuveForOrganisation } from '@/modules/inscriptions/proof-service';

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
    const file = await readPreuveForOrganisation(guarded.session, id);
    // filename et Content-Type depuis la base (storage_key UUID.extension), jamais
    // le nom d'origine du fichier déposé.
    return new NextResponse(new Blob([file.bytes as BlobPart], { type: file.preuve.mime }), {
      status: 200,
      headers: {
        'content-type': file.preuve.mime,
        'content-length': String(file.bytes.byteLength),
        'content-disposition': `attachment; filename="${file.preuve.storageKey}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
