import { CODE_TTL_MINUTES } from './constants';
import { readSmtpUrl } from './env';
import { EmailSendError } from './errors';

export const APP_EMAIL_FROM = 'Azzel <no-reply@azzel.dz>';

export const LOGIN_CODE_EMAIL_SUBJECT = 'Ton code de connexion Azzel';

export function buildLoginCodeEmailText(code: string): string {
  return `Ton code Azzel : ${code} — valable ${CODE_TTL_MINUTES} minutes.`;
}

export interface PlainTextEmailInput {
  to: string;
  subject: string;
  text: string;
  // Repli développement (SMTP_URL absente) : message journalisé à la place de celui
  // du transport générique — sendLoginCodeEmail journalise le code en clair.
  devLog?: () => void;
}

// Transport SMTP partagé (nodemailer). Sans SMTP_URL : repli console en développement,
// mais échec explicite en production (une ligne failed rejeuable vaut mieux qu'un
// « envoyé » mensonger).
export async function sendPlainTextEmail(input: PlainTextEmailInput): Promise<void> {
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
    });
  } catch (cause) {
    throw new EmailSendError(cause);
  }
}

export async function sendLoginCodeEmail(email: string, code: string): Promise<void> {
  await sendPlainTextEmail({
    to: email,
    subject: LOGIN_CODE_EMAIL_SUBJECT,
    text: buildLoginCodeEmailText(code),
    devLog: () =>
      console.info(
        '[iam] code de connexion pour %s : %s (valable %d minutes)',
        email,
        code,
        CODE_TTL_MINUTES,
      ),
  });
}
