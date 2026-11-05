import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompteurPlaces } from './compteur-places';
import type { PlacesState } from '@/modules/inscriptions/service';

function etat(overrides: Partial<PlacesState> = {}): PlacesState {
  return { capacite: 600, restantes: 150, afficher: true, complet: false, ...overrides };
}

describe('CompteurPlaces', () => {
  it('au-dessus du seuil : rien du tout, pas même une balise vide', () => {
    expect(renderToStaticMarkup(<CompteurPlaces places={etat({ afficher: false })} />)).toBe('');
  });

  it('sous le seuil : le nombre exact et la capacité', () => {
    const html = renderToStaticMarkup(<CompteurPlaces places={etat()} />);
    expect(html).toContain('150');
    expect(html).toContain('600');
  });

  it('une seule place : accord au singulier', () => {
    const html = renderToStaticMarkup(<CompteurPlaces places={etat({ restantes: 1 })} />);
    expect(html).toContain('1 place<');
    expect(html).toContain('encore disponible.');
  });

  it('plusieurs places : accord au pluriel', () => {
    const html = renderToStaticMarkup(<CompteurPlaces places={etat({ restantes: 2 })} />);
    expect(html).toContain('2 places<');
    expect(html).toContain('encore disponibles.');
  });

  it('complet : dit que les inscriptions continuent — sinon le visiteur repart', () => {
    const html = renderToStaticMarkup(
      <CompteurPlaces places={etat({ restantes: 0, complet: true })} />,
    );
    expect(html).toContain('Complet');
    expect(html).toContain('liste d’attente');
  });
});
