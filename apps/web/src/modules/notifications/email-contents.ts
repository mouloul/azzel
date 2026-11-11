import { CONNEXION_PATH } from '@/modules/iam/constants';
import { readEnv } from '@/modules/iam/env';

export const NOTIFICATION_TYPES = [
  'inscription_recue',
  'dossier_valide',
  'dossier_refuse',
  'invitation_volontaire',
  'rappel_j7',
  'rappel_preuve',
  'inscription_expiree',
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

/** Story 3.1 — invitation volontaire : AUCUN jeton (le lien pointe vers
 * /connexion, connexion par code commune à tous les rôles). */
export interface InvitationVolontairePayload {
  nom: string;
}

/** Story 6.4 — rappel batterie J-7 : date de course au format SQL `YYYY-MM-DD`
 * (date civile, formatée en français lisible au rendu de l'email). */
export interface RappelJ7Payload {
  prenom: string;
  dateCourse: string;
}

export type NotificationPayload =
  | InscriptionRecuePayload
  | DossierValidePayload
  | DossierRefusePayload
  | InvitationVolontairePayload
  | RappelJ7Payload
  | RappelPreuvePayload
  | InscriptionExpireePayload;

/** Rappel de la veille : la limite est un instant ISO, rendu à l'heure d'Alger. */
export interface RappelPreuvePayload {
  coureurId: string;
  prenom: string;
  limite: string;
}

export interface InscriptionExpireePayload {
  coureurId: string;
  prenom: string;
  edition: string;
}

export const DEFAULT_APP_URL = 'http://localhost:3000';

export const ESPACE_COUREUR_PATH = '/espace-coureur';

export function readEspaceCoureurUrl(): string {
  return readAppUrl(ESPACE_COUREUR_PATH);
}

/** Story 3.1 — lien de l'invitation volontaire : la page de connexion unique. */
export function readConnexionUrl(): string {
  return readAppUrl(CONNEXION_PATH);
}

/**
 * Story 6.4 — URL publique de l'app coureurs pour le lien du rappel J-7 :
 * `RUNNERS_APP_URL` (repli `APP_URL`), lue serveur-side, jamais codée dur.
 * Une valeur absente/malformée/schéma non cliquable retombe sur le défaut.
 */
export function readRunnersAppUrl(): string {
  const raw = readEnv('RUNNERS_APP_URL') ?? readEnv('APP_URL');
  if (raw !== null) {
    try {
      const base = new URL(raw);
      if (base.protocol === 'http:' || base.protocol === 'https:') {
        return base.toString().replace(/\/+$/, '');
      }
    } catch {
      // URL invalide : repli.
    }
  }
  return DEFAULT_APP_URL;
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
  /** Story 3.1 — lien de l'invitation volontaire : page /connexion (sans jeton). */
  connexionUrl: string;
  /** Story 6.4 — lien vers l'app coureurs (RUNNERS_APP_URL, repli APP_URL). */
  runnersAppUrl: string;
}

export interface BuiltNotificationEmail {
  subject: string;
  text: string;
}

export const INSCRIPTION_RECUE_SUBJECT = 'Azzel — ton inscription est bien reçue';

export const DOSSIER_VALIDE_SUBJECT = 'Azzel — ton dossier est validé';

export const DOSSIER_REFUSE_SUBJECT = 'Azzel — ton dossier est refusé';

export const INVITATION_VOLONTAIRE_SUBJECT = 'Azzel — ton accès volontaire';

export const RAPPEL_J7_SUBJECT = 'Ta course approche — prépare ta batterie';

export const RAPPEL_PREUVE_SUBJECT = 'Azzel — ta place t’attend encore jusqu’à demain';

export const INSCRIPTION_EXPIREE_SUBJECT = 'Azzel — ton inscription a expiré';

/**
 * Échéance rendue à l'heure d'Alger : l'instant est stocké en UTC, mais le
 * coureur vit à l'heure de la course. Lui écrire « 22h59 » le ferait rater
 * d'une heure.
 */
function formaterEcheanceAlger(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Africa/Algiers',
    }).format(instant);
  } catch {
    return null;
  }
}

/**
 * Story 6.4 — date de course `YYYY-MM-DD` en français lisible, ou NULL si la
 * date est invalide/inexistante (aller-retour : 2027-02-31 est rejeté, pas
 * glissé au 3 mars). `timeZone: 'UTC'` obligatoire : une date civile formatée
 * dans le fuseau du serveur glisserait d'un jour selon l'hôte.
 */
function formaterDateCourseFr(dateCourse: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateCourse)) {
    const ms = Date.parse(`${dateCourse}T00:00:00.000Z`);
    if (!Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === dateCourse) {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(ms));
    }
  }
  return null;
}

// Contenus français sobres : objet + texte (pas d'HTML), tutoiement coureur (UX-DR-11).
export function buildNotificationEmail(
  type: NotificationType,
  payload: NotificationPayload,
  options: NotificationEmailOptions,
): BuiltNotificationEmail {
  if (type === 'rappel_preuve') {
    const rappel = payload as RappelPreuvePayload;
    const echeance = formaterEcheanceAlger(rappel.limite);
    return {
      subject: RAPPEL_PREUVE_SUBJECT,
      text: [
        `Salut ${rappel.prenom},`,
        '',
        'Ta place est réservée, mais ta preuve de paiement manque encore.',
        // Limite illisible en base : phrase de repli honnête plutôt qu'une
        // date vide qui ferait douter de l'échéance elle-même.
        echeance === null
          ? 'Elle doit être déposée avant la fin de ton délai, sinon ta place repart.'
          : `Dépose-la avant le ${echeance}, sinon ta place repart aux autres coureurs.`,
        '',
        'Déposer ma preuve :',
        options.espaceCoureurUrl,
        '',
        `Une question ? Appelle l’équipe : ${options.assistancePhone}`,
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }

  if (type === 'inscription_expiree') {
    const expiree = payload as InscriptionExpireePayload;
    return {
      subject: INSCRIPTION_EXPIREE_SUBJECT,
      text: [
        `Salut ${expiree.prenom},`,
        '',
        `Faute de preuve de paiement dans le délai, ton inscription à ${expiree.edition} a expiré et ta place a été rendue.`,
        '',
        'Rien n’est perdu : depuis ton espace coureur, clique sur « Modifier mon inscription » et enregistre-la de nouveau.',
        'S’il reste une place, elle t’est réservée avec un nouveau délai pour déposer ta preuve ; sinon, tu passes en liste d’attente.',
        options.espaceCoureurUrl,
        '',
        `Si tu as versé à temps, appelle l’équipe : ${options.assistancePhone}`,
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }

  if (type === 'rappel_j7') {
    const rappel = payload as RappelJ7Payload;
    const dateLisible = formaterDateCourseFr(rappel.dateCourse);
    return {
      subject: RAPPEL_J7_SUBJECT,
      text: [
        `Salut ${rappel.prenom},`,
        '',
        // Date sale/invalide en base : phrase de repli honnête, jamais
        // « Ta course est le  — » (motif vide).
        dateLisible === null
          ? 'Ta course arrive bientôt.'
          : `Ta course est le ${dateLisible} — c’est bientôt.`,
        '',
        'Pour que ton suivi et ton e-dossard tiennent jusqu’à l’arrivée :',
        '1. Pars avec une batterie chargée à 100 %.',
        '2. Ne tue pas l’application Azzel pendant la course — verrouille l’écran, mais laisse l’app ouverte.',
        '3. Batterie fragile ? Une powerbank est en vente au village des partenaires.',
        '',
        'Ton e-dossard et ton suivi t’attendent dans l’application :',
        options.runnersAppUrl,
        '',
        `Une question ? Appelle l’équipe : ${options.assistancePhone}`,
        '',
        'À bientôt,',
        'L’équipe Azzel',
      ].join('\n'),
    };
  }
  if (type === 'invitation_volontaire') {
    const invitation = payload as InvitationVolontairePayload;
    return {
      subject: INVITATION_VOLONTAIRE_SUBJECT,
      text: [
        `Salut ${invitation.nom},`,
        '',
        'Bienvenue dans l’équipe des volontaires !',
        'Pour accéder à tes missions, ouvre ce lien :',
        options.connexionUrl,
        '',
        'Connecte-toi avec cette adresse email : tu recevras un code à saisir, pas de mot de passe à retenir.',
        '',
        'Conseil : connecte-toi la veille du jour J, sur le téléphone que tu utiliseras le jour J — ta session y reste ouverte, tu n’auras pas de code à attendre le matin de la course (une connexion sur un autre appareil fermerait la première).',
        '',
        `Un souci pour te connecter ? Appelle l’équipe : ${options.assistancePhone}`,
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
        'Pour le reprendre, clique sur « Modifier mon inscription » depuis ton espace coureur, puis dépose une nouvelle preuve de paiement (la preuve refusée ne compte plus).',
        'S’il reste une place, elle t’est réservée avec un nouveau délai ; sinon, tu passes en liste d’attente.',
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
    return { nom: payloadString(record, 'nom').trim() };
  }
  if (type === 'rappel_j7') {
    return {
      prenom: payloadString(record, 'prenom').trim(),
      dateCourse: payloadString(record, 'dateCourse').trim(),
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
