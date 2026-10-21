export const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export type TshirtSize = (typeof TSHIRT_SIZES)[number];

export type AgeCategory = 'U20' | 'Senior' | 'V1' | 'V2' | 'V3';

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  U20: 'Moins de 20 ans (U20)',
  Senior: 'Senior (20–39 ans)',
  V1: 'Vétéran 1 (40–49 ans)',
  V2: 'Vétéran 2 (50–59 ans)',
  V3: 'Vétéran 3 (60 ans et plus)',
};

export const MIN_AGE_AT_RACE = 10;

export const MAX_AGE_AT_RACE = 100;

export const COUREUR_STATUS_EN_CONSTITUTION = 'en constitution';

export const COUREUR_STATUS_VALIDE = 'validé';

export const COUREUR_STATUS_REFUSE = 'refusé';

export const COUREUR_STATUSES = [
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_VALIDE,
  COUREUR_STATUS_REFUSE,
] as const;

export type CoureurStatus = (typeof COUREUR_STATUSES)[number];

export const COUREUR_STATUS_LABELS: Record<CoureurStatus, string> = {
  [COUREUR_STATUS_EN_CONSTITUTION]: 'En constitution',
  [COUREUR_STATUS_VALIDE]: 'Validé',
  [COUREUR_STATUS_REFUSE]: 'Refusé',
};

export function coureurStatusChipClass(status: string): string {
  if (status === COUREUR_STATUS_VALIDE) {
    return 'aa-chip aa-chip--phare';
  }
  if (status === COUREUR_STATUS_REFUSE) {
    return 'aa-chip aa-chip--refuse';
  }
  return 'aa-chip aa-chip--tbc';
}

export function canDepositPreuve(status: string): boolean {
  return (
    status === COUREUR_STATUS_EN_CONSTITUTION ||
    status === COUREUR_STATUS_REFUSE
  );
}

export const MAX_REFUSAL_REASON_LENGTH = 280;

export function normalizeRefusalReason(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim();
}

export const DOCUMENT_SLUGS = ['decharge', 'reglement'] as const;

export type DocumentSlug = (typeof DOCUMENT_SLUGS)[number];

export const DOCUMENT_TITLES: Record<DocumentSlug, string> = {
  decharge: 'Décharge de bonne santé',
  reglement: 'Règlement intérieur',
};

export function documentTitle(slug: string): string {
  return DOCUMENT_TITLES[slug as DocumentSlug] ?? 'Document officiel';
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface InscriptionFormInput {
  epreuve: string;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
}

export type FieldErrors = Partial<Record<keyof InscriptionFormInput, string>>;

export const FIELD_ORDER: readonly (keyof InscriptionFormInput)[] = [
  'epreuve',
  'prenom',
  'nom',
  'dateNaissance',
  'telephone',
  'contactUrgenceNom',
  'contactUrgenceTelephone',
  'tailleTshirt',
];

export function parseIsoDate(value: string): string | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function completedYearsAt(birthDate: string, onDate: string): number | null {
  const birth = parseIsoDate(birthDate);
  const on = parseIsoDate(onDate);
  if (birth === null || on === null) {
    return null;
  }
  const [birthYear, birthMonth, birthDay] = birth
    .split('-')
    .map(Number) as [number, number, number];
  const [onYear, onMonth, onDay] = on.split('-').map(Number) as [number, number, number];
  let age = onYear - birthYear;
  if (onMonth < birthMonth || (onMonth === birthMonth && onDay < birthDay)) {
    age -= 1;
  }
  return age;
}

export function ageCategoryFor(age: number): AgeCategory {
  if (age < 20) {
    return 'U20';
  }
  if (age < 40) {
    return 'Senior';
  }
  if (age < 50) {
    return 'V1';
  }
  if (age < 60) {
    return 'V2';
  }
  return 'V3';
}

export function deriveAgeAndCategory(
  birthDate: string,
  raceDate: string,
): { age: number; category: AgeCategory } | null {
  const age = completedYearsAt(birthDate, raceDate);
  if (age === null) {
    return null;
  }
  return { age, category: ageCategoryFor(age) };
}

export function isRegistrationOpen(registrationClosesAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < registrationClosesAt.getTime();
}

export function formatDateFrUtc(isoUtc: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(isoUtc),
  );
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{6,15}$/.test(normalizePhone(value));
}

export function normalizeInscriptionInput(raw: unknown): InscriptionFormInput {
  const record =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<Record<keyof InscriptionFormInput, unknown>>)
      : {};
  const text = (key: keyof InscriptionFormInput): string => {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  return {
    epreuve: text('epreuve'),
    prenom: text('prenom'),
    nom: text('nom'),
    telephone: normalizePhone(text('telephone')),
    contactUrgenceNom: text('contactUrgenceNom'),
    contactUrgenceTelephone: normalizePhone(text('contactUrgenceTelephone')),
    dateNaissance: text('dateNaissance'),
    tailleTshirt: text('tailleTshirt'),
  };
}

function humanList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values.join('');
  }
  return `${values.slice(0, -1).join(', ')} ou ${values[values.length - 1] ?? ''}`;
}

export function validateInscriptionInput(
  input: InscriptionFormInput,
  epreuveSlugs: readonly string[],
  raceDate: string,
  today: Date = new Date(),
): FieldErrors {
  const errors: FieldErrors = {};

  if (!epreuveSlugs.includes(input.epreuve)) {
    errors.epreuve =
      input.epreuve === ''
        ? 'Choisis ton épreuve.'
        : epreuveSlugs.length === 0
          ? 'Aucune épreuve n’est disponible pour cette édition.'
          : `Épreuve inconnue : choisis ${humanList(epreuveSlugs)}.`;
  }

  if (input.prenom === '') {
    errors.prenom = 'Ton prénom est obligatoire.';
  } else if (input.prenom.length > 80) {
    errors.prenom = '80 caractères maximum pour le prénom.';
  }

  if (input.nom === '') {
    errors.nom = 'Ton nom est obligatoire.';
  } else if (input.nom.length > 80) {
    errors.nom = '80 caractères maximum pour le nom.';
  }

  if (input.telephone === '') {
    errors.telephone = 'Ton numéro de téléphone est obligatoire.';
  } else if (!isValidPhone(input.telephone)) {
    errors.telephone = 'Ce numéro de téléphone ne semble pas valide.';
  }

  if (input.contactUrgenceNom === '') {
    errors.contactUrgenceNom = 'Le nom de ton contact d’urgence est obligatoire.';
  } else if (input.contactUrgenceNom.length > 80) {
    errors.contactUrgenceNom = '80 caractères maximum pour le nom du contact d’urgence.';
  }

  if (input.contactUrgenceTelephone === '') {
    errors.contactUrgenceTelephone = 'Le numéro de ton contact d’urgence est obligatoire.';
  } else if (!isValidPhone(input.contactUrgenceTelephone)) {
    errors.contactUrgenceTelephone = 'Ce numéro d’urgence ne semble pas valide.';
  }

  if (input.dateNaissance === '') {
    errors.dateNaissance = 'Ta date de naissance est obligatoire.';
  } else if (parseIsoDate(input.dateNaissance) === null) {
    errors.dateNaissance = 'Date de naissance invalide.';
  } else if (input.dateNaissance > today.toISOString().slice(0, 10)) {
    errors.dateNaissance = 'Ta date de naissance ne peut pas être dans le futur.';
  } else {
    const age = completedYearsAt(input.dateNaissance, raceDate);
    if (age === null) {
      errors.dateNaissance = 'Date de naissance invalide.';
    } else if (age < MIN_AGE_AT_RACE || age > MAX_AGE_AT_RACE) {
      errors.dateNaissance = `Tu dois avoir entre ${MIN_AGE_AT_RACE} et ${MAX_AGE_AT_RACE} ans à la date de la course.`;
    }
  }

  if (!(TSHIRT_SIZES as readonly string[]).includes(input.tailleTshirt)) {
    errors.tailleTshirt = 'Choisis ta taille de t-shirt.';
  }

  return errors;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}
