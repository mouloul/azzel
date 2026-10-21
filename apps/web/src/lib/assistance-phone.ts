import { readEnv } from '@/modules/iam/env';

export const DEFAULT_ASSISTANCE_PHONE = '+213 555 010 200';

export function readAssistancePhone(): string {
  return readEnv('ASSISTANCE_PHONE') ?? DEFAULT_ASSISTANCE_PHONE;
}
