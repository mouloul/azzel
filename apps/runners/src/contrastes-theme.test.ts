import { describe, expect, it, vi } from 'vitest';

import { tokens } from '@azzel/shared';

// Même mock minimal que theme.test.ts : seul Platform.select est lu à l'import.
vi.mock('react-native', () => ({
  Platform: {
    select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default,
  },
}));

import { darkTheme, lightTheme, type AppTheme } from './theme';

/* Story 10.4 (Partie B) — contrastes AA de l’app coureurs (surface refondue
 * par 10.2). Le rendu NATIF n’est pas vérifiable ici (ni appareil ni
 * simulateur) : ce garde épingle les PAIRES portées par le thème dérivé des
 * tokens — exactement celles que les écrans appliquent (theme.colors.*),
 * dans les DEUX modes. Fonctions WCAG identiques à contrastes.test.ts (web).
 *
 * Le natif n’a pas d’héritage CSS : chaque paire est celle posée
 * explicitement par un écran :
 * - texte/texte-2 sur bg (ScrollView) et surface (Carte) — dossier, suivi ;
 * - action sur surface — boutons contour + surtitres ;
 * - action-texte sur action (principal) et sur ink (principal pressé) ;
 * - danger sur bg ET surface — bouton destructeur en CONTOUR épais 3 px sur
 *   fond transparent (I2, revue épopée 10 : posé sur le fond d'écran dans
 *   dossier.tsx, sur une carte dans edossard.tsx) + message d'erreur du
 *   suivi + bordure non textuelle ≥ 3:1 (1.4.11) ;
 * - danger-encre sur danger — destructeur À L'ÉTAT PRESSÉ (inversion
 *   contour → pastille pleine, I2) + ErreurEnveloppe ;
 * - attention-encre sur attention — bandeau « ◷ HORS-LIGNE » ;
 * - sync-attente/sync-envoye + encres — bandeau de file du suivi (10.2 :
 *   l'état du suivi remonte en tête, la file reste visible) ;
 * - texte-sombre/texte-2-sombre sur bg-sombre — carte sombre FIXE de
 *   l'e-dossard (10.2 : littéraux remplacés par les tokens, rendu identique). */

const SEUIL_COURANT = 4.5;
const SEUIL_NON_TEXTUEL = 3;

function canalLineaire(canal: number): number {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminanceRelative(hex: string): number {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b);
}

function ratioContraste(a: string, b: string): number {
  const l1 = luminanceRelative(a);
  const l2 = luminanceRelative(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

type Paire = {
  nom: string;
  texte: string;
  fond: string;
  seuil: number;
  usage: string;
};

function pairesDuTheme(theme: AppTheme, mode: 'clair' | 'sombre'): readonly Paire[] {
  return [
    {
      nom: `texte / bg (${mode})`,
      texte: theme.colors.ink,
      fond: theme.colors.bg,
      seuil: SEUIL_COURANT,
      usage: 'texte courant des écrans (fond de ScrollView)',
    },
    {
      nom: `texte / surface (${mode})`,
      texte: theme.colors.ink,
      fond: theme.colors.surface,
      seuil: SEUIL_COURANT,
      usage: 'texte dans les cartes',
    },
    {
      nom: `texte-2 / bg (${mode})`,
      texte: theme.colors.ink2,
      fond: theme.colors.bg,
      seuil: SEUIL_COURANT,
      usage: 'texte secondaire (explications suivi, vie privée)',
    },
    {
      nom: `texte-2 / surface (${mode})`,
      texte: theme.colors.ink2,
      fond: theme.colors.surface,
      seuil: SEUIL_COURANT,
      usage: 'texte secondaire dans les cartes',
    },
    {
      nom: `action / surface (${mode})`,
      texte: theme.colors.action,
      fond: theme.colors.surface,
      seuil: SEUIL_COURANT,
      usage: 'boutons contour + surtitres « Suivi de course », « Ta vie privée »',
    },
    {
      nom: `action-texte / action (${mode})`,
      texte: theme.colors.actionInk,
      fond: theme.colors.action,
      seuil: SEUIL_COURANT,
      usage: 'bouton principal',
    },
    {
      nom: `action-texte / texte pressé (${mode})`,
      texte: theme.colors.actionInk,
      fond: theme.colors.ink,
      seuil: SEUIL_COURANT,
      usage: 'bouton principal à l’état pressé (fond ink)',
    },
    {
      nom: `danger / bg (${mode})`,
      texte: theme.colors.danger,
      fond: theme.colors.bg,
      seuil: SEUIL_COURANT,
      usage:
        'bouton destructeur en CONTOUR (fond transparent, I2) posé sur le fond d’écran — « Se déconnecter » de dossier.tsx',
    },
    {
      nom: `danger / surface (${mode})`,
      texte: theme.colors.danger,
      fond: theme.colors.surface,
      seuil: SEUIL_COURANT,
      usage:
        'bouton destructeur en CONTOUR dans une carte (edossard.tsx) + message d’erreur de l’écran Suivi',
    },
    {
      nom: `bordure danger / bg (${mode}) — non textuel 1.4.11`,
      texte: theme.colors.danger,
      fond: theme.colors.bg,
      seuil: SEUIL_NON_TEXTUEL,
      usage: 'contour épais 3 px du bouton destructeur sur le fond d’écran',
    },
    {
      nom: `bordure danger / surface (${mode}) — non textuel 1.4.11`,
      texte: theme.colors.danger,
      fond: theme.colors.surface,
      seuil: SEUIL_NON_TEXTUEL,
      usage: 'contour épais 3 px du bouton destructeur dans une carte',
    },
    {
      nom: `danger-encre / danger (${mode})`,
      texte: theme.colors.dangerInk,
      fond: theme.colors.danger,
      seuil: SEUIL_COURANT,
      usage:
        'destructeur À L’ÉTAT PRESSÉ (inversion contour → pastille pleine, I2) + ErreurEnveloppe',
    },
    {
      nom: `attention-encre / attention (${mode})`,
      texte: theme.colors.warningInk,
      fond: theme.colors.warning,
      seuil: SEUIL_COURANT,
      usage: 'bandeau « ◷ HORS-LIGNE — dernière visite affichée »',
    },
    {
      nom: `sync-attente-encre / sync-attente (${mode})`,
      texte: theme.colors.syncPendingInk,
      fond: theme.colors.syncPending,
      seuil: SEUIL_COURANT,
      usage: 'bandeau « ◷ N positions en attente » du suivi',
    },
    {
      nom: `sync-envoye-encre / sync-envoye (${mode})`,
      texte: theme.colors.syncSentInk,
      fond: theme.colors.syncSent,
      seuil: SEUIL_COURANT,
      usage: 'bandeau « ✓ envoyés — file : 0 » du suivi',
    },
  ];
}

describe('app coureurs — paires du thème (les deux modes)', () => {
  for (const [theme, mode] of [
    [lightTheme, 'clair'],
    [darkTheme, 'sombre'],
  ] as const) {
    it(`toutes les paires portées par les écrans passent AA (${mode})`, () => {
      for (const paire of pairesDuTheme(theme, mode)) {
        const ratio = ratioContraste(paire.texte, paire.fond);
        expect(
          ratio,
          `${paire.nom} (${paire.usage}) : ${ratio.toFixed(3)}:1`,
        ).toBeGreaterThanOrEqual(paire.seuil);
      }
    });
  }
});

describe('app coureurs — e-dossard : carte sombre FIXE (indépendante du thème)', () => {
  // 10.2 — les littéraux de l’e-dossard ont été remplacés par les tokens ;
  // la carte reste sombre dans les deux modes : paires fixes *-sombre.
  // (Revue M5 : l'ancienne assertion « numéro 74 px ≥ 3:1 » recalculait
  // exactement la paire texte-sombre/bg-sombre ci-dessus, déjà exigée
  // ≥ 4,5:1 — aucune paire distincte ; supprimée.)
  it('texte-sombre, texte-2-sombre et action-texte-sombre sur bg-sombre ≥ 4,5:1', () => {
    const fixes: readonly Paire[] = [
      {
        nom: 'texte-sombre / bg-sombre',
        texte: tokens.colors['texte-sombre'],
        fond: tokens.colors['bg-sombre'],
        seuil: SEUIL_COURANT,
        usage: 'nom, épreuve, « HORS-LIGNE PRÊT » de la carte e-dossard',
      },
      {
        nom: 'texte-2-sombre / bg-sombre',
        texte: tokens.colors['texte-2-sombre'],
        fond: tokens.colors['bg-sombre'],
        seuil: SEUIL_COURANT,
        usage: 'conseil « ajoute l’app à l’écran d’accueil »',
      },
      {
        nom: 'action-texte-sombre / action-sombre',
        texte: tokens.colors['action-texte-sombre'],
        fond: tokens.colors['action-sombre'],
        seuil: SEUIL_COURANT,
        usage: 'bouton plein de la carte (déverrouiller / conseil)',
      },
    ];
    for (const paire of fixes) {
      const ratio = ratioContraste(paire.texte, paire.fond);
      expect(ratio, `${paire.nom} (${paire.usage}) : ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(
        paire.seuil,
      );
    }
  });

  it('QR : encre texte sur blanc pur ≥ 4,5:1 (contrainte scanner, blanc littéral documenté)', () => {
    const ratio = ratioContraste(tokens.colors.texte, '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(SEUIL_COURANT);
  });
});
