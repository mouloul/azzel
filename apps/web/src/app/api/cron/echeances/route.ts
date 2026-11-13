import { createHash, timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { createErrorEnvelope } from '@azzel/shared';

import { readDatabaseUrl, readEnv } from '@/modules/iam/env';
import { AppRoleMisconfiguredError } from '@/modules/iam/errors';
import { balayerEcheances, type BilanEcheances } from '@/modules/inscriptions/echeances';
import { getInscriptionsStore, isConnectionError } from '@/modules/inscriptions/store';
import { getOutboxStore } from '@/modules/notifications/outbox-store';

/**
 * Balayage des échéances de preuve, déclenché de l'extérieur — recette
 * Vercel seulement, faute de crontab (la production VPS lance la commande
 * `inscriptions:echeances` depuis sa crontab système).
 *
 * Deux appelants : le cron Vercel quotidien (`apps/web/vercel.json`), filet de
 * sécurité, et le workflow GitHub Actions horaire (`.github/workflows/
 * echeances.yml`). Le balayage est idempotent : un double passage est sans
 * effet.
 *
 * Accès : `Authorization: Bearer <CRON_SECRET>` — l'en-tête qu'envoie Vercel
 * Cron dès que la variable `CRON_SECRET` est posée. Sans secret configuré (ou
 * trop court), la route refuse (503) : jamais d'accès ouvert.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Le passage de la file d'envoi parle SMTP, email par email : on laisse à la
// fonction une minute, le plafond du plan Hobby hors « fluid compute ».
export const maxDuration = 60;

/**
 * Plafond de la file par appel. Chaque email ouvre son propre transport SMTP
 * (connexion, TLS, authentification) : une à deux secondes pièce. Trente
 * emails tiennent dans `maxDuration` avec de la marge ; au-delà, une coupure
 * en plein lot laisserait des lignes en « sending » jusqu'à l'expiration du
 * bail, puis les renverrait. Le reste part au passage suivant.
 */
const PLAFOND_ENVOI = 30;

/** En deçà, un secret se devine ; `openssl rand -hex 32` en donne 64. */
const LONGUEUR_MIN_SECRET = 32;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function empreinte(valeur: string): Buffer {
  return createHash('sha256').update(valeur, 'utf8').digest();
}

/**
 * Jeton porté par `Authorization: Bearer <jeton>` — schéma insensible à la
 * casse (RFC 9110), blancs autour du jeton ignorés : un retour à la ligne collé
 * avec le secret dans GitHub ne doit pas valoir un 401 permanent.
 */
function jetonPresente(enTete: string | null): string {
  const correspondance = /^\s*bearer\s+(.*)$/is.exec(enTete ?? '');
  return correspondance?.[1]?.trim() ?? '';
}

/**
 * Comparaison en temps constant. On compare les empreintes SHA-256 : longueur
 * fixe, donc ni exception de `timingSafeEqual` sur des tailles différentes, ni
 * fuite de la longueur du secret.
 */
function autorise(enTete: string | null, secret: string): boolean {
  return timingSafeEqual(empreinte(jetonPresente(enTete)), empreinte(secret));
}

function reponseErreur(
  status: number,
  envelope: ReturnType<typeof createErrorEnvelope>,
  extra: { headers?: Record<string, string>; bilan?: BilanPublic } = {},
): NextResponse {
  const corps = extra.bilan ? { ...envelope, bilan: extra.bilan } : envelope;
  return NextResponse.json(corps, {
    status,
    headers: { ...NO_STORE, ...extra.headers },
  });
}

interface BilanPublic {
  /** Emails de rappel enfilés (veille de l'échéance). */
  rappels: number;
  /** Dossiers passés en « expirée » — autant de places rendues. */
  expirees: number;
  /** Emails enfilés par ce balayage : rappels + avis d'expiration. */
  emailsEnfiles: number;
  /** Emails effectivement partis lors du passage de la file. */
  emailsEnvoyes: number;
  /** Emails en échec : ils restent dans la file, repris au passage suivant. */
  emailsEnEchec: number;
}

function bilanPublic(bilan: BilanEcheances): BilanPublic {
  return {
    rappels: bilan.rappels,
    expirees: bilan.expirees,
    emailsEnfiles: bilan.rappels + bilan.emailsExpiration,
    emailsEnvoyes: bilan.envoi.sent,
    emailsEnEchec: bilan.envoi.failed,
  };
}

export async function GET(request: NextRequest) {
  const secret = readEnv('CRON_SECRET')?.trim() ?? '';
  if (secret.length < LONGUEUR_MIN_SECRET) {
    console.error(
      `[cron] CRON_SECRET absente ou trop courte (${LONGUEUR_MIN_SECRET} caractères minimum) : balayage refusé.`,
    );
    return reponseErreur(
      503,
      createErrorEnvelope({
        code: 'cron.not_configured',
        message: 'Balayage des échéances non configuré.',
        action: `Posez CRON_SECRET (${LONGUEUR_MIN_SECRET} caractères minimum, ex. openssl rand -hex 32) dans les variables d’environnement du serveur.`,
      }),
    );
  }

  if (!autorise(request.headers.get('authorization'), secret)) {
    console.warn('[cron] appel refusé : en-tête Authorization absent ou invalide.');
    return reponseErreur(
      401,
      createErrorEnvelope({
        code: 'cron.unauthorized',
        message: 'Appel non autorisé.',
        action: 'Présentez l’en-tête « Authorization: Bearer » avec le secret du cron.',
      }),
      { headers: { 'WWW-Authenticate': 'Bearer' } },
    );
  }

  if (readDatabaseUrl() === null) {
    // Panne de configuration, pas de réseau : « réessayez » serait trompeur.
    console.error('[cron] DATABASE_URL absente : balayage des échéances impossible.');
    return reponseErreur(
      503,
      createErrorEnvelope({
        code: 'cron.db_not_configured',
        message: 'Base de données non configurée.',
        action: 'Posez DATABASE_URL (rôle azzel_app) dans les variables d’environnement du serveur, puis redéployez.',
      }),
    );
  }

  let bilan: BilanEcheances;
  try {
    bilan = await balayerEcheances(
      { inscriptions: getInscriptionsStore(), outbox: getOutboxStore() },
      new Date(),
      { plafondEnvoi: PLAFOND_ENVOI },
    );
  } catch (error) {
    console.error('[cron] balayage des échéances en échec :', error);
    if (isConnectionError(error)) {
      return reponseErreur(
        503,
        createErrorEnvelope({
          code: 'cron.db_unavailable',
          message: 'Connexion à la base indisponible.',
          action: 'Réessayez dans un instant : le balayage est idempotent.',
        }),
      );
    }
    if (error instanceof AppRoleMisconfiguredError) {
      return reponseErreur(
        503,
        createErrorEnvelope({
          code: 'cron.db_misconfigured',
          message: 'Service indisponible : configuration de la base incorrecte.',
          action: 'DATABASE_URL doit pointer sur le rôle applicatif azzel_app.',
        }),
      );
    }
    return reponseErreur(
      500,
      createErrorEnvelope({
        code: 'cron.internal_error',
        message: 'Une erreur inattendue est survenue.',
        action: 'Consultez les journaux du serveur, puis relancez : le balayage est idempotent.',
      }),
    );
  }

  const resume = bilanPublic(bilan);
  console.info(
    `[cron] échéances : ${resume.rappels} rappel(s), ${resume.expirees} expiration(s), ` +
      `${resume.emailsEnfiles} email(s) enfilé(s), ${resume.emailsEnvoyes} envoyé(s), ` +
      `${resume.emailsEnEchec} en échec` +
      (bilan.envoi.storeError !== null ? ', file d’envoi (partiellement) illisible.' : '.'),
  );

  if (bilan.envoi.storeError !== null) {
    // Rappels et expirations sont faits (et comptés), mais la file n'a pas pu
    // être lue, en tout ou partie : l'appelant doit le voir (workflow en
    // rouge). Le passage suivant enverra ce qui attend.
    return reponseErreur(
      503,
      createErrorEnvelope({
        code: 'cron.outbox_unavailable',
        message:
          resume.emailsEnvoyes > 0
            ? 'File d’envoi partiellement injoignable : une partie des emails n’a pas pu partir.'
            : 'File d’envoi injoignable : aucun email n’est parti.',
        action: 'Réessayez dans un instant : le balayage est idempotent.',
      }),
      { bilan: resume },
    );
  }

  if (bilan.envoi.failed > 0) {
    // Même verdict que la commande (sortie en 1) : un SMTP cassé ne doit pas
    // laisser le workflow au vert. Les emails en échec restent dans la file.
    return reponseErreur(
      502,
      createErrorEnvelope({
        code: 'cron.emails_failed',
        message: `${bilan.envoi.failed} email(s) n’ont pas pu partir ; ils restent dans la file.`,
        action: 'Vérifiez SMTP_URL et APP_EMAIL_FROM : la file est reprise au passage suivant.',
      }),
      { bilan: resume },
    );
  }

  return NextResponse.json({ ok: true, bilan: resume }, { headers: NO_STORE });
}

