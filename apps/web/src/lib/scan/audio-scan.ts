import type { EtatScan } from './etats-scan';

// Story 4.2 — bips WebAudio et vibration du scanner (UX-DR-6) : l'audio et la
// vibration ne partent QU'APRÈS le premier geste utilisateur (« Démarrer le
// scan ») — jamais avant. Trois mélodies DISTINCTES (succès/doublon/inconnu),
// vérifiables par leurs constantes ; la vibration est le 3ᵉ canal (motifs
// différents par état). Tout est gardé : SSR, navigateur sans AudioContext ou
// sans navigator.vibrate → silencieux, jamais d'exception.

export interface NoteBip {
  /** Fréquence en Hz. */
  frequence: number;
  /** Durée de la note en ms. */
  dureeMs: number;
}

// Mélodies : timbre ET rythme distincts par état (jamais la couleur seule).
// Succès : tierce ascendante brève (confirmation). Doublon : même note répétée
// (« déjà vu »). Inconnu : descente grave (« problème »).
export const MELODIE_SUCCES: readonly [NoteBip, NoteBip] = [
  { frequence: 880.0, dureeMs: 90 },
  { frequence: 1318.5, dureeMs: 150 },
];

export const MELODIE_DOUBLON: readonly [NoteBip, NoteBip] = [
  { frequence: 622.3, dureeMs: 110 },
  { frequence: 622.3, dureeMs: 210 },
];

export const MELODIE_INCONNU: readonly [NoteBip, NoteBip] = [
  { frequence: 329.6, dureeMs: 160 },
  { frequence: 233.1, dureeMs: 290 },
];

// Vibration — motifs distincts par état (3ᵉ canal d'information).
export const VIBRATION_SUCCES: readonly number[] = [90] as const;
export const VIBRATION_DOUBLON: readonly number[] = [90, 70, 90] as const;
export const VIBRATION_INCONNU: readonly number[] = [200, 90, 200] as const;

// --- Types structurels minimaux : le vrai AudioContext y répond, les fakes
// --- des tests aussi (aucun cast dans les composants).

interface AudioParamLike {
  value: number;
  setValueAtTime(valeur: number, temps: number): void;
  exponentialRampToValueAtTime(valeur: number, temps: number): void;
}

interface NoeudAudioLike {
  connect(cible: unknown): unknown;
  disconnect(): void;
}

interface OscillateurLike extends NoeudAudioLike {
  type: string;
  frequency: AudioParamLike;
  start(quand?: number): void;
  stop(quand?: number): void;
}

interface GainLike extends NoeudAudioLike {
  gain: AudioParamLike;
}

export interface ContexteAudioLike {
  currentTime: number;
  /** 'suspended' après une interruption iOS : les bips sautent, resume retenté. */
  state?: string;
  resume(): Promise<void>;
  destination: unknown;
  createOscillator(): OscillateurLike;
  createGain(): GainLike;
}

export interface AudioScanDeps {
  /** Fabrique du contexte (tests) ; par défaut window.AudioContext si présent. */
  creerContexte?: () => ContexteAudioLike | null;
  /** Vibration native (tests) ; par défaut navigator.vibrate si présent. */
  vibrerNatif?: (motif: number[]) => boolean;
}

export interface AudioScan {
  /** Premier geste utilisateur : crée/reprend le contexte, débloque les bips. */
  debloquer(): void;
  bipSucces(): void;
  bipDoublon(): void;
  bipInconnu(): void;
  /** 3ᵉ canal : motif distinct par état, silencieux si l'API est absente. */
  vibrer(etat: EtatScan): void;
}

const VOLUME_BIP = 0.14;
const ATTAQUE_S = 0.005;
const RELEASE_S = 0.02;

function creerContexteNatif(): ContexteAudioLike | null {
  if (typeof window === 'undefined') {
    return null;
  }
  // AudioContext d'abord, sinon webkitAudioContext (vieux iOS Safari —
  // précisément les cibles du fallback zxing).
  const candidat = window as unknown as {
    AudioContext?: new () => ContexteAudioLike;
    webkitAudioContext?: new () => ContexteAudioLike;
  };
  const constructeur = candidat.AudioContext ?? candidat.webkitAudioContext;
  return constructeur === undefined ? null : new constructeur();
}

function vibrerNatifParDefaut(motif: number[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  return navigator.vibrate(motif);
}

/**
 * Fabrique le module audio du scanner. Paresseux et total : sans geste
 * (debloquer), chaque bip est silencieux ; sans AudioContext ni navigator
 * (SSR, vieux navigateur), rien ne casse — le voyant et le texte restent les
 * canaux principaux.
 */
export function creerAudioScan(deps: AudioScanDeps = {}): AudioScan {
  const creerContexte = deps.creerContexte ?? creerContexteNatif;
  const vibrerNatif = deps.vibrerNatif ?? vibrerNatifParDefaut;

  let contexte: ContexteAudioLike | null = null;
  let debloque = false;
  let tentativeCreation = false;

  const jouer = (melodie: readonly NoteBip[]): void => {
    if (!debloque || contexte === null) {
      return;
    }
    // Contexte suspendu (interruption iOS) : currentTime est figé — planifier
    // empilerait des bips inaudibles. On saute et on retente un resume ; le
    // prochain bip (ou debloquer) rejouera dès le contexte revenu.
    if (contexte.state === 'suspended') {
      contexte.resume().catch(() => {
        // Toujours suspendu : le prochain geste réessaiera.
      });
      return;
    }
    let t = contexte.currentTime;
    for (const note of melodie) {
      const oscillateur = contexte.createOscillator();
      const gain = contexte.createGain();
      oscillateur.type = 'sine';
      oscillateur.frequency.value = note.frequence;
      const debut = t;
      const fin = t + note.dureeMs / 1000;
      gain.gain.setValueAtTime(0.0001, debut);
      gain.gain.exponentialRampToValueAtTime(VOLUME_BIP, debut + ATTAQUE_S);
      gain.gain.exponentialRampToValueAtTime(0.0001, fin + RELEASE_S);
      oscillateur.connect(gain);
      gain.connect(contexte.destination);
      oscillateur.start(debut);
      oscillateur.stop(fin + RELEASE_S);
      t = fin;
    }
  };

  return {
    debloquer() {
      debloque = true;
      if (!tentativeCreation) {
        tentativeCreation = true;
        contexte = creerContexte();
      }
      if (contexte !== null) {
        contexte.resume().catch(() => {
          // Contexte suspendu par le navigateur : le prochain geste réessaiera.
        });
      }
    },
    bipSucces() {
      jouer(MELODIE_SUCCES);
    },
    bipDoublon() {
      jouer(MELODIE_DOUBLON);
    },
    bipInconnu() {
      jouer(MELODIE_INCONNU);
    },
    vibrer(etat) {
      // Contrat « rien avant le geste » : la vibration est un canal du bip,
      // elle part aux MÊMES conditions que lui.
      if (!debloque) {
        return;
      }
      const motif =
        etat === 'succès' ? VIBRATION_SUCCES : etat === 'doublon' ? VIBRATION_DOUBLON : VIBRATION_INCONNU;
      try {
        vibrerNatif([...motif]);
      } catch {
        // Vibration refusée (paramètre système) : canal secondaire, on ignore.
      }
    },
  };
}
