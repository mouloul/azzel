import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, Text, useColorScheme, View } from 'react-native';

import { creerClientApi } from './src/api-client';
import {
  chargerDossier as chargerDossierOrchestre,
  connecter as connecterOrchestre,
  demarrer as demarrerOrchestre,
  type EtatApp,
  type MiseAJourEcran,
  type PortsOrchestration,
} from './src/orchestration';
import {
  ecrireEtatSession,
  ecrireToken,
  lireEtatSession,
  lireToken,
  oublierSession,
  purgerAuth,
} from './src/auth-store';
import {
  ecrireCacheDossier,
  ecrireCacheEdossard,
  lireCacheDossier,
  lireCacheEdossard,
  purgerCache,
} from './src/offline-cache';
import { EcranConnexion } from './src/ecrans/connexion';
import { EcranDossier } from './src/ecrans/dossier';
import { EcranEdossard } from './src/ecrans/edossard';
import { EcranHorsLigne } from './src/ecrans/hors-ligne';
import { ASSISTANCE_PHONE } from './src/config';
import { themeFor } from './src/theme';

// Story 6.1 — machine à états de l'app coureurs (3 écrans + connexion, sans
// routeur). Les décisions et chargements vivent dans src/orchestration.ts
// (ports injectés, testés) ; ce composant câble états ↔ écrans. Dossier déjà
// validé à l'ouverture → e-dossard DIRECT ; hors-ligne → cache + bandeau,
// sinon écran première connexion ; 401 → reconnexion, cache conservé.

const ports: PortsOrchestration = {
  creerClient: (token) => creerClientApi({ token }),
  lireToken,
  ecrireToken,
  lireEtatSession,
  ecrireEtatSession,
  oublierSession,
  purgerCache,
  lireCacheDossier,
  ecrireCacheDossier,
  lireCacheEdossard,
  ecrireCacheEdossard,
};

export default function App() {
  const colorScheme = useColorScheme();
  const theme = themeFor(colorScheme);

  const [etat, setEtat] = useState<EtatApp>({
    ecran: 'chargement',
    token: null,
    sessionExpiree: false,
    dossier: null,
    edossard: null,
    depuisCache: false,
  });
  const occupe = useRef(false);

  const appliquer = useCallback((miseAJour: MiseAJourEcran) => {
    setEtat((precedent) => ({ ...precedent, ...miseAJour }));
  }, []);

  const demarrer = useCallback(async () => {
    appliquer(await demarrerOrchestre(ports));
  }, [appliquer]);

  useEffect(() => {
    if (occupe.current) {
      return;
    }
    occupe.current = true;
    void demarrer().finally(() => {
      occupe.current = false;
    });
  }, [demarrer]);

  // Le rejet (ex. refus keychain dans ecrireToken) remonte à l'écran
  // connexion pour affichage — jamais de « chargement » infini.
  const onConnecte = useCallback(
    async (nouveauToken: string, email: string) => {
      appliquer({ ecran: 'chargement' });
      try {
        appliquer(await connecterOrchestre(ports, nouveauToken, email));
      } catch (erreur) {
        appliquer({ ecran: 'connexion' });
        throw erreur;
      }
    },
    [appliquer],
  );

  const onActualiser = useCallback(async () => {
    if (!etat.token) {
      return;
    }
    appliquer({ ecran: 'chargement' });
    appliquer(await chargerDossierOrchestre(ports, etat.token));
  }, [appliquer, etat.token]);

  const onVoirEdossard = useCallback(async () => {
    if (etat.edossard) {
      appliquer({ ecran: 'edossard' });
      return;
    }
    if (etat.token) {
      appliquer({ ecran: 'chargement' });
      appliquer(await chargerDossierOrchestre(ports, etat.token));
    }
  }, [appliquer, etat.edossard, etat.token]);

  const onRevoirDossier = useCallback(async () => {
    if (etat.dossier) {
      appliquer({ ecran: 'dossier' });
      return;
    }
    if (etat.token) {
      appliquer({ ecran: 'chargement' });
      appliquer(await chargerDossierOrchestre(ports, etat.token));
    }
  }, [appliquer, etat.dossier, etat.token]);

  const onDeconnexion = useCallback(async () => {
    if (etat.token) {
      // Révocation serveur best effort : même sans réseau, le logout local
      // purge token ET caches (l'e-dossard ne doit plus vivre sur l'appareil).
      await creerClientApi({ token: etat.token }).deconnexion().catch(() => {});
    }
    await purgerAuth();
    appliquer({
      ecran: 'connexion',
      token: null,
      sessionExpiree: false,
      dossier: null,
      edossard: null,
      depuisCache: false,
    });
  }, [appliquer, etat.token]);

  const onReessayer = useCallback(() => {
    appliquer({ ecran: 'chargement' });
    void demarrer();
  }, [appliquer, demarrer]);

  const { ecran, dossier, edossard, depuisCache, sessionExpiree } = etat;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {ecran === 'chargement' ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: theme.spacing.marginMobile,
          }}
        >
          <View style={{ gap: theme.spacing[2], alignItems: 'center' }}>
            <Text
              style={[
                theme.fonts.surtitre,
                { color: theme.colors.action, textTransform: 'uppercase' },
              ]}
            >
              Azzel
            </Text>
            <Text style={[theme.fonts.displaySm, { color: theme.colors.ink }]}>
              Un instant…
            </Text>
          </View>
        </ScrollView>
      ) : null}
      {ecran === 'connexion' ? (
        <EcranConnexion
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          sessionExpiree={sessionExpiree}
          onConnecte={onConnecte}
        />
      ) : null}
      {ecran === 'dossier' && dossier ? (
        <EcranDossier
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          dossier={dossier}
          depuisCache={depuisCache}
          onVoirEdossard={() => {
            void onVoirEdossard();
          }}
          onActualiser={() => {
            void onActualiser();
          }}
          onDeconnexion={() => {
            void onDeconnexion();
          }}
        />
      ) : null}
      {ecran === 'edossard' && edossard ? (
        <EcranEdossard
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          edossard={edossard}
          depuisCache={depuisCache}
          onRevoirDossier={() => {
            void onRevoirDossier();
          }}
          onDeconnexion={() => {
            void onDeconnexion();
          }}
        />
      ) : null}
      {/* Écran de données sans ses données (état résiduel) : jamais d'écran vide. */}
      {(ecran === 'dossier' && !dossier) || (ecran === 'edossard' && !edossard) ? (
        <EcranHorsLigne
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          onReessayer={onReessayer}
        />
      ) : null}
      {ecran === 'hors-ligne' ? (
        <EcranHorsLigne
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          onReessayer={onReessayer}
        />
      ) : null}
    </SafeAreaView>
  );
}
