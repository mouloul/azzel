/**
 * Numéro de transaction d'un reçu CCP ou Baridimob. Le format exact varie d'un
 * service à l'autre : on n'impose que ce qui écarte la faute de frappe évidente
 * (trop court, caractères parasites) sans refuser un numéro réel.
 */
export const NUMERO_TRANSACTION_MIN = 6;
export const NUMERO_TRANSACTION_MAX = 30;

const FORMAT = /^[A-Z0-9/-]+$/;

export type NumeroTransactionResultat =
  | { ok: true; numero: string }
  | { ok: false; message: string };

/** Espaces retirés (on recopie souvent par blocs), casse normalisée. */
export function normaliserNumeroTransaction(raw: unknown): NumeroTransactionResultat {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, message: 'Indique le numéro de transaction de ton reçu.' };
  }
  const numero = raw.replace(/\s+/g, '').toUpperCase();
  if (
    numero.length < NUMERO_TRANSACTION_MIN ||
    numero.length > NUMERO_TRANSACTION_MAX ||
    !FORMAT.test(numero)
  ) {
    return {
      ok: false,
      message: `Le numéro de transaction compte ${NUMERO_TRANSACTION_MIN} à ${NUMERO_TRANSACTION_MAX} caractères (chiffres et lettres).`,
    };
  }
  return { ok: true, numero };
}
