import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { creerClientApi, ApiErreur } from '../api-client';
import type { AppTheme } from '../theme';
import { Bouton, BoutonAssistance, Carte, ErreurEnveloppe, Surtitre, Titre } from './ui';

// Story 6.1 — connexion native : MÊME flux email + code à 6 chiffres que le
// web (quotas, TTL, anti-bruteforce inchangés côté serveur). Le token de
// session renvoyé par verify (client "native") est transmis à App.tsx qui le
// range en SecureStore. Tutoiement, erreurs en enveloppe (message + action +
// appel équipe), renvoi de code possible.

interface PropsConnexion {
  theme: AppTheme;
  telephone: string;
  sessionExpiree: boolean;
  /** Story 6.2 — déconnexion incomplète (positions non effacées) : dit honnêtement. */
  messageDeconnexion?: string | null;
  /** Rejette en cas d'échec de stockage du token (refus keychain) pour affichage. */
  onConnecte: (token: string, email: string) => Promise<void>;
}

export function EcranConnexion({ theme, telephone, sessionExpiree, messageDeconnexion, onConnecte }: PropsConnexion) {
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<ApiErreur | null>(null);

  const client = creerClientApi();

  async function demanderCode() {
    setOccupe(true);
    setErreur(null);
    try {
      await client.demanderCode(email.trim());
      setEtape('code');
    } catch (caught) {
      setErreur(caught instanceof ApiErreur ? caught : new ApiErreur(500, null, false));
    } finally {
      setOccupe(false);
    }
  }

  async function verifierCode() {
    setOccupe(true);
    setErreur(null);
    try {
      const { token, email: emailConfirmee } = await client.verifierCode(email.trim(), code.trim());
      // Le stockage du token peut échouer (refus keychain) : l'erreur
      // remonte ici et s'affiche au lieu de bloquer sur « chargement ».
      await onConnecte(token, emailConfirmee);
    } catch (caught) {
      setErreur(caught instanceof ApiErreur ? caught : new ApiErreur(500, null, false));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: theme.spacing[4],
          padding: theme.spacing.marginMobile,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Carte theme={theme}>
          <Surtitre theme={theme}>Azzel</Surtitre>
          <Titre theme={theme}>
            {etape === 'email' ? 'Course dans ta poche' : 'Entre ton code'}
          </Titre>
          {sessionExpiree && etape === 'email' ? (
              <Text style={[theme.fonts.body, { color: theme.colors.warning }]}>
                Ta session a expiré ou a été ouverte ailleurs : reconnecte-toi.
              </Text>
          ) : null}
          {messageDeconnexion !== null && messageDeconnexion !== undefined && etape === 'email' ? (
            <Text accessibilityRole="alert" style={[theme.fonts.body, { color: theme.colors.danger }]}>
              {messageDeconnexion}
            </Text>
          ) : null}
          {etape === 'email' ? (
            <>
              <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
                Utilise l’adresse avec laquelle tu t’es inscrit : on t’envoie un code à 6 chiffres.
              </Text>
              <TextInput
                accessibilityLabel="Adresse email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="coureur@exemple.dz"
                placeholderTextColor={theme.colors.ink2}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: theme.colors.ink2,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: theme.spacing[3],
                  color: theme.colors.ink,
                  fontSize: 16.5,
                }}
              />
              <Bouton
                theme={theme}
                label="Recevoir mon code"
                disabled={occupe}
                onPress={() => {
                  void demanderCode();
                }}
              />
            </>
          ) : (
            <>
              <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
                Code envoyé à {email.trim()} — il expire dans 10 minutes.
              </Text>
              <TextInput
                accessibilityLabel="Code à 6 chiffres"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: theme.colors.ink2,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: theme.spacing[3],
                  color: theme.colors.ink,
                  fontSize: 24,
                  letterSpacing: 12,
                  fontFamily: theme.fonts.meta.fontFamily,
                }}
              />
              <Bouton
                theme={theme}
                label="Se connecter"
                disabled={occupe}
                onPress={() => {
                  void verifierCode();
                }}
              />
              <Bouton
                theme={theme}
                label="Modifier l’adresse email"
                variante="contour"
                disabled={occupe}
                onPress={() => {
                  setCode('');
                  setEtape('email');
                }}
              />
            </>
          )}
          {erreur ? <ErreurEnveloppe theme={theme} erreur={erreur} telephone={telephone} /> : null}
        </Carte>
        {etape === 'email' ? <BoutonAssistance theme={theme} telephone={telephone} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
