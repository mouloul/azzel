import { rendreEmailHtml, type ContenuEmail } from '@/lib/email-gabarit';

import { CODE_TTL_MINUTES } from './constants';
import { readEnv, readSmtpUrl } from './env';
import { EmailSendError } from './errors';

export const APP_EMAIL_FROM_DEFAUT = 'Azzel <no-reply@azzel.dz>';

/**
 * Les fournisseurs d'envoi refusent les expéditeurs qu'ils n'ont pas validés :
 * une adresse en dur empêche tout envoi depuis un environnement dont le domaine
 * n'est pas le nôtre, et l'échec se découvre quand quelqu'un attend son code.
 */
export const APP_EMAIL_FROM = readEnv('APP_EMAIL_FROM') ?? APP_EMAIL_FROM_DEFAUT;

export const LOGIN_CODE_EMAIL_SUBJECT = 'Ton code de connexion Azzel';

export function buildLoginCodeEmailText(code: string): string {
  return `Ton code Azzel : ${code} — valable ${CODE_TTL_MINUTES} minutes.`;
}

function contenuCodeConnexion(code: string): ContenuEmail {
  return {
    objet: LOGIN_CODE_EMAIL_SUBJECT,
    apercu: buildLoginCodeEmailText(code),
    surtitre: 'Connexion',
    titre: 'Ton code de connexion',
    salutation: 'Salut,',
    blocs: [
      { type: 'paragraphe', texte: 'Saisis ce code sur la page de connexion :' },
      { type: 'code', code },
      {
        type: 'paragraphe',
        texte: `Il est valable ${CODE_TTL_MINUTES} minutes. Si tu n’as rien demandé, ignore simplement cet email : personne ne peut se connecter sans ce code.`,
      },
    ],
  };
}

export function buildLoginCodeEmailHtml(code: string): string {
  return rendreEmailHtml(contenuCodeConnexion(code));
}

export interface EmailInput {
  to: string;
  subject: string;
  /** Toujours fourni : repli des clients qui n'affichent pas le HTML. */
  text: string;
  html?: string;
  devLog?: () => void;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const smtpUrl = readSmtpUrl();
  if (!smtpUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new EmailSendError(new Error('SMTP_URL absente en production'));
    }
    if (input.devLog) {
      input.devLog();
    } else {
      console.info(
        '[email] envoi simulé (SMTP_URL absente) — destinataire %s, objet « %s »',
        input.to,
        input.subject,
      );
    }
    return;
  }
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: APP_EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html === undefined ? {} : { html: input.html }),
    });
  } catch (cause) {
    throw new EmailSendError(cause);
  }
}

export async function sendLoginCodeEmail(email: string, code: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: LOGIN_CODE_EMAIL_SUBJECT,
    text: buildLoginCodeEmailText(code),
    html: buildLoginCodeEmailHtml(code),
    devLog: () =>
      console.info(
        '[iam] code de connexion pour %s : %s (valable %d minutes)',
        email,
        code,
        CODE_TTL_MINUTES,
      ),
  });
}
