// Story 4.2 — décodeur QR unifié du scanner (NFR-1) : BarcodeDetector natif
// en boucle si disponible, SINON @zxing/browser TOUJOURS actif (iOS Safari) —
// importé dynamiquement pour rester hors bundle initial (~200 Ko, budget
// accueil intact). Le décodeur POSSEDE le flux caméra (arrière imposée) :
// arreter() libère stream + boucle + reader, sans fuite. Anti-rebond ~1 s :
// un QR qui reste dans le cadre ne déclenche pas en rafale — distinct du
// doublon de session (etats-scan).

export const ANTI_REBOND_MS = 1000;
export const CADENCE_DETECTION_MS = 250;
/** Garde-fou d'attente « video prête » : jamais bloqué si l'événement ne vient pas. */
export const ATTENTE_VIDEO_MAX_MS = 3000;
/**
 * Décodeur muet (revue) : detect() peut se mettre à échouer en boucle sans
 * jamais lever (caméra coupée, contexte perdu) — au-delà de ce nombre
 * d'échecs CONSÉCUTIFS, la boucle s'arrête et surErreur est appelé.
 */
export const ECHECS_DETECT_MAX = 20;

export interface CodeDetecteLike {
  rawValue: string;
}

export interface BarcodeDetectorLike {
  detect(source: unknown): Promise<CodeDetecteLike[]>;
}

/** Commandes du lecteur zxing (IScannerControls côté lib). */
export interface CommandesZxingLike {
  stop(): void;
}

export interface Decodeur {
  /** Libère TOUT : boucle de détection, stream caméra (tracks stoppés), reader. */
  arreter(): void;
}

export interface OptionsDecodeur {
  /** false → force le fallback zxing même si BarcodeDetector existe (diagnostic). */
  prefererDetector?: boolean;
  /** Fabrique du détecteur natif (tests) ; par défaut window.BarcodeDetector. */
  creerDetector?: () => BarcodeDetectorLike | null;
  /** Fenêtre anti-rebond en ms (défaut ~1 s). */
  antiRebondMs?: number;
  /** Acquisition du stream (tests) ; par défaut navigator.mediaDevices. */
  getUserMedia?: (contraintes: MediaStreamConstraints) => Promise<MediaStream>;
  /** Lancement zxing (tests) ; par défaut import dynamique @zxing/browser. */
  lancerZxing?: (
    video: HTMLVideoElement,
    surPayload: (payload: string) => void,
  ) => Promise<CommandesZxingLike>;
  /**
   * Décodeur muet (revue) : appelé quand la boucle native doit s'arrêter
   * seule — ~20 échecs consécutifs de detect() OU track 'ended' (caméra
   * coupée/révoquée en cours de scan). Caméra libérée avant l'appel.
   */
  surErreur?: () => void;
}

/**
 * Échec du chargement du module de décodage (import dynamique réseau coupé) :
 * écran dédié + assistance — jamais un crash du scanner.
 */
export class ErreurChargementDecodeur extends Error {
  constructor(cause?: unknown) {
    super('Le module de lecture des QR n’a pas pu être chargé.');
    this.name = 'ErreurChargementDecodeur';
    this.cause = cause;
  }
}

/** Variante d'échec caméra pour l'écran dédié UX-DR-18. */
export type VarianteErreurCamera = 'permission' | 'indisponible' | 'module';

/**
 * Classe une erreur de lancement : refus de permission → « permission »,
 * caméra absente/occupée/contrainte impossible → « indisponible », échec
 * d'import du module → « module ». Les DOMException des navigateurs portent
 * des noms historiques variés : on couvre les alias connus.
 */
export function classifierErreurCamera(erreur: unknown): VarianteErreurCamera {
  if (erreur instanceof ErreurChargementDecodeur) {
    return 'module';
  }
  const nom =
    typeof erreur === 'object' && erreur !== null && 'name' in erreur
      ? String((erreur as { name: unknown }).name)
      : '';
  if (nom === 'NotAllowedError' || nom === 'PermissionDeniedError' || nom === 'SecurityError') {
    return 'permission';
  }
  return 'indisponible';
}

/**
 * Anti-rebond pur : même payload dans la fenêtre → ignoré, et la fenêtre se
 * RAFRAÎCHIT à chaque détection bloquée (un QR qui reste dans le cadre ne
 * re-déclenche jamais) ; il faut ~1 s d'ABSENCE pour qu'un re-scan du même
 * payload passe — distinct du doublon de session (etats-scan). Recul
 * d'horloge (NTP) : l'état n'est plus fiable → réinitialisé, le payload
 * repasse au lieu de rester bloqué jusqu'à la fin des temps.
 */
export function creerAntiRebond(delaiMs: number = ANTI_REBOND_MS): (payload: string) => boolean {
  let dernierPayload: string | null = null;
  let dernierTemps = 0;
  return (payload: string) => {
    const maintenant = Date.now();
    if (maintenant < dernierTemps) {
      dernierPayload = null;
      dernierTemps = 0;
    }
    if (payload === dernierPayload && maintenant - dernierTemps < delaiMs) {
      dernierTemps = maintenant;
      return false;
    }
    dernierPayload = payload;
    dernierTemps = maintenant;
    return true;
  };
}

function creerDetectorNatif(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }
  const candidat = (
    window as unknown as {
      BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (candidat === undefined) {
    return null;
  }
  try {
    return new candidat({ formats: ['qr_code'] });
  } catch {
    // Formats non supportés : fallback zxing.
    return null;
  }
}

async function getUserMediaNatif(contraintes: MediaStreamConstraints): Promise<MediaStream> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.mediaDevices !== 'object' ||
    navigator.mediaDevices === null ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    // Aucune API caméra : même écran que « caméra indisponible ».
    throw new DOMException('Aucune caméra disponible', 'NotFoundError');
  }
  return navigator.mediaDevices.getUserMedia(contraintes);
}

async function lancerZxingParDefaut(
  video: HTMLVideoElement,
  surPayload: (payload: string) => void,
): Promise<CommandesZxingLike> {
  let module: typeof import('@zxing/browser');
  try {
    module = await import('@zxing/browser');
  } catch (cause) {
    throw new ErreurChargementDecodeur(cause);
  }
  const reader = new module.BrowserMultiFormatReader();
  // zxing possède le stream (facingMode environment) et sa boucle interne de
  // décodage continu ; les erreurs caméra (NotAllowed/NotFound) remontent
  // telles quelles pour classification.
  return reader.decodeFromConstraints(
    { audio: false, video: { facingMode: 'environment' } },
    video,
    (resultat) => {
      if (resultat !== null && resultat !== undefined) {
        surPayload(resultat.getText());
      }
    },
  );
}

function attendreVideoPrete(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const borne = setTimeout(() => {
      video.removeEventListener('loadedmetadata', surPrete);
      resolve();
    }, ATTENTE_VIDEO_MAX_MS);
    const surPrete = () => {
      clearTimeout(borne);
      resolve();
    };
    video.addEventListener('loadedmetadata', surPrete, { once: true });
  });
}

/**
 * Démarre la caméra arrière plein écran et le décodage continu. Résout quand
 * le stream tourne et la boucle est lancée ; REJETTE avec l'erreur caméra
 * brute (NotAllowedError → écran permission, NotFoundError → indisponible)
 * ou ErreurChargementDecodeur (import zxing impossible).
 */
export async function lancerDecodeur(
  video: HTMLVideoElement,
  surPayload: (payload: string) => void,
  options: OptionsDecodeur = {},
): Promise<Decodeur> {
  const accepte = creerAntiRebond(options.antiRebondMs ?? ANTI_REBOND_MS);
  const traiterPayload = (payload: string): void => {
    if (typeof payload === 'string' && payload.length > 0 && accepte(payload)) {
      surPayload(payload);
    }
  };

  const creerDetector = options.creerDetector ?? creerDetectorNatif;
  const detector = options.prefererDetector === false ? null : safe(creerDetector);

  // --- Chemin natif : BarcodeDetector en boucle sur NOTRE stream.
  if (detector !== null) {
    const getUserMedia = options.getUserMedia ?? getUserMediaNatif;
    const stream = await getUserMedia({ audio: false, video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.play().catch(() => {
      // Autoplay refusé : la video est muted+playsInline, le décodage
      // fonctionne dès que le navigateur rend la frame.
    });
    await attendreVideoPrete(video);

    let occupe = false;
    let arrete = false;
    let echecsConsecutifs = 0;
    let boucle: ReturnType<typeof setInterval> | undefined;

    const liberer = () => {
      if (arrete) {
        return;
      }
      arrete = true;
      if (boucle !== undefined) {
        clearInterval(boucle);
      }
      for (const piste of stream.getTracks()) {
        if (typeof piste.removeEventListener === 'function') {
          piste.removeEventListener('ended', surTrackFinie);
        }
        piste.stop();
      }
      video.srcObject = null;
    };

    // Track 'ended' (caméra coupée/révoquée en cours de scan) : même signal
    // que les échecs consécutifs — boucle arrêtée, caméra libérée, surErreur.
    const surTrackFinie = () => {
      liberer();
      options.surErreur?.();
    };

    for (const piste of stream.getTracks()) {
      if (typeof piste.addEventListener === 'function') {
        piste.addEventListener('ended', surTrackFinie);
      }
    }

    boucle = setInterval(() => {
      if (occupe || arrete) {
        return;
      }
      occupe = true;
      detector
        .detect(video)
        .then((codes) => {
          echecsConsecutifs = 0;
          for (const code of codes) {
            traiterPayload(code.rawValue);
          }
        })
        .catch(() => {
          // Frame pas prête : la prochaine itération réessaie — mais des
          // échecs CONSÉCUTIFS bornés signalent un décodeur muet.
          echecsConsecutifs += 1;
          if (echecsConsecutifs >= ECHECS_DETECT_MAX) {
            liberer();
            options.surErreur?.();
          }
        })
        .finally(() => {
          occupe = false;
        });
    }, CADENCE_DETECTION_MS);

    return { arreter: liberer };
  }

  // --- Fallback iOS Safari : @zxing/browser (import dynamique).
  const lancerZxing = options.lancerZxing ?? lancerZxingParDefaut;
  const commandes = await lancerZxing(video, traiterPayload);
  return {
    arreter() {
      commandes.stop();
    },
  };
}

function safe<T>(operation: () => T): T | null {
  try {
    return operation();
  } catch {
    return null;
  }
}
