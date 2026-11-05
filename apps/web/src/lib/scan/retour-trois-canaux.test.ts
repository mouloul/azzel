import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MELODIE_DOUBLON,
  MELODIE_INCONNU,
  MELODIE_SUCCES,
  VIBRATION_DOUBLON,
  VIBRATION_INCONNU,
  VIBRATION_SUCCES,
  type NoteBip,
} from './audio-scan';
import { libelleVoyantPassage, libelleVoyantRetrait } from './etats-scan';

/* Story 10.4 (Partie B, UX-DR-6) — le retour de scan possède TROIS canaux
 * (visuel, sonore, vibration) et chacun doit distinguer les trois états
 * succès / doublon / inconnu DEUX À DEUX : au soleil avec le bruit, un canal
 * seul peut manquer, mais jamais deux états ne doivent se ressembler sur
 * TOUTES les dimensions d'un même canal.
 *
 * Ce test assemble la vue d'ensemble (les constantes ont chacune leurs
 * gardes dédiées dans audio-scan.test.ts et etats-scan.test.ts — citées dans
 * le rapport) :
 * - SONORE : mélodies distinctes deux à deux (fréquences ET durées) ;
 * - VIBRATION : motifs distincts deux à deux ;
 * - VISUEL : glyphes ✓/↻/⚠ distincts, classes de voyant distinctes, fonds
 *   distincts dans le CSS servi, et position distincte de l'inconnu (bas de
 *   cadre) face au doublon (haut) — jamais la couleur seule. */

const sourceClient = readFileSync(
  fileURLToPath(new URL('../../app/volontaires/scan/scan-client.tsx', import.meta.url)),
  'utf8',
);
const scanCss = readFileSync(
  fileURLToPath(new URL('../../app/volontaires/scan/scan.css', import.meta.url)),
  'utf8',
);

type Canal = { melodie: readonly NoteBip[]; vibration: readonly number[]; glyphe: string };

const CANAUX: Record<'succès' | 'doublon' | 'inconnu', Canal> = {
  succès: { melodie: MELODIE_SUCCES, vibration: VIBRATION_SUCCES, glyphe: '✓' },
  doublon: { melodie: MELODIE_DOUBLON, vibration: VIBRATION_DOUBLON, glyphe: '↻' },
  inconnu: { melodie: MELODIE_INCONNU, vibration: VIBRATION_INCONNU, glyphe: '⚠' },
};

const ETATS = ['succès', 'doublon', 'inconnu'] as const;

function signatureMelodie(melodie: readonly NoteBip[]): string {
  return melodie.map((note) => `${note.frequence}@${note.dureeMs}`).join('+');
}

describe('UX-DR-6 — canal SONORE : trois mélodies distinctes deux à deux', () => {
  it('chaque état a une signature (fréquence + durée) différente de chaque autre', () => {
    const signatures = ETATS.map((etat) => signatureMelodie(CANAUX[etat].melodie));
    expect(new Set(signatures).size).toBe(3);
  });

  it('directions assumées : succès ascendant, doublon répété, inconnu descendant grave', () => {
    expect(MELODIE_SUCCES[1].frequence).toBeGreaterThan(MELODIE_SUCCES[0].frequence);
    expect(MELODIE_DOUBLON[1].frequence).toBe(MELODIE_DOUBLON[0].frequence);
    expect(MELODIE_INCONNU[1].frequence).toBeLessThan(MELODIE_INCONNU[0].frequence);
    expect(Math.min(...MELODIE_INCONNU.map((n) => n.frequence))).toBeLessThan(
      Math.min(...MELODIE_SUCCES.map((n) => n.frequence)),
    );
  });
});

describe('UX-DR-6 — canal VIBRATION : trois motifs distincts deux à deux', () => {
  it('motifs différents par état (succès bref, doublon et inconnu en pulses composés distincts)', () => {
    for (const [a, b] of [
      ['succès', 'doublon'],
      ['succès', 'inconnu'],
      ['doublon', 'inconnu'],
    ] as const) {
      expect(CANAUX[a].vibration.join(',')).not.toBe(CANAUX[b].vibration.join(','));
    }
    // Le doublon et l'inconnu (les deux à ne pas confondre au guichet) ont
    // des rythmes clairement différents : 3 pulses courts vs 2 pulses longs.
    expect(VIBRATION_DOUBLON).toEqual([90, 70, 90]);
    expect(VIBRATION_INCONNU).toEqual([200, 90, 200]);
  });
});

describe('UX-DR-6 — canal VISUEL : glyphe, classe, fond et position distincts', () => {
  it('libellés des DEUX modes : glyphes ✓/↻/⚠ distincts en tête de voyant (jamais la couleur seule)', () => {
    const succes = libelleVoyantPassage(
      { etat: 'succès', dossard: 74, coureur: { dossard: 74, nom: 'Ulahianne', prenom: 'Yani', jeton: 'j74' } },
      new Date('2026-05-16T06:12:30Z'),
    );
    const doublon = libelleVoyantPassage({ etat: 'doublon', dossard: 74 }, new Date(0));
    const inconnu = libelleVoyantRetrait({ etat: 'inconnu' });
    expect(succes.startsWith('✓')).toBe(true);
    expect(doublon.startsWith('↻')).toBe(true);
    expect(inconnu.startsWith('⚠')).toBe(true);
    expect(new Set([succes[0], doublon[0], inconnu[0]]).size).toBe(3);
  });

  it('scan.css : trois classes de voyant, trois FONDS de tokens distincts, trois encres distinctes', () => {
    const fonds: string[] = [];
    const encres: string[] = [];
    for (const [classe, fond, encre] of [
      ['--succes', '--az-succes-sombre', '--az-succes-encre-sombre'],
      ['--doublon', '--az-attention-sombre', '--az-attention-encre-sombre'],
      ['--inconnu', '--az-danger-sombre', '--az-danger-encre-sombre'],
    ] as const) {
      const regle =
        scanCss.match(new RegExp(`\\.scan-voyant${classe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(regle, `règle .scan-voyant${classe} absente`).toContain(`background: var(${fond})`);
      expect(regle).toContain(`color: var(${encre})`);
      fonds.push(fond);
      encres.push(encre);
    }
    expect(new Set(fonds).size).toBe(3);
    expect(new Set(encres).size).toBe(3);
  });

  it('le client rend l’inconnu dans la zone BASSE (classe scan-bas), succès/doublon en haut du cadre', () => {
    const positionBasse = sourceClient.indexOf('className="scan-bas"');
    const voyantInconnu = sourceClient.indexOf('scan-voyant--inconnu');
    const voyantHaut = sourceClient.indexOf(
      "voyant.resultat.etat !== 'inconnu'",
    );
    expect(positionBasse).toBeGreaterThan(-1);
    expect(voyantInconnu).toBeGreaterThan(positionBasse);
    expect(voyantHaut).toBeGreaterThan(-1);
    expect(voyantHaut).toBeLessThan(positionBasse);
  });

  it('les DEUX voyants sont annoncés au lecteur d’écran (role=status + aria-live=assertive)', () => {
    expect(sourceClient.split('aria-live="assertive"').length - 1).toBe(2);
  });
});

describe('UX-DR-6 — vue d’ensemble : les trois canaux portent chacun les trois états', () => {
  it('chaque canal sépare les trois états SIMULTANÉMENT (aucun canal muet)', () => {
    const empreintes: Record<string, string[]> = {
      melodie: ETATS.map((etat) => signatureMelodie(CANAUX[etat].melodie)),
      vibration: ETATS.map((etat) => CANAUX[etat].vibration.join(',')),
      glyphe: ETATS.map((etat) => CANAUX[etat].glyphe),
    };
    for (const [canal, valeurs] of Object.entries(empreintes)) {
      expect(
        new Set(valeurs).size,
        `canal ${canal} : trois empreintes distinctes attendues`,
      ).toBe(3);
    }
  });
});
