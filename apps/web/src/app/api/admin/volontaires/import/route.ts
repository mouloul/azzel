import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import {
  BodyTooLargeError,
  ImportFileInvalidError,
  InvalidBodyError,
  toMissionsApiError,
  type ApiError,
} from '@/modules/missions/errors';
import { MAX_IMPORT_BYTES } from '@/modules/missions/import-format';
import { importVolontaires } from '@/modules/missions/service';

const FICHIER_FIELD = 'fichier';

function errorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
}

export async function POST(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  // Pattern preuve : Content-Length d'abord (2 Mo), multipart ensuite.
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return errorResponse(toMissionsApiError(new InvalidBodyError()));
  }
  if (Number(contentLength) > MAX_IMPORT_BYTES) {
    return errorResponse(toMissionsApiError(new BodyTooLargeError(MAX_IMPORT_BYTES)));
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return errorResponse(toMissionsApiError(new InvalidBodyError()));
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(toMissionsApiError(new InvalidBodyError()));
  }
  const candidate = form.get(FICHIER_FIELD);
  if (candidate === null || typeof candidate === 'string') {
    return errorResponse(toMissionsApiError(new InvalidBodyError()));
  }
  const file = candidate as File;
  if (file.size === 0) {
    return errorResponse(toMissionsApiError(new ImportFileInvalidError()));
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return errorResponse(toMissionsApiError(new BodyTooLargeError(MAX_IMPORT_BYTES)));
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const rapport = await importVolontaires(guarded.session, {
      bytes,
      filename: file.name,
    });
    return NextResponse.json({ rapport }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}
