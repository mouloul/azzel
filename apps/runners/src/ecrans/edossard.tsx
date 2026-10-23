import { ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { AppTheme } from '../theme';
import type { EdossardCache } from '../offline-cache';
import { BandeauHorsLigne, Bouton, BoutonAssistance, Carte, Surtitre } from './ui';

// Story 6.1 — e-dossard natif : carte sombre TOUJOURS sombre (guichet, plein
// soleil — couleurs fixes des rôles *-sombre, indépendantes du mode clair/
// sombre du téléphone), numéro 74 px (token dossard), badge « HORS-LIGNE
// PRÊT » mono. Le QR est rendu LOCALEMENT depuis payloadQr (contrat shared
// `azzel-e1:<jeton>`) sur carte blanche coins 16 px : lisible réseau coupé,
// même des semaines plus tard.

/** Couleurs fixes de la carte sombre (rôles *-sombre des tokens shared). */
const CARTE_SOMBRE = {
  fond: '#101A14',
  encre: '#E8F0E9',
  encre2: '#A9C0AE',
  accent: '#8FD4A8',
  encreAccent: '#0C2415',
} as const;

const QR_ENCRE = '#16281C';
const QR_BLANC = '#FFFFFF';

interface PropsEdossard {
  theme: AppTheme;
  telephone: string;
  edossard: EdossardCache;
  depuisCache: boolean;
  onRevoirDossier: () => void;
  onDeconnexion: () => void;
}

export function EcranEdossard({
  theme,
  telephone,
  edossard,
  depuisCache,
  onRevoirDossier,
  onDeconnexion,
}: PropsEdossard) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        gap: theme.spacing[4],
        padding: theme.spacing.marginMobile,
        paddingBottom: theme.spacing[7],
      }}
    >
      {depuisCache ? <BandeauHorsLigne theme={theme} /> : null}

      <View
        accessibilityLabel={`E-dossard de ${edossard.prenom} ${edossard.nom}`}
        style={{
          backgroundColor: CARTE_SOMBRE.fond,
          borderRadius: theme.radius.md,
          padding: theme.spacing[5],
          gap: theme.spacing[2],
        }}
      >
        <Text
          style={[
            theme.fonts.surtitre,
            { color: CARTE_SOMBRE.accent, textTransform: 'uppercase' },
          ]}
        >
          E-dossard — {edossard.editionNom}
        </Text>
        <Text
          style={{
            ...theme.fonts.displaySm,
            color: CARTE_SOMBRE.encre,
          }}
        >
          {edossard.prenom} {edossard.nom}
        </Text>
        <Text style={[theme.fonts.bodyLg, { color: CARTE_SOMBRE.encre2 }]}>
          {edossard.epreuveNom}
        </Text>
        {edossard.dossard !== null ? (
          <Text
            accessibilityLabel={`Dossard numéro ${edossard.dossard}`}
            style={{
              ...theme.fonts.dossard,
              color: CARTE_SOMBRE.encre,
              fontVariant: ['tabular-nums'],
            }}
          >
            {edossard.dossard}
          </Text>
        ) : (
          <>
            <Text style={{ ...theme.fonts.displaySm, color: CARTE_SOMBRE.encre2 }}>
              Numéro à venir
            </Text>
            <Text style={[theme.fonts.body, { color: CARTE_SOMBRE.encre2 }]}>
              Ton numéro est attribué par l’organisation avant la course — ton QR fonctionne
              déjà.
            </Text>
          </>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[2],
            alignSelf: 'flex-start',
            marginTop: theme.spacing[2],
            paddingHorizontal: theme.spacing[3],
            paddingVertical: theme.spacing[2],
            borderRadius: theme.radius.full,
            backgroundColor: CARTE_SOMBRE.accent,
          }}
        >
          <View
            accessible={false}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: CARTE_SOMBRE.encreAccent,
            }}
          />
          <Text
            style={[
              theme.fonts.metaLg,
              {
                color: CARTE_SOMBRE.encreAccent,
                fontWeight: '700',
                letterSpacing: 1,
              },
            ]}
          >
            HORS-LIGNE PRÊT
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: QR_BLANC,
          borderRadius: theme.radius.md,
          padding: theme.spacing[4],
          gap: theme.spacing[3],
          alignItems: 'center',
        }}
      >
        <QRCode value={edossard.payloadQr} size={280} color={QR_ENCRE} backgroundColor={QR_BLANC} />
        <Text
          style={{
            ...theme.fonts.bodyLg,
            color: QR_ENCRE,
            textAlign: 'center',
          }}
        >
          Présente ce QR code au guichet du retrait des dossards.
        </Text>
      </View>

      <Carte theme={theme}>
        <Surtitre theme={theme}>Garde-le dans ta poche</Surtitre>
        <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
          Ton e-dossard reste lisible sans réseau, même des semaines plus tard : il est gardé
          sur ton téléphone.
        </Text>
        <Bouton theme={theme} label="Revoir mon dossier" variante="contour" onPress={onRevoirDossier} />
        <Bouton theme={theme} label="Se déconnecter" variante="contour" onPress={onDeconnexion} />
        <BoutonAssistance theme={theme} telephone={telephone} />
      </Carte>
    </ScrollView>
  );
}
