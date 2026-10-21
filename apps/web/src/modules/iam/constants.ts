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
