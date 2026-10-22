import { NextResponse, type NextRequest } from 'next/server';

import { guardVolontaire, toVolontairesApiError } from '@/app/api/volontaires/guard';
import { getAnnuaireEdition } from '@/modules/missions/service';

// Story 3.4 — annuaire des coureurs pour les appareils scanneurs : réplique
// versionnée (contrat shared AD-8) préchargée à CHAQUE ouverture en ligne puis
// persistée en IndexedDB côté PWA. no-store : l'annuaire change avec les
// attributions de dossards, jamais de cache HTTP.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guarded = await guardVolontaire(request);
  if ('response' in guarded) {
    // Aucune réponse d'erreur ne part sans no-store : un intermédiaire ne
    // doit pas cacher une 401/503 périmée.
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  try {
    const annuaire = await getAnnuaireEdition(guarded.session);
    return NextResponse.json(annuaire, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const apiError = toVolontairesApiError(error);
    return NextResponse.json(apiError.envelope, {
      status: apiError.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
