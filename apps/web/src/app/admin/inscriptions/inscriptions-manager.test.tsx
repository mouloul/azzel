import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ReglagesAdminState } from '@/modules/inscriptions/service';

import { InscriptionsManager } from './inscriptions-manager';

function etat(overrides: Partial<ReglagesAdminState> = {}): ReglagesAdminState {
  return {
    edition: { id: 'edition-2027', nom: 'Édition 2027' },
    comptesPaiement: { ccp: null, titulaireCcp: null, baridimob: null, titulaireBaridimob: null },
    reglages: {
      capacite: 600,
      seuilAffichagePlaces: 200,
      capaciteHebergement: 200,
      prixDossardDa: 2000,
      prixHebergementDa: 1500,
      delaiPreuveHeures: 48,
      dateCoursePublique: 0,
    },
    surchargeDelaiPreuveMinutes: null,
    placesOccupees: 0,
    hebergementsOccupes: 0,
    attente: [],
    journal: [],
    ...overrides,
  };
}

describe('InscriptionsManager — délai de dépôt de la preuve', () => {
  it('le réglage se lit en heures, borné de 1 à 720', () => {
    const html = renderToStaticMarkup(<InscriptionsManager etat={etat()} />);
    expect(html).toContain('Délai de dépôt de la preuve (heures)');
    expect(html).not.toContain('(jours)');
    const champ = html.match(/<input[^>]*id="reglage-delaiPreuveHeures"[^>]*>/)?.[0] ?? '';
    expect(champ).toContain('value="48"');
    expect(champ).toContain('min="1"');
    expect(champ).toContain('max="720"');
  });

  it('sans surcharge de développement : aucune mention', () => {
    const html = renderToStaticMarkup(<InscriptionsManager etat={etat()} />);
    expect(html).not.toContain('en développement');
  });

  it('surcharge active : affichée à côté du réglage', () => {
    const html = renderToStaticMarkup(
      <InscriptionsManager etat={etat({ surchargeDelaiPreuveMinutes: 4 })} />,
    );
    expect(html).toContain('forcé à 4 min en développement');
    expect(html).toContain('AZZEL_DELAI_PREUVE_MINUTES');
    // La mention suit le champ du délai, pas un autre réglage.
    expect(html.indexOf('forcé à 4 min')).toBeGreaterThan(html.indexOf('reglage-delaiPreuveHeures'));
    expect(html.indexOf('forcé à 4 min')).toBeLessThan(html.indexOf('reglage-dateCoursePublique'));
    // Reliée au champ : un lecteur d'écran l'entend avec le délai.
    const champ = html.match(/<input[^>]*id="reglage-delaiPreuveHeures"[^>]*>/)?.[0] ?? '';
    expect(champ).toContain('aria-describedby="aide-delaiPreuveHeures surcharge-delaiPreuveHeures"');
    expect(html).toMatch(/<p id="surcharge-delaiPreuveHeures"[^>]*>Délai forcé à 4 min/);
  });

  it('surcharge absente de la réponse (serveur plus ancien) : ni mention, ni « undefined min »', () => {
    const sansChamp = etat();
    delete (sansChamp as Partial<ReglagesAdminState>).surchargeDelaiPreuveMinutes;
    const html = renderToStaticMarkup(<InscriptionsManager etat={sansChamp} />);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('forcé à');
    const champ = html.match(/<input[^>]*id="reglage-delaiPreuveHeures"[^>]*>/)?.[0] ?? '';
    expect(champ).toContain('aria-describedby="aide-delaiPreuveHeures"');
  });

  it('historique : une ligne de l’ancien réglage en jours garde son libellé et ses valeurs', () => {
    const html = renderToStaticMarkup(
      <InscriptionsManager
        etat={etat({
          journal: [
            {
              champ: 'delaiPreuveJours',
              libelle: 'Délai de dépôt de la preuve (jours, ancien réglage)',
              ancienneValeur: 2,
              nouvelleValeur: 3,
              modifieLe: '2026-11-01T10:00:00.000Z',
              modifiePar: null,
            },
          ],
        })}
      />,
    );
    expect(html).toContain('Délai de dépôt de la preuve (jours, ancien réglage) : 2 → 3');
  });
});
