import { CODE_TTL_MINUTES } from './constants';
import { readSmtpUrl } from './env';
import { EmailSendError } from './errors';

export const LOGIN_CODE_EMAIL_FROM = 'Azzel <no-reply@azzel.dz>';

export const LOGIN_CODE_EMAIL_SUBJECT = 'Ton code de connexion Azzel';

export function buildLoginCodeEmailText(code: string): string {
  return `Ton code Azzel : ${code} — valable ${CODE_TTL_MINUTES} minutes.`;
}

export async function sendLoginCodeEmail(email: string, code: string): Promise<void> {
  const smtpUrl = readSmtpUrl();
  if (!smtpUrl) {
    console.info(
      '[iam] code de connexion pour %s : %s (valable %d minutes)',
      email,
      code,
      CODE_TTL_MINUTES,
    );
    return;
  }
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: LOGIN_CODE_EMAIL_FROM,
      to: email,
      subject: LOGIN_CODE_EMAIL_SUBJECT,
      text: buildLoginCodeEmailText(code),
    });
  } catch (cause) {
    throw new EmailSendError(cause);
  }
}
