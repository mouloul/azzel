import { NextResponse, type NextRequest } from 'next/server';
import { encoderPayloadEdossard } from '@azzel/shared';

import { guardCoureur, coureurErrorResponse, toCoureurApiError } from '../guard';
import { obtenirEdossard } from '@/modules/inscriptions/service';

// Story 6.1 — e-dossard en JSON pour l'app native (GET /api/coureur/
// e-dossard). Dossier non validé → { disponible: false } (message d'attente
// côté app, AUCUN QR) ; validé → état complet + payloadQr encodé via le
// contrat shared (`azzel-e1:<jeton>` — jamais le dossard nu). L'app rend le
// QR LOCALEMENT depuis ce payload : lisible réseau coupé, 30 jours plus tard.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guarded = await guardCoureur(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const edossard = await obtenirEdossard(guarded.session);
    if (edossard === null) {
      return NextResponse.json({ disponible: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(
      { ...edossard, disponible: true, payloadQr: encoderPayloadEdossard(edossard.jeton) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return coureurErrorResponse(toCoureurApiError(error));
  }
}
