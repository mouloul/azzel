import { Linking, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { AppTheme, FontToken } from '../theme';
import type { ApiErreur } from '../api-client';

// Story 6.1 — briques UI partagées des écrans : carte, boutons (cible ≥ 48 dp),
// affichage d'erreur normalisé (message + action de l'enveloppe + bouton
// « Appeler l'équipe » — jamais de code brut) et bandeau hors-ligne.

export function Carte({
  theme,
  children,
  style,
}: {
  theme: AppTheme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.ink2,
          padding: theme.spacing[4],
          gap: theme.spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function texte(theme: AppTheme, font: FontToken, color: string): StyleProp<TextStyle> {
  return [{ ...font, color }];
}

export function Bouton({
  theme,
  label,
  onPress,
  variante = 'principal',
  disabled = false,
  accessibilityLabel,
}: {
  theme: AppTheme;
  label: string;
  onPress: () => void;
  variante?: 'principal' | 'contour';
  /** Requête en cours : onPress ignoré, opacité réduite (anti double-tap). */
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const principal = variante === 'principal';
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: theme.spacing[5],
          paddingVertical: theme.spacing[3],
          borderRadius: theme.radius.full,
          backgroundColor: principal
            ? pressed
              ? theme.colors.ink
              : theme.colors.action
            : 'transparent',
          borderWidth: principal ? 0 : 2,
          borderColor: theme.colors.action,
        },
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <Text
        style={[
          theme.fonts.surtitre,
          { color: principal ? theme.colors.actionInk : theme.colors.action },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BoutonAssistance({ theme, telephone }: { theme: AppTheme; telephone: string }) {
  return (
    <Bouton
      theme={theme}
      label="Appeler l’équipe"
      variante="contour"
      accessibilityLabel={`Appeler l’équipe au ${telephone}`}
      onPress={() => {
        void Linking.openURL(`tel:${telephone.replace(/\s+/g, '')}`);
      }}
    />
  );
}

/** Erreur enveloppe : message homogène + action à faire + appel équipe. */
export function ErreurEnveloppe({
  theme,
  erreur,
  telephone,
}: {
  theme: AppTheme;
  erreur: ApiErreur;
  telephone: string;
}) {
  const message =
    erreur.horsLigne
      ? 'Connexion impossible.'
      : (erreur.enveloppe?.error.message ?? 'Une erreur est survenue.');
  const action = erreur.horsLigne
    ? 'Vérifie ta connexion puis réessaie — tes données restent lisibles hors-ligne.'
    : (erreur.enveloppe?.error.action ?? 'Réessaie dans un instant.');
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.danger,
        borderRadius: theme.radius.sm,
        padding: theme.spacing[4],
        gap: theme.spacing[2],
      }}
    >
      <Text style={texte(theme, theme.fonts.body, theme.colors.dangerInk)}>{message}</Text>
      <Text style={texte(theme, theme.fonts.meta, theme.colors.dangerInk)}>{action}</Text>
      <BoutonAssistance theme={theme} telephone={telephone} />
    </View>
  );
}

/** Bandeau « hors-ligne » : jamais la couleur seule — le texte dit l’état. */
export function BandeauHorsLigne({ theme }: { theme: AppTheme }) {
  return (
    <View
      accessibilityRole="status"
      style={{
        backgroundColor: theme.colors.warning,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing[4],
        paddingVertical: theme.spacing[3],
        flexDirection: 'row',
        gap: theme.spacing[2],
        alignItems: 'center',
      }}
    >
      <Text style={texte(theme, theme.fonts.metaLg, theme.colors.warningInk)}>
        ◷ HORS-LIGNE — dernière visite affichée
      </Text>
    </View>
  );
}

export function Surtitre({ theme, children }: { theme: AppTheme; children: string }) {
  return (
    <Text style={[theme.fonts.surtitre, { color: theme.colors.action, textTransform: 'uppercase' }]}>
      {children}
    </Text>
  );
}

export function Titre({ theme, children }: { theme: AppTheme; children: string }) {
  return <Text style={texte(theme, theme.fonts.displaySm, theme.colors.ink)}>{children}</Text>;
}
