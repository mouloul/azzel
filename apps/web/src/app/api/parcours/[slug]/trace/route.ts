import { NextResponse, type NextRequest } from 'next/server';

import { traceCarte } from '@/modules/contenus/parcours/carte';
import { getParcoursDoc } from '@/modules/contenus/parcours/lecture';
import { reperesEpreuve } from '@/modules/contenus/parcours/reperes';

/**
 * Tracé d'une épreuve, servi À LA DEMANDE à la carte de l'accueil.
 *
 * Le tracé (≈ 1 000 points) n'est pas embarqué dans le HTML de l'accueil : il
 * alourdirait chaque visite, y compris celles qui ne regarderont jamais la
 * carte. La carte le réclame à son ouverture.
 *
 * Public, sans session : ce sont les mêmes données que la page /parcours.
 * `parcours.json` est importé statiquement et gelé par version de publication :
 * l'URL qui nomme la version COURANTE (`?v=`) est donc cacheable à vie. Toute
 * autre URL (pas de version, version périmée) reçoit un cache court, pour
 * qu'une vieille adresse « immuable » ne fige pas un ancien tracé.
 */
const CACHE_IMMUABLE = 'public, max-age=31536000, immutable';
const CACHE_COURT = 'public, max-age=300';

const SLUG_VALIDE = /^[a-z0-9-]{1,40}$/;

const INTROUVABLE = NextResponse.json(
  { error: 'Tracé introuvable.' },
  { status: 404, headers: { 'Cache-Control': 'no-store' } },
);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!SLUG_VALIDE.test(slug)) {
    return INTROUVABLE.clone();
  }
  const doc = getParcoursDoc();
  const trace = traceCarte(doc, slug);
  if (trace === null) {
    return INTROUVABLE.clone();
  }
  const versionDemandee = request.nextUrl.searchParams.get('v');
  const versionCourante = doc === null ? null : String(doc.version);
  return NextResponse.json(
    { trace, reperes: reperesEpreuve(doc, slug), version: doc?.version ?? null },
    {
      headers: {
        'Cache-Control':
          versionCourante !== null && versionDemandee === versionCourante
            ? CACHE_IMMUABLE
            : CACHE_COURT,
      },
    },
  );
}
