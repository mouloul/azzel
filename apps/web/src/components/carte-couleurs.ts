/** Couleurs lues sur le document : la carte suit le thème comme le reste. */
export function couleursDuTheme(): {
  trace: string;
  halo: string;
  cielHaut: string;
  cielHorizon: string;
} {
  const style = getComputedStyle(document.documentElement);
  const jeton = (nom: string, repli: string) => style.getPropertyValue(nom).trim() || repli;
  return {
    trace: jeton('--az-carte-trace', '#A3400C'),
    halo: jeton('--az-carte-halo', '#FFFFFF'),
    cielHaut: jeton('--az-carte-ciel-haut', '#86B4E0'),
    cielHorizon: jeton('--az-carte-ciel-horizon', '#CFE0EF'),
  };
}
