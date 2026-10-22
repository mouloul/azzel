import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postInvitation } from './route';

import {
  InvitationExpiredError,
  InvitationInvalidError,
  PasswordInvalidError,
} from '@/modules/iam/errors';

const iamServiceMock = vi.hoisted(() => ({
  activerVolontaire: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const BASE = 'http://localhost:3000';

const JETON = 'j'.repeat(64);

function requestWithBody(raw: string): NextRequest {
  return new NextRequest(BASE + '/api/iam/invitation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
    duplex: 'half',
  });
}

beforeEach(() => {
  iamServiceMock.activerVolontaire.mockReset();
});

describe('POST /api/iam/invitation — activation volontaire (publique)', () => {
  it('jeton valide : 200, cookie de session posé (httpOnly, path /)', async () => {
    iamServiceMock.activerVolontaire.mockResolvedValue({
      token: 'jeton-session-brut',
      email: 'kahina@exemple.dz',
    });
    const response = await postInvitation(
      requestWithBody(JSON.stringify({ jeton: JETON, motDePasse: 'motdepasse-2026' })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, email: 'kahina@exemple.dz' });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('azzel_session=jeton-session-brut');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(iamServiceMock.activerVolontaire).toHaveBeenCalledWith(JETON, 'motdepasse-2026');
  });

  it('jeton inconnu/déjà utilisé : 400 iam.invitation_invalid, aucune session', async () => {
    iamServiceMock.activerVolontaire.mockRejectedValue(new InvitationInvalidError());
    const response = await postInvitation(
      requestWithBody(JSON.stringify({ jeton: JETON, motDePasse: 'motdepasse-2026' })),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.invitation_invalid');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('jeton expiré : 410 iam.invitation_expired', async () => {
    iamServiceMock.activerVolontaire.mockRejectedValue(new InvitationExpiredError());
    const response = await postInvitation(
      requestWithBody(JSON.stringify({ jeton: JETON, motDePasse: 'motdepasse-2026' })),
    );
    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.invitation_expired');
  });

  it('mot de passe hors bornes : 400 iam.password_invalid', async () => {
    iamServiceMock.activerVolontaire.mockRejectedValue(new PasswordInvalidError());
    const response = await postInvitation(
      requestWithBody(JSON.stringify({ jeton: JETON, motDePasse: 'court' })),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.password_invalid');
  });

  it('corps illisible (types non-chaîne) : 400 sans appel au service', async () => {
    const response = await postInvitation(requestWithBody('pas du json'));
    expect(response.status).toBe(400);
    expect(iamServiceMock.activerVolontaire).not.toHaveBeenCalled();
  });
});
