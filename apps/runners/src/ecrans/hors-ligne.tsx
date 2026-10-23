import { ScrollView, Text } from 'react-native';

import type { AppTheme } from '../theme';
import { Bouton, BoutonAssistance, Carte, Surtitre, Titre } from './ui';

// Story 6.1 — écran « première connexion requise » : réseau coupé et AUCUN
// cache (l'app n'a jamais été ouverte en ligne). On explique pourquoi rien
// ne s'affiche et on propose de réessayer — jamais d'écran vide.

interface PropsHorsLigne {
  theme: AppTheme;
  telephone: string;
  onReessayer: () => void;
}

export function EcranHorsLigne({ theme, telephone, onReessayer }: PropsHorsLigne) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        gap: theme.spacing[4],
        padding: theme.spacing.marginMobile,
      }}
    >
      <Carte theme={theme}>
        <Surtitre theme={theme}>Hors-ligne</Surtitre>
        <Titre theme={theme}>Première connexion requise</Titre>
        <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
          Connecte-toi au moins une fois avec le réseau : ton dossier et ton e-dossard seront
          ensuite gardés sur ton téléphone, lisibles même sans réseau.
        </Text>
        <Bouton theme={theme} label="Réessayer" onPress={onReessayer} />
      </Carte>
      <BoutonAssistance theme={theme} telephone={telephone} />
    </ScrollView>
  );
}
