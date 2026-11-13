import { DEFAULT_APP_URL, readAppUrl } from '@/lib/app-url';
import { rendreEmail, type ContenuEmail, type EmailRendu } from '@/lib/email-gabarit';
import { CONNEXION_PATH } from '@/modules/iam/constants';
import { readEnv } from '@/modules/iam/env';

export { DEFAULT_APP_URL } from '@/lib/app-url';

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
    }
  }
  return DEFAULT_APP_URL;
}

export interface NotificationEmailOptions {
  assistancePhone: string;
  espaceCoureurUrl: string;
  /** Story 3.1 — lien de l'invitation volontaire : page /connexion (sans jeton). */
  connexionUrl: string;
  /** Story 6.4 — lien vers l'app coureurs (RUNNERS_APP_URL, repli APP_URL). */
  runnersAppUrl: string;
}

export type BuiltNotificationEmail = EmailRendu;

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

function contenuNotification(
  type: NotificationType,
  payload: NotificationPayload,
  options: NotificationEmailOptions,
): ContenuEmail {
  if (type === 'rappel_preuve') {
    const rappel = payload as RappelPreuvePayload;
    const echeance = formaterEcheanceAlger(rappel.limite);
    return {
      objet: RAPPEL_PREUVE_SUBJECT,
      apercu: 'Ta preuve de paiement manque encore : dépose-la à temps pour garder ta place.',
      surtitre: 'Rappel',
      titre: 'Ta place t’attend encore',
      salutation: `Salut ${rappel.prenom},`,
      blocs: [
        {
          type: 'paragraphe',
          texte: 'Ta place est réservée, mais ta preuve de paiement manque encore.',
        },
        {
          type: 'encart',
          ton: 'alerte',
          texte:
            echeance === null
              ? 'Elle doit être déposée avant la fin de ton délai, sinon ta place repart.'
              : `Dépose-la avant le ${echeance}, sinon ta place repart aux autres coureurs.`,
        },
        { type: 'bouton', libelle: 'Déposer ma preuve', url: options.espaceCoureurUrl },
        {
          type: 'assistance',
          libelle: 'Une question ? Appelle l’équipe',
          telephone: options.assistancePhone,
        },
      ],
    };
  }

  if (type === 'inscription_expiree') {
    const expiree = payload as InscriptionExpireePayload;
    return {
      objet: INSCRIPTION_EXPIREE_SUBJECT,
      apercu: 'Ta place a été rendue, mais tu peux encore reprendre ton inscription.',
      surtitre: 'Inscription',
      titre: 'Ton inscription a expiré',
      salutation: `Salut ${expiree.prenom},`,
      blocs: [
        {
          type: 'paragraphe',
          texte: `Faute de preuve de paiement dans le délai, ton inscription à ${expiree.edition} a expiré et ta place a été rendue.`,
        },
        {
          type: 'paragraphe',
          texte:
            'Rien n’est perdu : depuis ton espace coureur, clique sur « Modifier mon inscription » et enregistre-la de nouveau.',
        },
        {
          type: 'encart',
          texte:
            'S’il reste une place, elle t’est réservée avec un nouveau délai pour déposer ta preuve ; sinon, tu passes en liste d’attente.',
        },
        { type: 'bouton', libelle: 'Reprendre mon inscription', url: options.espaceCoureurUrl },
        {
          type: 'assistance',
          libelle: 'Si tu as versé à temps, appelle l’équipe',
          telephone: options.assistancePhone,
        },
      ],
    };
  }

  if (type === 'rappel_j7') {
    const rappel = payload as RappelJ7Payload;
    const dateLisible = formaterDateCourseFr(rappel.dateCourse);
    return {
      objet: RAPPEL_J7_SUBJECT,
      apercu: 'Batterie chargée, application ouverte : trois réflexes pour le jour J.',
      surtitre: 'J-7',
      titre: 'Ta course approche',
      salutation: `Salut ${rappel.prenom},`,
      blocs: [
        {
          type: 'paragraphe',
          texte:
            dateLisible === null
              ? 'Ta course arrive bientôt.'
              : `Ta course est le ${dateLisible} — c’est bientôt.`,
        },
        {
          type: 'etapes',
          intro: 'Pour que ton suivi et ton e-dossard tiennent jusqu’à l’arrivée :',
          items: [
            'Pars avec une batterie chargée à 100 %.',
            'Ne tue pas l’application Azzel pendant la course — verrouille l’écran, mais laisse l’app ouverte.',
            'Batterie fragile ? Une powerbank est en vente au village des partenaires.',
          ],
        },
        {
          type: 'paragraphe',
          texte: 'Ton e-dossard et ton suivi t’attendent dans l’application.',
        },
        { type: 'bouton', libelle: 'Ouvrir l’application', url: options.runnersAppUrl },
        {
          type: 'assistance',
          libelle: 'Une question ? Appelle l’équipe',
          telephone: options.assistancePhone,
        },
      ],
    };
  }

  if (type === 'invitation_volontaire') {
    const invitation = payload as InvitationVolontairePayload;
    return {
      objet: INVITATION_VOLONTAIRE_SUBJECT,
      apercu: 'Bienvenue dans l’équipe des volontaires : voici comment accéder à tes missions.',
      surtitre: 'Volontaires',
      titre: 'Bienvenue dans l’équipe',
      salutation: `Salut ${invitation.nom},`,
      blocs: [
        {
          type: 'paragraphe',
          texte: 'Bienvenue dans l’équipe des volontaires ! Pour accéder à tes missions, ouvre ce lien.',
        },
        { type: 'bouton', libelle: 'Accéder à mes missions', url: options.connexionUrl },
        {
          type: 'paragraphe',
          texte:
            'Connecte-toi avec cette adresse email : tu recevras un code à saisir, pas de mot de passe à retenir.',
        },
        {
          type: 'encart',
          libelle: 'Conseil',
          texte:
            'connecte-toi la veille du jour J, sur le téléphone que tu utiliseras le jour J — ta session y reste ouverte, tu n’auras pas de code à attendre le matin de la course (une connexion sur un autre appareil fermerait la première).',
        },
        {
          type: 'assistance',
          libelle: 'Un souci pour te connecter ? Appelle l’équipe',
          telephone: options.assistancePhone,
        },
      ],
    };
  }

  if (type === 'dossier_refuse') {
    const refuse = payload as DossierRefusePayload;
    const motif = refuse.motif.trim();
    return {
      objet: DOSSIER_REFUSE_SUBJECT,
      apercu: 'Ton dossier est à reprendre : voici pourquoi, et comment faire.',
      surtitre: 'Dossier',
      titre: 'Ton dossier est refusé',
      salutation: `Salut ${refuse.prenom},`,
      blocs: [
        {
          type: 'paragraphe',
          texte: `Ton dossier pour l’épreuve « ${refuse.epreuve} » a été refusé.`,
        },
        ...(motif === ''
          ? []
          : [{ type: 'encart' as const, ton: 'alerte' as const, libelle: 'Motif', texte: motif }]),
        {
          type: 'paragraphe',
          texte:
            'Pour le reprendre, clique sur « Modifier mon inscription » depuis ton espace coureur, puis dépose une nouvelle preuve de paiement (la preuve refusée ne compte plus).',
        },
        {
          type: 'paragraphe',
          texte:
            'S’il reste une place, elle t’est réservée avec un nouveau délai ; sinon, tu passes en liste d’attente.',
        },
        { type: 'bouton', libelle: 'Reprendre mon dossier', url: options.espaceCoureurUrl },
        { type: 'assistance', libelle: 'Appeler l’équipe', telephone: options.assistancePhone },
      ],
    };
  }

  if (type === 'dossier_valide') {
    const valide = payload as DossierValidePayload;
    return {
      objet: DOSSIER_VALIDE_SUBJECT,
      apercu: `Bonne nouvelle : ton dossier pour « ${valide.epreuve} » est validé.`,
      surtitre: 'Dossier',
      titre: 'Ton dossier est validé',
      salutation: `Salut ${valide.prenom},`,
      blocs: [
        {
          type: 'encart',
          ton: 'succes',
          texte: `Bonne nouvelle : ton dossier pour l’épreuve « ${valide.epreuve} » est validé.`,
        },
        { type: 'paragraphe', texte: 'Rien d’autre à faire — on se retrouve au départ.' },
      ],
    };
  }

  const inscription = payload as InscriptionRecuePayload;
  return {
    objet: INSCRIPTION_RECUE_SUBJECT,
    apercu: 'Il reste deux étapes pour compléter ton dossier.',
    surtitre: 'Inscription',
    titre: 'Inscription bien reçue',
    salutation: `Salut ${inscription.prenom},`,
    blocs: [
      {
        type: 'paragraphe',
        texte: `Ton inscription à l’épreuve « ${inscription.epreuve} » est bien reçue.`,
      },
      {
        type: 'etapes',
        intro: 'Il reste à compléter ton dossier, depuis ton espace coureur :',
        items: ['Accepte la décharge et le règlement.', 'Dépose ta preuve de paiement CCP.'],
      },
      { type: 'bouton', libelle: 'Compléter mon dossier', url: options.espaceCoureurUrl },
    ],
  };
}

export function buildNotificationEmail(
  type: NotificationType,
  payload: NotificationPayload,
  options: NotificationEmailOptions,
): BuiltNotificationEmail {
  return rendreEmail(contenuNotification(type, payload, options));
}

function payloadString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

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
  // Ces deux types ne portent ni épreuve ni motif : les ramener à la forme
  // commune perdait l'échéance du rappel et le nom de l'édition (« ton
  // inscription à undefined a expiré »).
  if (type === 'rappel_preuve') {
    return {
      coureurId: payloadString(record, 'coureurId').trim(),
      prenom: payloadString(record, 'prenom').trim(),
      limite: payloadString(record, 'limite').trim(),
    };
  }
  if (type === 'inscription_expiree') {
    return {
      coureurId: payloadString(record, 'coureurId').trim(),
      prenom: payloadString(record, 'prenom').trim(),
      edition: payloadString(record, 'edition').trim(),
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
