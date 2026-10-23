import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, SafeAreaView, ScrollView, Text, useColorScheme, View } from 'react-native';

import { creerClientApi } from './src/api-client';
import { ecranApresBasculeOptin, ecranApresReprise, type Ecran } from './src/app-state';
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
import { EcranSuivi } from './src/ecrans/suivi';
import { EcranGuidePermission } from './src/ecrans/guide-permission';
import { EcranJournalSync } from './src/ecrans/journal-sync';
import { EcranBatterie } from './src/ecrans/batterie';
import { creerMoteurSuivi, creerDepsMoteurSuivi, lirePermissions } from './src/tracking/moteur';
import {
  creerDepsSyncPositions,
  synchroniserPositionsAvecEnregistrement,
} from './src/tracking/sync-positions';
import {
  ETAT_SUIVI_INITIAL,
  basculerOptin,
  changerDeCompte,
  deconnecterSuivi,
  initialiserSuivi,
  lireJournalSuivi,
  reprendreAuPremierPlan,
  type EtatSuiviApp,
  type MiseAJourSuivi,
  type PortsOrchestrationSuivi,
} from './src/tracking/orchestration-suivi';
import {
  ecrireOptin,
  lireAppareilClient,
  lireOptin,
  purgerSuivi,
} from './src/tracking/suivi-store';
import { outboxSuivi } from './src/tracking/outbox-sqlite';
import { ASSISTANCE_PHONE } from './src/config';
import { themeFor } from './src/theme';

// Story 6.1 — machine à états de l'app coureurs (écrans + connexion, sans
// routeur). Les décisions et chargements vivent dans src/orchestration.ts
// (ports injectés, testés) ; ce composant câble états ↔ écrans.
//
// Story 6.2 — suivi GPS opt-in : l'orchestration vit dans
// src/tracking/orchestration-suivi.ts (ports injectés, testée) ; ce composant
// câble moteur/outbox/SecureStore + garde anti-course logout/sync par
// « génération » de session (un jeton appareil reçu après un logout ou un
// changement de compte n'est JAMAIS écrit).
//
// Story 6.3 — piège iOS « Autoriser une fois » : au retour au premier plan
// (listener AppState ci-dessous), lecture NON intrusive des permissions +
// reprendreAuPremierPlan → guide auto UNE fois par interruption, ou
// redémarrage silencieux du watcher (permission rétablie), ou rien.

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
  const [etatSuivi, setEtatSuivi] = useState<EtatSuiviApp>(ETAT_SUIVI_INITIAL);
  const [erreurDeconnexion, setErreurDeconnexion] = useState<string | null>(null);
  const occupe = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const syncEnCours = useRef(false);
  /** Génération de session : incrémentée au logout/changement de compte. */
  const generationSession = useRef(0);

  const appliquer = useCallback((miseAJour: MiseAJourEcran) => {
    // Effet de bord HORS de l'updater (un updater doit rester pur —
    // StrictMode l'invoque deux fois).
    if ('token' in miseAJour) {
      tokenRef.current = miseAJour.token ?? null;
    }
    setEtat((precedent) => ({ ...precedent, ...miseAJour }));
  }, []);

  const appliquerSuivi = useCallback((miseAJour: MiseAJourSuivi) => {
    setEtatSuivi((precedent) => ({ ...precedent, ...miseAJour }));
  }, []);

  // Miroirs pour les listeners AppState (enregistrés une fois, sinon
  // l'état y serait figé à sa première clôture) — mis à jour en effet,
  // jamais pendant le rendu.
  const etatSuiviRef = useRef(etatSuivi);
  useEffect(() => {
    etatSuiviRef.current = etatSuivi;
  }, [etatSuivi]);
  const ecranRef = useRef(etat.ecran);
  useEffect(() => {
    ecranRef.current = etat.ecran;
  }, [etat.ecran]);

  // 6.3 — mémoire du guide : ouvert automatiquement (vs par le bouton) et
  // écran d'ORIGINE au moment de l'affichage auto (Retour y revient).
  const guideAutoAfficheRef = useRef(false);
  const origineGuideRef = useRef<Ecran>('suivi');
  /** 6.4 — écran d'ORIGINE de la rubrique batterie (Suivi ou e-dossard) : le Retour y revient. */
  const origineBatterieRef = useRef<Ecran>('suivi');
  /** 6.3 — une reprise à la fois : un 2ᵉ événement 'active' pendant le traitement est ignoré. */
  const repriseEnCours = useRef(false);

  // ------------------------------------------------------------------
  // Suivi GPS (story 6.2) — moteur de capture + moteur de sync + garde
  // anti-course par génération de session.
  // ------------------------------------------------------------------

  const rafraichirAttente = useCallback(() => {
    try {
      const enAttente = outboxSuivi.compterEnAttente();
      setEtatSuivi((precedent) => ({ ...precedent, enAttente }));
    } catch {}
  }, []);

  const declencherSync = useCallback(async () => {
    if (syncEnCours.current) {
      return;
    }
    syncEnCours.current = true;
    // Génération capturée au DÉPART : un logout/changement de compte en vol
    // invalide silencieusement l'enregistrement en cours (le jeton reçu ne
    // sera jamais écrit).
    const generation = generationSession.current;
    try {
      await synchroniserPositionsAvecEnregistrement(
        creerDepsSyncPositions(() => tokenRef.current, fetch, outboxSuivi, {
          sessionValable: () => generationSession.current === generation,
        }),
      );
    } catch {
      // Erreur de stockage local : absorbée — la file reste, le prochain
      // déclenchement reprend.
    } finally {
      syncEnCours.current = false;
      rafraichirAttente();
    }
  }, [rafraichirAttente]);

  const moteur = useRef(
    creerMoteurSuivi(
      creerDepsMoteurSuivi({
        lireAppareilId: lireAppareilClient,
        surCapture: () => {
          rafraichirAttente();
          void declencherSync();
        },
      }),
    ),
  ).current;

  const portsSuiviRef = useRef<PortsOrchestrationSuivi | null>(null);
  if (portsSuiviRef.current === null) {
    portsSuiviRef.current = {
      lireOptin,
      ecrireOptin,
      demarrerMoteur: () => moteur.demarrer(),
      demarrerSansDemande: (arrierePlanAccordee: boolean) =>
        moteur.demarrerSansDemande(arrierePlanAccordee),
      arreterMoteur: () => moteur.arreter(),
      lirePermissions,
      lireJournal: () => outboxSuivi.lireJournal(),
      compterEnAttente: () => outboxSuivi.compterEnAttente(),
      synchroniser: declencherSync,
      purgerSuivi,
    };
  }
  const portsSuivi = portsSuiviRef.current;

  // ------------------------------------------------------------------
  // Orchestration 6.1 (démarrage, connexion, dossier, e-dossard) — le
  // changement de compte purge AUSSI le suivi (moteur stoppé + reset).
  // ------------------------------------------------------------------

  const portsRef = useRef<PortsOrchestration | null>(null);
  if (portsRef.current === null) {
    portsRef.current = {
      creerClient: (token) => creerClientApi({ token }),
      lireToken,
      ecrireToken,
      lireEtatSession,
      ecrireEtatSession,
      oublierSession,
      // Changement de compte (orchestration.connecter) : caches ET suivi
      // purgés AVANT toute nouvelle capture — rien du coureur précédent ne
      // fuit vers le suivant.
      purgerCache: async () => {
        await purgerCache();
        generationSession.current += 1;
        const resultat = await changerDeCompte(portsSuivi);
        appliquerSuivi(resultat.miseAJour);
      },
      lireCacheDossier,
      ecrireCacheDossier,
      lireCacheEdossard,
      ecrireCacheEdossard,
    };
  }
  const ports = portsRef.current;

  const demarrer = useCallback(async () => {
    appliquer(await demarrerOrchestre(ports));
  }, [appliquer, ports]);

  useEffect(() => {
    if (occupe.current) {
      return;
    }
    occupe.current = true;
    void demarrer()
      .then(() => initialiserSuivi(portsSuivi))
      .then(appliquerSuivi)
      .finally(() => {
        occupe.current = false;
      });
  }, [demarrer, portsSuivi, appliquerSuivi]);

  // 6.3 — retour au premier plan : lecture NON intrusive des permissions
  // (get*, aucun pop-up) + reprise orchestrée, SÉRIALISÉE (un 2ᵉ événement
  // 'active' pendant le traitement est ignoré). Piège « Autoriser une
  // fois » → guide auto UNE fois par interruption (mémorise l'écran
  // d'origine pour le Retour) ; permission rétablie → le watcher repart
  // SEUL et le guide AUTO-affiché disparaît (jamais celui ouvert par le
  // bouton) ; opt-in désactivé → AUCUNE vérification. Le résultat n'est
  // appliqué que si la session a survécu (génération + token) et que le
  // coureur n'a pas désactivé le suivi pendant le vol.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp !== 'active' || repriseEnCours.current) {
        return;
      }
      repriseEnCours.current = true;
      const depart = etatSuiviRef.current;
      const generation = generationSession.current;
      void reprendreAuPremierPlan(portsSuivi, depart)
        .then((resultat) => {
          // Résultat périmé (logout/changement de compte pendant le vol,
          // ou plus de session) : RIEN n'est appliqué — ni état, ni guide,
          // ni écran. Jamais d'optIn ressuscité après une déconnexion.
          if (generationSession.current !== generation || tokenRef.current === null) {
            return;
          }
          // Désactivation du suivi pendant le vol : l'état affiché (le
          // toggle) prime — on ne ressuscite ni optIn ni état moteur, et
          // le guide ne s'affiche pas.
          const desactivePendantVol = depart.optIn && !etatSuiviRef.current.optIn;
          let miseAJour = resultat.miseAJour;
          if (desactivePendantVol) {
            const reste: MiseAJourSuivi = { ...miseAJour };
            delete reste.optIn;
            delete reste.etatMoteur;
            miseAJour = reste;
          }
          appliquerSuivi(miseAJour);
          const afficherGuide = resultat.afficherGuide && !desactivePendantVol;
          const repris =
            miseAJour.etatMoteur === 'actif' || miseAJour.etatMoteur === 'actif-avant-plan';
          const ecranCible = ecranApresReprise({
            afficherGuide,
            etatMoteurPrecedent: depart.etatMoteur,
            repris,
            ecranCourant: ecranRef.current,
            guideAutoAffiche: guideAutoAfficheRef.current,
          });
          if (ecranCible !== ecranRef.current) {
            if (afficherGuide) {
              // Mémorise l'écran d'ORIGINE : « Retour » du guide y revient.
              origineGuideRef.current = ecranRef.current;
              guideAutoAfficheRef.current = true;
            } else {
              // Fermeture automatique : le guide n'est plus « auto ».
              guideAutoAfficheRef.current = false;
            }
            appliquer({ ecran: ecranCible });
          }
        })
        .finally(() => {
          repriseEnCours.current = false;
        });
    });
    return () => abonnement.remove();
  }, [portsSuivi, appliquerSuivi, appliquer]);

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
    [appliquer, ports],
  );

  const onActualiser = useCallback(async () => {
    if (!tokenRef.current) {
      return;
    }
    appliquer({ ecran: 'chargement' });
    appliquer(await chargerDossierOrchestre(ports, tokenRef.current));
  }, [appliquer, ports]);

  const onVoirEdossard = useCallback(async () => {
    if (etat.edossard) {
      appliquer({ ecran: 'edossard' });
      return;
    }
    if (tokenRef.current) {
      appliquer({ ecran: 'chargement' });
      appliquer(await chargerDossierOrchestre(ports, tokenRef.current));
    }
  }, [appliquer, ports, etat.edossard]);

  const onRevoirDossier = useCallback(async () => {
    if (etat.dossier) {
      appliquer({ ecran: 'dossier' });
      return;
    }
    if (tokenRef.current) {
      appliquer({ ecran: 'chargement' });
      appliquer(await chargerDossierOrchestre(ports, tokenRef.current));
    }
  }, [appliquer, ports, etat.dossier]);

  const onVoirSuivi = useCallback(() => {
    appliquer({ ecran: 'suivi' });
    rafraichirAttente();
  }, [appliquer, rafraichirAttente]);

  const onToggleOptin = useCallback(
    async (actif: boolean) => {
      // 6.4 (revue) — écran capturé AVANT l'attente du basculement : si la
      // navigation a changé pendant celle-ci (ex. guide auto 6.3 au retour au
      // premier plan), elle PRIME — pas de navigation vers la rubrique.
      const ecranAuToggle = ecranRef.current;
      const maj = await basculerOptin(portsSuivi, actif);
      appliquerSuivi(maj);
      // 6.4 — activation RÉUSSIE : navigation auto vers la rubrique batterie
      // (pédagogie au point d'usage) ; désactivation/échec : rien.
      if (
        ecranApresBasculeOptin(maj) === 'batterie' &&
        ecranRef.current === ecranAuToggle
      ) {
        origineBatterieRef.current = ecranRef.current;
        appliquer({ ecran: 'batterie' });
      }
    },
    [portsSuivi, appliquerSuivi, appliquer],
  );

  const onVoirJournal = useCallback(() => {
    appliquerSuivi(lireJournalSuivi(portsSuivi));
    appliquer({ ecran: 'journal-sync' });
  }, [appliquer, appliquerSuivi, portsSuivi]);

  // 6.3 — guide permission accessible EN PERMANENCE depuis le suivi :
  // ouvert par bouton → jamais refermé automatiquement, retour au suivi.
  const onVoirGuide = useCallback(() => {
    origineGuideRef.current = 'suivi';
    guideAutoAfficheRef.current = false;
    appliquer({ ecran: 'guide-permission' });
  }, [appliquer]);

  // 6.4 — rubrique batterie accessible EN PERMANENCE depuis Suivi et
  // e-dossard (suivi désactivé compris) : l'écran d'origine est mémorisé
  // pour le Retour.
  const onVoirBatterie = useCallback(() => {
    origineBatterieRef.current = ecranRef.current;
    appliquer({ ecran: 'batterie' });
  }, [appliquer]);

  const onDeconnexion = useCallback(async () => {
    if (tokenRef.current) {
      // Révocation serveur best effort : même sans réseau, le logout local
      // purge token ET caches (l'e-dossard ne doit plus vivre sur l'appareil).
      await creerClientApi({ token: tokenRef.current }).deconnexion().catch(() => {});
    }
    // La sync en vol est invalidée AVANT la purge : un jeton appareil qui
    // arriverait après ne sera jamais écrit (garde par génération).
    generationSession.current += 1;
    const resultatSuivi = await deconnecterSuivi(portsSuivi);
    appliquerSuivi(resultatSuivi.miseAJour);
    setErreurDeconnexion(resultatSuivi.erreur);
    await purgerAuth();
    appliquer({
      ecran: 'connexion',
      token: null,
      sessionExpiree: false,
      dossier: null,
      edossard: null,
      depuisCache: false,
    });
  }, [appliquer, appliquerSuivi, portsSuivi]);

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
          messageDeconnexion={erreurDeconnexion}
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
          onVoirSuivi={onVoirSuivi}
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
          onVoirSuivi={onVoirSuivi}
          onVoirBatterie={onVoirBatterie}
          onDeconnexion={() => {
            void onDeconnexion();
          }}
        />
      ) : null}
      {ecran === 'suivi' ? (
        <EcranSuivi
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          optIn={etatSuivi.optIn}
          etatMoteur={etatSuivi.etatMoteur}
          enAttente={etatSuivi.enAttente}
          erreurOptin={etatSuivi.erreurOptin}
          onToggleOptIn={(actif: boolean) => {
            void onToggleOptin(actif);
          }}
          onVoirJournal={onVoirJournal}
          onVoirGuide={onVoirGuide}
          onVoirBatterie={onVoirBatterie}
          onRetour={() => {
            appliquer({ ecran: edossard ? 'edossard' : dossier ? 'dossier' : 'hors-ligne' });
          }}
        />
      ) : null}
      {ecran === 'guide-permission' ? (
        <EcranGuidePermission
          theme={theme}
          onRetour={() => {
            guideAutoAfficheRef.current = false;
            // Retour à l'écran d'origine mémorisé à l'ouverture (auto :
            // écran au moment du piège ; bouton : suivi).
            appliquer({ ecran: origineGuideRef.current });
          }}
        />
      ) : null}
      {ecran === 'journal-sync' ? (
        <EcranJournalSync
          theme={theme}
          entrees={etatSuivi.journal}
          onRetour={() => {
            appliquer({ ecran: 'suivi' });
          }}
        />
      ) : null}
      {ecran === 'batterie' ? (
        <EcranBatterie
          theme={theme}
          telephone={ASSISTANCE_PHONE}
          onRetour={() => {
            // Retour à l'écran d'origine mémorisé à l'ouverture (Suivi,
            // e-dossard, ou Suivi pour la navigation auto de l'activation).
            appliquer({ ecran: origineBatterieRef.current });
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
