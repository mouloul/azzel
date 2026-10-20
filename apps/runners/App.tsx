import { SafeAreaView, ScrollView, Text, View, useColorScheme } from 'react-native';

import { themeFor } from './src/theme';

export default function App() {
  const colorScheme = useColorScheme();
  const theme = themeFor(colorScheme);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: theme.spacing[4],
          padding: theme.spacing.marginMobile,
        }}
      >
        <Text
          style={[
            theme.fonts.surtitre,
            { color: theme.colors.action, textTransform: 'uppercase' },
          ]}
        >
          Fondation
        </Text>
        <Text style={[theme.fonts.display, { color: theme.colors.ink }]}>Azzel</Text>
        <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
          L’application coureurs prendra forme ici : e-dossard, suivi GPS, dossier — hors-ligne
          d’abord.
        </Text>
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.ink2,
            padding: theme.spacing[4],
            gap: theme.spacing[2],
          }}
        >
          <Text style={[theme.fonts.metaLg, { color: theme.colors.ink2 }]}>
            packages/shared → thème RN
          </Text>
          <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
            tokens Vert Djurdjura · clair + sombre · mode : {colorScheme ?? 'système'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
