// Story 6.1 — configuration de l'app coureurs. La base URL de l'API vient de
// EXPO_PUBLIC_API_URL (inlinée au build par Expo, jamais de secret ici : ces
// valeurs vivent dans le binaire). Le téléphone d'assistance a le même défaut
// que le web (ASSISTANCE_PHONE côté serveur).

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const DEFAULT_ASSISTANCE_PHONE = '+213 555 010 200';

export const ASSISTANCE_PHONE: string =
  process.env.EXPO_PUBLIC_ASSISTANCE_PHONE ?? DEFAULT_ASSISTANCE_PHONE;
