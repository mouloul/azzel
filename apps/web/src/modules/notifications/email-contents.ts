import { INVITATION_TTL_DAYS } from '@/modules/iam/constants';
import { readEnv } from '@/modules/iam/env';

export const NOTIFICATION_TYPES = [
  'inscription_recue',
  'dossier_valide',
  'dossier_refuse',
  'invitation_volontaire',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface InscriptionRecuePayload {
  prenom: string;
  epreuve: string;
}

export interface DossierValidePayload {
  prenom: string;
  epreuve: string;
}

export interface DossierRefusePayload {
  prenom: string;
  epreuve: string;
  motif: string;
}

/** Story 3.1 — le jeton BRUT vit dans le payload (l'email porte le lien) ;
 * l'invitation en base ne stocke que son hash sha256. */
export interface InvitationVolontairePayload {
  nom: string;
  jeton: string;
}

export type NotificationPayload =
  | InscriptionRecuePayload
  | DossierValidePayload
  | DossierRefusePayload
  | InvitationVolontairePayload;

export const DEFAULT_APP_URL = 'http://localhost:3000';

export const ESPACE_COUREUR_PATH = '/espace-coureur';

export const INVITATION_PATH = '/invitation';

export function readEspaceCoureurUrl(): string {
  return readAppUrl(ESPACE_COUREUR_PATH);
}

export function buildInvitationUrl(jeton: string): string {
  return `${readAppUrl(INVITATION_PATH)}?jeton=${encodeURIComponent(jeton)}`;
}

function readAppUrl(path: string): string {
  const raw = readEnv('APP_URL');
  if (raw !== null) {
    try {
      const base = new URL(raw);
      // APP_URL malformée ou schéma non cliquable : repli sur la valeur par défaut.
      if (base.protocol === 'http:' || base.protocol === 'https:') {
        return new URL(path, base).toString();
      }
    } catch {
      // URL invalide : repli.
    }
  }
  return `${DEFAULT_APP_URL}${path}`;
}

export interface NotificationEmailOptions {
  assistancePhone: string;
  espaceCoureurUrl: string;
  /** Story 3.1 — lien d'invitation complet (jeton inclus), construit par ligne. */
  invitationUrl: string;
}

export interface BuiltNotificationEmail {
  subject: string;
  text: string;
}

export const INSCRIPTION_RECUE_SUBJECT = 'Azzel — ton inscription est bien reçue';

export const DOSSIER_VALIDE_SUBJECT = 'Azzel — ton dossier est validé';

export const DOSSIER_REFUSE_SUBJECT = 'Azzel — ton dossier est refusé';

export const INVITATION_VOLONTAIRE_SUBJECT = 'Azzel — ton accès volontaire';

// Contenus français sobres : objet + texte (pas d'HTML), tutoiement coureur (UX-DR-11).
export function buildNotificationEmail(
  type: NotificationType,
  payload: NotificationPayload,
  options: NotificationEmailOptions,
): BuiltNotificationEmail {
  if (type === 'invitation_volontaire') {
    const invitation = payload as InvitationVolontairePayload;
    return {
      subject: INVITATION_VOLONTAIRE_SUBJECT,
      text: [
        `Salut ${invitation.nom},`,
        '',
        'Bienvenue dans l’équipe des volontaires !',
        `Pour activer ton accès, choisis ton mot de passe via ce lien (valable ${INVITATION_TTL_DAYS} jours) :`,
        options.invitationUrl,
        '',
        'Après ça, tu te connecteras avec ton email et ton mot de passe.',
        '',
        `Le lien ne fonctionne plus ? Appelle l’équipe : ${options.assistancePhone}`,
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }
  if (type === 'dossier_refuse') {
    const refuse = payload as DossierRefusePayload;
    const motif = refuse.motif.trim();
    // Motif absent/blanc : pas de ligne « Motif : » avec valeur vide.
    const motifLines = motif === '' ? [] : [`Motif : ${motif}`];
    return {
      subject: DOSSIER_REFUSE_SUBJECT,
      text: [
        `Salut ${refuse.prenom},`,
        '',
        `Ton dossier pour l’épreuve « ${refuse.epreuve} » a été refusé.`,
        ...motifLines,
        '',
        'Tu peux le corriger en déposant une nouvelle preuve depuis ton espace coureur :',
        options.espaceCoureurUrl,
        '',
        `Appeler l’équipe : ${options.assistancePhone}`,
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }
  if (type === 'dossier_valide') {
    const valide = payload as DossierValidePayload;
    return {
      subject: DOSSIER_VALIDE_SUBJECT,
      text: [
        `Salut ${valide.prenom},`,
        '',
        `Bonne nouvelle : ton dossier pour l’épreuve « ${valide.epreuve} » est validé.`,
        'Rien d’autre à faire — on se retrouve au départ.',
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }
  const inscription = payload as InscriptionRecuePayload;
  return {
    subject: INSCRIPTION_RECUE_SUBJECT,
    text: [
      `Salut ${inscription.prenom},`,
      '',
      `Ton inscription à l’épreuve « ${inscription.epreuve} » est bien reçue.`,
      '',
      'Il reste à compléter ton dossier :',
      '1. Accepte la décharge et le règlement.',
      '2. Dépose ta preuve de paiement CCP.',
      '',
      `Tout se fait depuis ton espace coureur : ${options.espaceCoureurUrl}`,
      '',
      'À bientôt,',
      'L’équipe Azzel',
    ].join('\n'),
  };
}

function payloadString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

// payload jsonb relu de base : normalisation défensive avant construction du contenu
// (valeurs trimées — pas d'espace parasite dans les emails).
export function normalizeNotificationPayload(
  type: NotificationType,
  raw: unknown,
): NotificationPayload {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (type === 'invitation_volontaire') {
    return {
      nom: payloadString(record, 'nom').trim(),
      jeton: payloadString(record, 'jeton').trim(),
    };
  }
  const base = {
    prenom: payloadString(record, 'prenom').trim(),
    epreuve: payloadString(record, 'epreuve').trim(),
  };
  if (type === 'dossier_refuse') {
    return { ...base, motif: payloadString(record, 'motif').trim() };
  }
  return base;
}
