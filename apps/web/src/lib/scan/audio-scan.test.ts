import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MELODIE_DOUBLON,
  MELODIE_INCONNU,
  MELODIE_SUCCES,
  VIBRATION_DOUBLON,
  VIBRATION_INCONNU,
  VIBRATION_SUCCES,
  creerAudioScan,
  type ContexteAudioLike,
} from './audio-scan';

// Story 4.2 — module audio du scanner : trois mélodies DISTINCTES (testées
// par leurs constantes ET par les oscillateurs réellement planifiés), rien
// avant le geste utilisateur (debloquer), gardes SSR/absence d'API, vibration
// distincte par état.

interface OscillateurCapture {
  frequence: number;
  debut: number;
  fin: number;
}

function contexteFictif() {
  const oscillateurs: OscillateurCapture[] = [];
  let appeles = 0;

  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });

  const contexte: ContexteAudioLike = {
    currentTime: 0,
    resume: vi.fn(async () => {
      appeles += 1;
    }),
    destination: { identifiant: 'haut-parleurs' },
    createOscillator() {
      const frequency = param();
      let debut = 0;
      const oscillateur = {
        type: 'sine',
        frequency,
        connect: vi.fn(() => gain),
        start: vi.fn((quand?: number) => {
          debut = quand ?? 0;
        }),
        stop: vi.fn((quand?: number) => {
          oscillateurs.push({ frequence: frequency.value, debut, fin: quand ?? 0 });
        }),
        disconnect: vi.fn(),
      };
      const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      return oscillateur;
    },
    createGain() {
      return { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
    },
  };
  return { contexte, oscillateurs, resumeAppels: () => appeles };
}

describe('mélodies — constantes distinctes (fréquences ET durées)', () => {
  it('les trois mélodies diffèrent deux à deux', () => {
    const signatures = [MELODIE_SUCCES, MELODIE_DOUBLON, MELODIE_INCONNU].map((melodie) =>
      JSON.stringify(melodie),
    );
    expect(new Set(signatures).size).toBe(3);
  });

  it('succès : ascendante ; doublon : répétition ; inconnu : descente grave', () => {
    expect(MELODIE_SUCCES[1].frequence).toBeGreaterThan(MELODIE_SUCCES[0].frequence);
    expect(MELODIE_DOUBLON[0].frequence).toBe(MELODIE_DOUBLON[1].frequence);
    expect(MELODIE_INCONNU[1].frequence).toBeLessThan(MELODIE_INCONNU[0].frequence);
    expect(MELODIE_INCONNU[0].frequence).toBeLessThan(MELODIE_DOUBLON[0].frequence);
  });

  it('les trois motifs de vibration diffèrent deux à deux', () => {
    const signatures = [VIBRATION_SUCCES, VIBRATION_DOUBLON, VIBRATION_INCONNU].map((motif) =>
      JSON.stringify(motif),
    );
    expect(new Set(signatures).size).toBe(3);
  });
});

describe('creerAudioScan — geste et gardes', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('AUCUN bip avant le geste utilisateur, même avec contexte', () => {
    const { contexte, oscillateurs } = contexteFictif();
    const audio = creerAudioScan({ creerContexte: () => contexte });
    audio.bipSucces();
    audio.bipDoublon();
    audio.bipInconnu();
    expect(oscillateurs).toHaveLength(0);
  });

  it('AUCUNE vibration avant le geste utilisateur (contrat « rien avant le geste »)', () => {
    const motifs: number[][] = [];
    const audio = creerAudioScan({
      vibrerNatif: (motif) => {
        motifs.push(motif);
        return true;
      },
    });
    audio.vibrer('succès');
    expect(motifs).toHaveLength(0);
    audio.debloquer();
    audio.vibrer('succès');
    expect(motifs).toEqual([[90]]);
  });

  it('debloquer : contexte créé une fois, resume appelé, bips planifiés ensuite', () => {
    const { contexte, oscillateurs } = contexteFictif();
    const audio = creerAudioScan({ creerContexte: () => contexte });
    audio.debloquer();
    audio.bipSucces();
    expect(oscillateurs).toHaveLength(MELODIE_SUCCES.length);
    expect(oscillateurs.map((note) => note.frequence)).toEqual(
      MELODIE_SUCCES.map((note) => note.frequence),
    );
  });

  it('chaque bip porte SA mélodie (fréquences et durées réellement planifiées)', () => {
    const { contexte, oscillateurs } = contexteFictif();
    const audio = creerAudioScan({ creerContexte: () => contexte });
    audio.debloquer();

    audio.bipSucces();
    audio.bipDoublon();
    audio.bipInconnu();

    const attendu = [...MELODIE_SUCCES, ...MELODIE_DOUBLON, ...MELODIE_INCONNU];
    expect(oscillateurs.map((note) => note.frequence)).toEqual(
      attendu.map((note) => note.frequence),
    );
    // Les durées se retrouvent dans les écarts fin-début de chaque note
    // (release de 20 ms ajouté par l'enveloppe).
    expect(
      oscillateurs.every((note) => note.fin > note.debut),
    ).toBe(true);
  });

  it('sans contexte possible (SSR/vieux navigateur) : debloquer et bips silencieux', () => {
    const audio = creerAudioScan({ creerContexte: () => null });
    expect(() => {
      audio.debloquer();
      audio.bipSucces();
      audio.vibrer('inconnu');
    }).not.toThrow();
  });

  it('défauts en environnement serveur (window/navigator absents) : aucun crash', () => {
    const audio = creerAudioScan();
    audio.debloquer();
    audio.bipSucces();
    audio.vibrer('succès');
  });

  it('webkitAudioContext essayé quand AudioContext est absent (vieux iOS Safari)', () => {
    const { contexte, oscillateurs } = contexteFictif();
    // Fonction classique (pas une flèche) : constructible via `new`.
    const fabrique = vi.fn(function webkitAudioContext() {
      return contexte;
    });
    // window SANS AudioContext, AVEC webkitAudioContext.
    vi.stubGlobal('window', { webkitAudioContext: fabrique });
    const audio = creerAudioScan();
    audio.debloquer();
    audio.bipSucces();
    expect(fabrique).toHaveBeenCalledTimes(1);
    expect(oscillateurs).toHaveLength(MELODIE_SUCCES.length);
  });

  it('AudioContext présent : webkitAudioContext ignoré', () => {
    const { contexte } = contexteFictif();
    const webkit = vi.fn(function webkitAudioContext() {
      return contexte;
    });
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function AudioContext() {
        return contexte;
      }),
      webkitAudioContext: webkit,
    });
    const audio = creerAudioScan();
    audio.debloquer();
    expect(webkit).not.toHaveBeenCalled();
  });

  it('contexte suspendu (interruption iOS) : bip SAUTÉ, resume retenté, pas d’empilement', () => {
    const { contexte, oscillateurs } = contexteFictif();
    const suspendu = contexte as ContexteAudioLike & { state?: string };
    suspendu.state = 'suspended';
    const audio = creerAudioScan({ creerContexte: () => suspendu });
    audio.debloquer();
    audio.bipSucces();
    audio.bipDoublon();
    expect(oscillateurs).toHaveLength(0); // currentTime figé : rien de planifié
    expect(contexte.resume).toHaveBeenCalled();

    // Le contexte revient : le bip suivant se joue normalement.
    suspendu.state = 'running';
    audio.bipSucces();
    expect(oscillateurs).toHaveLength(MELODIE_SUCCES.length);
  });

  it('resume rejeté (contexte suspendu) : silencieux, le geste suivant réessaie', () => {
    const contexte: ContexteAudioLike = {
      ...contexteFictif().contexte,
      resume: vi.fn(async () => {
        throw new DOMException('suspended', 'InvalidStateError');
      }),
    };
    const audio = creerAudioScan({ creerContexte: () => contexte });
    expect(() => audio.debloquer()).not.toThrow();
  });

  it('vibrer : motif natif distinct par état (après le geste)', () => {
    const motifs: number[][] = [];
    const audio = creerAudioScan({
      vibrerNatif: (motif) => {
        motifs.push(motif);
        return true;
      },
    });
    audio.debloquer();
    audio.vibrer('succès');
    audio.vibrer('doublon');
    audio.vibrer('inconnu');
    expect(motifs).toEqual([[90], [90, 70, 90], [200, 90, 200]]);
  });

  it('vibrer sans API native : silencieux, jamais d’exception', () => {
    const audio = creerAudioScan({ vibrerNatif: () => false });
    expect(() => audio.vibrer('doublon')).not.toThrow();
  });
});
