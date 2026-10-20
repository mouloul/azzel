export const ERROR_ENVELOPE_VERSION = 1 as const;

export type ErrorEnvelopeVersion = typeof ERROR_ENVELOPE_VERSION;

export interface ErrorEnvelopePayload {
  code: string;
  message: string;
  action: string;
}

export interface ErrorEnvelopeV1 {
  version: ErrorEnvelopeVersion;
  error: ErrorEnvelopePayload;
}

export type ErrorEnvelope = ErrorEnvelopeV1;

export interface ErrorEnvelopeInput {
  code: string;
  message: string;
  action: string;
}

export function createErrorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelopeV1 {
  return {
    version: ERROR_ENVELOPE_VERSION,
    error: { ...input },
  };
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelopeV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { version?: unknown; error?: unknown };
  if (candidate.version !== ERROR_ENVELOPE_VERSION) {
    return false;
  }
  if (typeof candidate.error !== 'object' || candidate.error === null) {
    return false;
  }
  const payload = candidate.error as Record<string, unknown>;
  return (
    typeof payload.code === 'string' &&
    typeof payload.message === 'string' &&
    typeof payload.action === 'string'
  );
}
