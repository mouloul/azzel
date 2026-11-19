import { NextResponse } from 'next/server';

import { getDbClient } from '@/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Délai maximal du `select 1` : au-delà, la base est tenue pour muette. */
export const DELAI_SANTE_MS = 3_000;

const ENTETES = { 'Cache-Control': 'no-store' } as const;

async function baseRepond(): Promise<boolean> {
  let sql: ReturnType<typeof getDbClient>;
  try {
    sql = getDbClient();
  } catch {
    return false;
  }
  if (!sql) {
    return false;
  }
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<boolean>((resolve) => {
    minuteur = setTimeout(() => resolve(false), DELAI_SANTE_MS);
  });
  const requete = sql`select 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([requete, delai]);
  } finally {
    clearTimeout(minuteur);
  }
}

/** Sonde pour un moniteur externe : aucun détail d'infrastructure dans la réponse. */
export async function GET(): Promise<NextResponse> {
  const ok = await baseRepond();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: ENTETES });
}
