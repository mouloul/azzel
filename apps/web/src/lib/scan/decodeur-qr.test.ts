import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANTI_REBOND_MS,
  CADENCE_DETECTION_MS,
  ECHECS_DETECT_MAX,
  ErreurChargementDecodeur,
  classifierErreurCamera,
  creerAntiRebond,
  lancerDecodeur,
} from './decodeur-qr';

// Story 4.2 — décodeur unifié : BarcodeDetector en boucle si dispo, sinon
// fallback @zxing/browser (import dynamique) ; anti-rebond ~1 s (un QR qui
// reste dans le cadre ne mitraille pas le voyant) ; arreter() libère TOUT
// (boucle + tracks + reader). zxing et le détecteur natif sont mockés.

const zxingMock = vi.hoisted(() => {
  const etat: {
    callback: ((resultat: unknown) => void) | null;
  } = { callback: null };
  const commandes = { stop: vi.fn() };
  const decodeFromConstraints = vi.fn(
    async (
      _contraintes: unknown,
      _video: unknown,
      callback: (resultat: unknown) => void,
    ) => {
      etat.callback = callback;
      return commandes;
    },
  );
  return { etat, commandes, decodeFromConstraints };
});

// Fonction classique (pas une flèche) : instanciable via `new` dans le code
// de production comme la vraie classe BrowserMultiFormatReader.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn(function BrowserMultiFormatReader() {
    return { decodeFromConstraints: zxingMock.decodeFromConstraints };
  }),
}));

const PAYLOAD_A = 'azzel-e1:AAAAAAAAAAAAAAAAAAAAAA';
const PAYLOAD_B = 'azzel-e1:BBBBBBBBBBBBBBBBBBBBBB';

function fauxVideo(): HTMLVideoElement {
  return {
    srcObject: null,
    readyState: 2,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
  } as unknown as HTMLVideoElement;
}

function fauxStream() {
  const ecouteurs: Record<string, () => void> = {};
  const piste = {
    stop: vi.fn(),
    addEventListener: vi.fn((evenement: string, ecouteur: () => void) => {
      ecouteurs[evenement] = ecouteur;
    }),
    removeEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [piste] } as unknown as MediaStream;
  return { stream, piste, ecouteurs };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  zxingMock.etat.callback = null;
  zxingMock.decodeFromConstraints.mockClear();
  zxingMock.commandes.stop.mockClear();
});

describe('creerAntiRebond', () => {
  it('même payload dans la fenêtre : bloqué, fenêtre rafraîchie (présence continue)', () => {
    const accepte = creerAntiRebond(1000);
    expect(accepte(PAYLOAD_A)).toBe(true);
    expect(accepte(PAYLOAD_A)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(accepte(PAYLOAD_A)).toBe(false); // rafraîchi à t=500
  });

  it('~1 s d’absence : le même payload repasse', () => {
    const accepte = creerAntiRebond(1000);
    accepte(PAYLOAD_A);
    accepte(PAYLOAD_A);
    vi.advanceTimersByTime(1001); // aucune détection pendant la fenêtre
    expect(accepte(PAYLOAD_A)).toBe(true);
  });

  it('recul d’horloge (NTP) : l’état est réinitialisé, le même payload repasse', () => {
    const accepte = creerAntiRebond(1000);
    expect(accepte(PAYLOAD_A)).toBe(true);
    expect(accepte(PAYLOAD_A)).toBe(false);
    vi.setSystemTime(new Date(Date.now() - 5000)); // l’horloge recule de 5 s
    expect(accepte(PAYLOAD_A)).toBe(true);
  });

  it('payload différent : passe immédiatement', () => {
    const accepte = creerAntiRebond();
    expect(accepte(PAYLOAD_A)).toBe(true);
    expect(accepte(PAYLOAD_B)).toBe(true);
  });
});

describe('lancerDecodeur — chemin natif BarcodeDetector', () => {
  it('stream attaché à la vidéo, boucle de détection, payload décodé UNE fois en rafale', async () => {
    const video = fauxVideo();
    const { stream, piste } = fauxStream();
    const surPayload = vi.fn();
    const detect = vi.fn(async () => [{ rawValue: PAYLOAD_A }]);

    await lancerDecodeur(video, surPayload, {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
    });

    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalled();

    // Le QR reste dans le cadre : détections toutes les 250 ms, UN seul
    // déclenchement grâce à l'anti-rebond (fenêtre rafraîchie).
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS);
    expect(surPayload).toHaveBeenCalledTimes(1);
    expect(surPayload).toHaveBeenCalledWith(PAYLOAD_A);
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * 4);
    expect(surPayload).toHaveBeenCalledTimes(1);

    // Autre coureur : passe aussitôt.
    detect.mockResolvedValue([{ rawValue: PAYLOAD_B }]);
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS);
    expect(surPayload).toHaveBeenCalledTimes(2);

    expect(piste.stop).not.toHaveBeenCalled();
  });

  it('après ~1 s d’absence, le même payload re-déclenche (c’est alors un doublon de session)', async () => {
    const video = fauxVideo();
    const { stream } = fauxStream();
    const surPayload = vi.fn();
    const detect = vi.fn(async () => [{ rawValue: PAYLOAD_A }]);

    await lancerDecodeur(video, surPayload, {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
    });
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS);
    expect(surPayload).toHaveBeenCalledTimes(1);

    detect.mockResolvedValue([]); // QR sorti du cadre
    await vi.advanceTimersByTimeAsync(ANTI_REBOND_MS + CADENCE_DETECTION_MS);
    detect.mockResolvedValue([{ rawValue: PAYLOAD_A }]); // et il revient
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS);
    expect(surPayload).toHaveBeenCalledTimes(2);
  });

  it('arreter() : boucle stoppée, tracks stoppés, srcObject détaché', async () => {
    const video = fauxVideo();
    const { stream, piste } = fauxStream();
    const detect = vi.fn(async () => [] as { rawValue: string }[]);

    const decodeur = await lancerDecodeur(video, vi.fn(), {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
    });

    decodeur.arreter();
    expect(piste.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();

    detect.mockClear();
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * 3);
    expect(detect).not.toHaveBeenCalled();
  });

  it('échec getUserMedia : l’erreur caméra remonte BRUTE pour classification', async () => {
    const video = fauxVideo();
    const refus = new DOMException('Permission denied', 'NotAllowedError');
    await expect(
      lancerDecodeur(video, vi.fn(), {
        creerDetector: () => ({ detect: vi.fn(async () => []) }),
        getUserMedia: async () => {
          throw refus;
        },
      }),
    ).rejects.toBe(refus);
  });

  it('décodeur muet : ~20 échecs CONSÉCUTIFS de detect → surErreur appelé, boucle stoppée, caméra libérée', async () => {
    const video = fauxVideo();
    const { stream, piste } = fauxStream();
    const surErreur = vi.fn();
    const detect = vi.fn(async () => {
      throw new DOMException('ImageCapture hors service', 'InvalidStateError');
    });

    await lancerDecodeur(video, vi.fn(), {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
      surErreur,
    });

    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * (ECHECS_DETECT_MAX + 2));
    expect(surErreur).toHaveBeenCalledTimes(1);
    expect(piste.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();

    detect.mockClear();
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * 3);
    expect(detect).not.toHaveBeenCalled(); // la boucle est bien arrêtée
  });

  it('décodeur muet : un succès remet le compteur d’échecs consécutifs à zéro', async () => {
    const { stream } = fauxStream();
    const surErreur = vi.fn();
    let detections = 0;
    const detect = vi.fn(async () => {
      detections += 1;
      if (detections % 5 === 0) {
        return [{ rawValue: PAYLOAD_A }]; // succès régulier
      }
      throw new DOMException('frame perdue', 'InvalidStateError');
    });

    await lancerDecodeur(fauxVideo(), vi.fn(), {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
      surErreur,
    });

    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * (ECHECS_DETECT_MAX * 2 + 5));
    expect(surErreur).not.toHaveBeenCalled(); // jamais 20 échecs D’AFFILÉE
  });

  it('track ‘ended’ (caméra coupée/révoquée en cours de scan) → surErreur appelé, tout libéré', async () => {
    const video = fauxVideo();
    const { stream, piste, ecouteurs } = fauxStream();
    const surPayload = vi.fn();
    const surErreur = vi.fn();
    const detect = vi.fn(async () => [{ rawValue: PAYLOAD_A }]);

    await lancerDecodeur(video, surPayload, {
      creerDetector: () => ({ detect }),
      getUserMedia: async () => stream,
      surErreur,
    });
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS);
    expect(surPayload).toHaveBeenCalledTimes(1);

    ecouteurs['ended']?.(); // le système coupe la caméra
    expect(surErreur).toHaveBeenCalledTimes(1);
    expect(piste.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    detect.mockClear();
    await vi.advanceTimersByTimeAsync(CADENCE_DETECTION_MS * 3);
    expect(detect).not.toHaveBeenCalled();
    expect(piste.removeEventListener).toHaveBeenCalled();
  });
});

describe('lancerDecodeur — fallback @zxing/browser (sans BarcodeDetector)', () => {
  it('sans détecteur natif : zxing prend le relais (contrainte caméra arrière, même vidéo)', async () => {
    const video = fauxVideo();
    const surPayload = vi.fn();

    const decodeur = await lancerDecodeur(video, surPayload);

    expect(zxingMock.decodeFromConstraints).toHaveBeenCalledTimes(1);
    const [contraintes, videoPassee] = zxingMock.decodeFromConstraints.mock.calls[0]!;
    expect(contraintes).toEqual({ audio: false, video: { facingMode: 'environment' } });
    expect(videoPassee).toBe(video);

    // Le callback zxing alimente le même chemin anti-rebond.
    const callback = zxingMock.etat.callback;
    expect(callback).toBeTypeOf('function');
    callback?.({ getText: () => PAYLOAD_A });
    callback?.({ getText: () => PAYLOAD_A });
    callback?.(null);
    expect(surPayload).toHaveBeenCalledTimes(1);
    expect(surPayload).toHaveBeenCalledWith(PAYLOAD_A);

    decodeur.arreter();
    expect(zxingMock.commandes.stop).toHaveBeenCalledTimes(1);
  });

  it('refus caméra côté zxing : l’erreur remonte brute (écran permission)', async () => {
    zxingMock.decodeFromConstraints.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );
    await expect(lancerDecodeur(fauxVideo(), vi.fn())).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
  });

  it('prefererDetector: false force le fallback même avec un détecteur dispo', async () => {
    await lancerDecodeur(fauxVideo(), vi.fn(), {
      prefererDetector: false,
      creerDetector: () => ({ detect: vi.fn(async () => []) }),
    });
    expect(zxingMock.decodeFromConstraints).toHaveBeenCalledTimes(1);
  });

  it('import du module impossible (réseau coupé) : ErreurChargementDecodeur, pas d’erreur brute', async () => {
    // doMock (non hisé) : s’applique aux imports suivants — le module de
    // production est rechargé pour que son import dynamique échoue.
    vi.doMock('@zxing/browser', () => {
      throw new TypeError('fetch failed');
    });
    vi.resetModules();
    try {
      // Le module est rechargé : sa classe ErreurChargementDecodeur est une
      // nouvelle identité — on compare donc contre CELLE du module rechargé.
      const recharge = await import('./decodeur-qr');
      await expect(recharge.lancerDecodeur(fauxVideo(), vi.fn())).rejects.toBeInstanceOf(
        recharge.ErreurChargementDecodeur,
      );
    } finally {
      vi.doUnmock('@zxing/browser');
      vi.resetModules();
    }
  });
});

describe('classifierErreurCamera — vers l’écran dédié UX-DR-18', () => {
  it('NotAllowedError / PermissionDeniedError / SecurityError → permission', () => {
    expect(classifierErreurCamera(new DOMException('x', 'NotAllowedError'))).toBe('permission');
    expect(classifierErreurCamera(new DOMException('x', 'PermissionDeniedError'))).toBe(
      'permission',
    );
    expect(classifierErreurCamera(new DOMException('x', 'SecurityError'))).toBe('permission');
  });

  it('NotFoundError / OverconstrainedError / erreur quelconque → indisponible', () => {
    expect(classifierErreurCamera(new DOMException('x', 'NotFoundError'))).toBe('indisponible');
    expect(classifierErreurCamera(new DOMException('x', 'OverconstrainedError'))).toBe(
      'indisponible',
    );
    expect(classifierErreurCamera(new Error('boom'))).toBe('indisponible');
  });

  it('ErreurChargementDecodeur → module', () => {
    expect(classifierErreurCamera(new ErreurChargementDecodeur())).toBe('module');
  });
});
