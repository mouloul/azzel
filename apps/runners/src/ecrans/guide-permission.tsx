import { useState } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';

import type { AppTheme } from '../theme';
import { Bouton, Carte, Surtitre, Titre } from './ui';

// Story 6.3 — écran guide permission « Autoriser une fois » : étapes
// numérotées, chemin système COMPLET en exergue (copiable visuellement —
// jamais « va dans tes réglages »), bouton contour « Ouvrir les Réglages »
// (Linking.openSettings ; échec → message doux, le chemin reste lisible).
// Tutoiement, ton neutre : aucune culpabilisation, aucune urgence feinte.
// iOS = parcours canonique « Toujours » ; Android = variante
// « Autoriser tout le temps ». Auto-affiché UNE fois par interruption
// (orchestration), accessible EN PERMANENCE depuis l'écran Suivi.

interface ContenuGuide {
  titre: string;
  explication: string;
  etapes: string[];
  /** Chemin système COMPLET — en exergue, la référence visuelle absolue. */
  chemin: string;
  /** Message doux si l'ouverture des réglages échoue (le chemin reste là). */
  messageEchecOuverture: string;
}

const GUIDE_IOS: ContenuGuide = {
  titre: 'Remettre le suivi en route',
  explication:
    'Sur iPhone, le choix « Autoriser une fois » s’arrête dès que l’écran se verrouille : ce n’est pas de ta faute, c’est le téléphone. Quelques secondes dans les Réglages suffisent — ton suivi repartira tout seul, sans rien refaire.',
  etapes: [
    'Ouvre l’app Réglages du téléphone (l’icône grise en forme d’engrenage).',
    'Fais défiler jusqu’à Azzel — ou tape « Azzel » dans la barre de recherche en haut.',
    'Touche « Localisation ».',
    'Touche « Toujours ».',
  ],
  chemin: 'Réglages > Azzel > Localisation > Toujours',
  messageEchecOuverture:
    'Impossible d’ouvrir les Réglages depuis ici. Suis le chemin ci-dessus à la main, il est exact.',
};

const GUIDE_ANDROID: ContenuGuide = {
  titre: 'Remettre le suivi en route',
  explication:
    'Quand l’écran se verrouille, Android coupe la position de l’app tant qu’elle n’a pas le droit « tout le temps ». Quelques secondes dans les Paramètres suffisent — ton suivi repartira tout seul, sans rien refaire.',
  etapes: [
    'Ouvre l’app Paramètres du téléphone.',
    'Touche « Applications » (parfois appelée « Apps »).',
    'Touche « Azzel » dans la liste.',
    'Touche « Autorisations », puis « Position ».',
    'Touche « Autoriser tout le temps ».',
  ],
  chemin:
    'Paramètres > Applications > Azzel > Autorisations > Position > Autoriser tout le temps',
  messageEchecOuverture:
    'Impossible d’ouvrir les Paramètres depuis ici. Suis le chemin ci-dessus à la main, il est exact.',
};

export interface PropsEcranGuidePermission {
  theme: AppTheme;
  onRetour: () => void;
}

export function EcranGuidePermission({ theme, onRetour }: PropsEcranGuidePermission) {
  const guide = Platform.OS === 'android' ? GUIDE_ANDROID : GUIDE_IOS;
  const [erreurOuverture, setErreurOuverture] = useState<string | null>(null);

  const ouvrirReglages = () => {
    setErreurOuverture(null);
    // openURL rejeté → enveloppe douce : message + le chemin complet reste
    // affiché (le coureur peut toujours le suivre à la main).
    Linking.openSettings().catch(() => {
      setErreurOuverture(guide.messageEchecOuverture);
    });
  };

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
        <Titre theme={theme}>{guide.titre}</Titre>
        <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>{guide.explication}</Text>
      </Carte>

      {/* Chemin système COMPLET en exergue : la référence copiable
          visuellement — jamais la couleur seule, le texte DIT le chemin. */}
      <View
        accessibilityRole="text"
        accessibilityLabel={`Chemin à suivre : ${guide.chemin}`}
        style={{
          backgroundColor: theme.colors.warning,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3],
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <Text style={[theme.fonts.metaLg, { color: theme.colors.warningInk }]}>{guide.chemin}</Text>
      </View>

      <Carte theme={theme}>
        {guide.etapes.map((etape, index) => (
          <View
            key={etape}
            accessible
            accessibilityLabel={`Étape ${index + 1} : ${etape}`}
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
              {etape}
            </Text>
          </View>
        ))}
      </Carte>

      <Bouton theme={theme} label="Ouvrir les Réglages" variante="contour" onPress={ouvrirReglages} />
      {erreurOuverture !== null ? (
        <Text
          accessibilityRole="alert"
          style={[theme.fonts.body, { color: theme.colors.danger }]}
        >
          {erreurOuverture}
        </Text>
      ) : null}
      <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
        Ensuite, reviens dans l’app : le suivi repart tout seul, sans rien refaire.
      </Text>

      <Bouton theme={theme} label="Retour au suivi" variante="contour" onPress={onRetour} />
    </ScrollView>
  );
}
