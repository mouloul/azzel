import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toMissionsApiError } from '@/modules/missions/errors';
import { buildModeleImport } from '@/modules/missions/service';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const modele = await buildModeleImport();
    return new NextResponse(Buffer.from(modele), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="volontaires-modele.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(toMissionsApiError(error).envelope, {
      status: toMissionsApiError(error).status,
    });
  }
}
