import { ScrollView, Text, View } from 'react-native';

import type { AppTheme } from '../theme';
import {
  CITATION_BATTERIE,
  CITATION_BATTERIE_SOURCE,
  CONSEILS_BATTERIE,
} from './batterie-contenu';
import { Bouton, BoutonAssistance, Carte, Surtitre, Titre } from './ui';

// Story 6.4 — rubrique batterie (écran dédié) : la carte à puces des trois
// conseils concrets tutoyés, CONCLUE par la citation kabyle au point d'usage
// (source toujours notée — jamais groupée ailleurs, jamais en zone critique).
// Affichée à l'ACTIVATION du suivi (navigation auto) et accessible en
// PERMANENCE depuis Suivi et e-dossard (suivi désactivé compris) — le Retour
// revient à l'écran d'origine mémorisé par App.tsx. Assistance en pied
// d'écran, cohérent avec Suivi/e-dossard et l'email (« Appelle l'équipe »).

interface PropsEcranBatterie {
  theme: AppTheme;
  telephone: string;
  onRetour: () => void;
}

export function EcranBatterie({ theme, telephone, onRetour }: PropsEcranBatterie) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        gap: theme.spacing[4],
        padding: theme.spacing.marginMobile,
        paddingBottom: theme.spacing[7],
      }}
    >
      <Carte theme={theme}>
        <Surtitre theme={theme}>Suivi de course</Surtitre>
        <Titre theme={theme}>Ta batterie pour le jour J</Titre>
        <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
          Un suivi GPS et un e-dossard, ça se nourrit : voici comment arriver à l’arrivée
          avec tout vivant.
        </Text>
      </Carte>

      <Carte theme={theme}>
        {CONSEILS_BATTERIE.map((conseil, index) => (
          <View
            key={conseil}
            accessible
            accessibilityLabel={`Conseil ${index + 1} : ${conseil}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing[3],
              minHeight: 48,
            }}
          >
            <View
              accessibilityElementsHidden
              style={{
                width: 32,
                height: 32,
                borderRadius: theme.radius.full,
                borderWidth: 2,
                borderColor: theme.colors.action,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[theme.fonts.surtitre, { color: theme.colors.action }]}>
                {index + 1}
              </Text>
            </View>
            <Text accessibilityElementsHidden style={[theme.fonts.bodyLg, { color: theme.colors.ink, flex: 1 }]}>
              {conseil}
            </Text>
          </View>
        ))}
      </Carte>

      {/* Citation conclusive — au point d'usage batterie uniquement, source
          toujours notée (UX-DR-5/17). */}
      <Carte theme={theme} style={{ backgroundColor: theme.colors.surface }}>
        <View
          accessible
          accessibilityLabel={`Citation : « ${CITATION_BATTERIE} » — ${CITATION_BATTERIE_SOURCE}`}
          style={{ gap: theme.spacing[2] }}
        >
          <Text
            style={[theme.fonts.bodyLg, { color: theme.colors.ink, fontStyle: 'italic' }]}
          >
            « {CITATION_BATTERIE} »
          </Text>
          <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
            — {CITATION_BATTERIE_SOURCE}
          </Text>
        </View>
      </Carte>

      <Bouton theme={theme} label="Retour" variante="contour" onPress={onRetour} />
      <BoutonAssistance theme={theme} telephone={telephone} />
    </ScrollView>
  );
}
