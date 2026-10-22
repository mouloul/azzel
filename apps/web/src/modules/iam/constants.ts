export const DEFAULT_ORGANISATION_SLUG = 'ait-aissi';

export const CODE_TTL_MS = 10 * 60 * 1000;

export const CODE_TTL_MINUTES = 10;

export const MAX_CODE_ATTEMPTS = 5;

export const CODE_REQUEST_WINDOW_MS = 10 * 60 * 1000;

export const MAX_CODE_REQUESTS_PER_WINDOW = 3;

export const CODE_REQUEST_GLOBAL_WINDOW_MS = 60 * 60 * 1000;

export const MAX_CODE_REQUESTS_PER_HOUR = 1000;

export const RESEND_COOLDOWN_SEC = 60;

export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export const SESSION_COOKIE_NAME = 'azzel_session';

export const ACCOUNT_ROLES = ['coureur', 'organisateur'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ROLE_ORGANISATEUR: AccountRole = 'organisateur';

export const ADMIN_EMAILS_ENV_NAME = 'AZZEL_ADMIN_EMAILS';

// Correctif sécurité story 1.2 — quota par adresse IP sur la demande de code.
// Le compteur horaire global (MAX_CODE_REQUESTS_PER_HOUR) est un garde-fou de
// volumétrie par organisation ; il ne protège pas d'un déni de service monté
// avec des adresses email différentes. Le quota par IP, lui, borne l'auteur.
export const CODE_REQUEST_IP_WINDOW_MS = 60 * 60 * 1000;

export const MAX_CODE_REQUESTS_PER_IP = 20;

export const IP_HASH_SALT_ENV_NAME = 'AZZEL_IP_HASH_SALT';

// Rôle Postgres applicatif (0008) : seule connexion soumise au RLS (le
// propriétaire a BYPASSRLS). En production, servir avec un autre rôle est refusé.
export const APP_DB_ROLE = 'azzel_app';

export const APP_PASSWORD_ENV_NAME = 'AZZEL_APP_PASSWORD';

// Mot de passe de repli du rôle applicatif : DÉVELOPPEMENT UNIQUEMENT.
export const DEV_APP_PASSWORD_FALLBACK = 'azzel';
