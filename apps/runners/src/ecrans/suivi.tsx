import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { INTERVALLE_POSITION_MS } from '@azzel/shared';

import type { AppTheme } from '../theme';
import type { EtatSuivi } from '../tracking/moteur';
import { Bouton, BoutonAssistance, Carte, Surtitre, Titre } from './ui';

// Story 6.2 — écran Suivi : activation EXPLICITE du suivi GPS (toggle —
// opt-in, jamais pré-coché). Désactivé = littéralement rien : aucun watcher,
// aucune insertion, aucune requête — le texte « Désactivé : rien n'est
// enregistré » est VRAI (garanti par le moteur, testé). Bandeau sync
// « ◷ N positions en attente » → « ✓ envoyés — file : 0 », cliquable →
// journal ; des positions en attente restent visibles même désactivé
// (elles attendent la réactivation pour partir). Permission refusée :
// suivi silencieusement inactif, aucune culpabilisation. Avant-plan seul :
// texte honnête sur ce qui est réellement capturé.
// Story 6.3 — état « interrompu » (piège « Autoriser une fois » : phrase
// factuelle, jamais culpabilisante) + bouton PERMANENT vers le guide
// « Comment garder mon suivi actif ? » — même quand tout va bien.
// Story 6.4 — bouton PERMANENT vers la rubrique batterie « Préparer ma
// batterie pour le jour J » (suivi désactivé compris).

/** Intervalle lisible par un humain (7 min — constante shared, jamais durcie ici). */
const MINUTES_INTERVALLE = Math.round(INTERVALLE_POSITION_MS / 60_000);

/**
 * 10.2 — libellé d'état en tête d'écran : les quatre états vécus par le
 * coureur, en toutes lettres (jamais la couleur seule). « En pause » =
 * permission refusée (le suivi repart tout seul une fois autorisée) ;
 * « interrompu » = piège iOS « Autoriser une fois ». Avant-plan seul :
 * honnête sur ce qui est réellement capturé.
 */
export function libelleEtatSuivi(optIn: boolean, etatMoteur: EtatSuivi): string {
  if (!optIn) {
    return 'Suivi désactivé';
  }
  switch (etatMoteur) {
    case 'interrompu':
      return 'Suivi interrompu';
    case 'permission-refusee':
      return 'Suivi en pause';
    case 'actif-avant-plan':
      return 'Suivi activé (app ouverte)';
    default:
      return 'Suivi activé';
  }
}

export interface PropsEcranSuivi {
  theme: AppTheme;
  telephone: string;
  optIn: boolean;
  etatMoteur: EtatSuivi;
  enAttente: number;
  /** Échec de mémorisation du choix (stockage refusé) — affiché en toutes lettres. */
  erreurOptin: string | null;
  onToggleOptIn: (actif: boolean) => void;
  onVoirJournal: () => void;
  /** 6.3 — accès PERMANENT au guide permission (bouton, même quand tout va bien). */
  onVoirGuide: () => void;
  /** 6.4 — accès PERMANENT à la rubrique batterie (suivi désactivé compris). */
  onVoirBatterie: () => void;
  onRetour: () => void;
}

export function EcranSuivi({
  theme,
  telephone,
  optIn,
  etatMoteur,
  enAttente,
  erreurOptin,
  onToggleOptIn,
  onVoirJournal,
  onVoirGuide,
  onVoirBatterie,
  onRetour,
}: PropsEcranSuivi) {
  const interrompu = optIn && etatMoteur === 'interrompu';
  const permissionRefusee = optIn && etatMoteur === 'permission-refusee';
  const avantPlanSeul = optIn && etatMoteur === 'actif-avant-plan';

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
        {/* 10.2 — l'état du suivi (activé / désactivé / en pause /
            interrompu) est la PREMIÈRE information lisible de l'écran,
            avant le titre : au soleil, sur le sentier, c'est la seule que
            le coureur cherche. Aucune donnée de progression ni de position
            n'existe dans l'état de l'app — on n'en affiche aucune. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: 48 }}>
          <Switch
            accessibilityLabel="Activer le suivi GPS de ma course"
            accessibilityState={{ checked: optIn }}
            value={optIn}
            onValueChange={onToggleOptIn}
            trackColor={{ true: theme.colors.action, false: theme.colors.ink2 }}
            thumbColor={theme.colors.surface}
          />
          <Text
            accessibilityRole="text"
            style={[theme.fonts.bodyLg, { color: theme.colors.ink, flex: 1 }]}
          >
            {libelleEtatSuivi(optIn, etatMoteur)}
          </Text>
        </View>
        <Titre theme={theme}>Ta famille te suit</Titre>

        {optIn ? (
          interrompu ? (
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              Le suivi s’est arrêté quand l’app a été verrouillée — suis le guide pour le reprendre.
            </Text>
          ) : permissionRefusee ? (
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              La localisation n’est pas autorisée sur ce téléphone — le suivi est simplement en
              pause. Tu peux l’autoriser dans les Réglages quand tu veux : il repartira tout seul.
            </Text>
          ) : avantPlanSeul ? (
            <>
              <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
                Le suivi fonctionne quand l’app est ouverte ; écran verrouillé = pas de capture.
              </Text>
              <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
                Pour être suivi en continu, ouvre les Réglages &gt; Azzel &gt; Localisation et
                choisis « Toujours » — le suivi repartra tout seul.
              </Text>
            </>
          ) : (
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              Ta position est partagée toutes les {MINUTES_INTERVALLE} minutes avec une précision
              équilibrée — pour ta sécurité et pour que les proches suivent ta course. Tu peux
              désactiver à tout moment.
            </Text>
          )
        ) : (
          <Text
            accessibilityRole="text"
            style={[theme.fonts.bodyLg, { color: theme.colors.ink }]}
          >
            Désactivé : rien n’est enregistré.
          </Text>
        )}
        {optIn && !interrompu && !permissionRefusee && !avantPlanSeul ? (
          <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
            Aucune position n’est capturée hors de cet intervalle — jamais plus souvent, la
            fréquence est fixe.
          </Text>
        ) : null}
        {erreurOptin !== null ? (
          <Text
            accessibilityRole="alert"
            style={[theme.fonts.body, { color: theme.colors.danger }]}
          >
            {erreurOptin}
          </Text>
        ) : null}
      </Carte>

      {/* Bandeau visible dès qu'il y a une file — même désactivé : les
          positions déjà capturées attendent honnêtement la réactivation. */}
      {optIn || enAttente > 0 ? (
        <BandeauSync
          theme={theme}
          enAttente={enAttente}
          desactive={!optIn}
          onPress={onVoirJournal}
        />
      ) : null}

      <Carte theme={theme}>
        <Surtitre theme={theme}>Ta vie privée</Surtitre>
        <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
          Les positions ne sont visibles que par numéro de dossard — jamais ton nom, ton contact
          ni ta photo. Elles partent uniquement vers l’organisation de la course, par lots, au
          retour du réseau.
        </Text>
      </Carte>

      {/* 6.3 — accès PERMANENT au guide : même quand tout va bien, même
          désactivé (savoir AVANT la course comment garder le suivi actif). */}
      <Bouton
        theme={theme}
        label="Comment garder mon suivi actif ?"
        variante="contour"
        onPress={onVoirGuide}
      />

      {/* 6.4 — accès PERMANENT à la rubrique batterie : les conseils valent
          avant l'activation aussi (départ à 100 %, powerbank…). */}
      <Bouton
        theme={theme}
        label="Préparer ma batterie pour le jour J"
        variante="contour"
        onPress={onVoirBatterie}
      />

      <Bouton theme={theme} label="Retour" variante="contour" onPress={onRetour} />
      <BoutonAssistance theme={theme} telephone={telephone} />
    </ScrollView>
  );
}

/** Bandeau sync : « ◷ N en attente » → « ✓ envoyés — file : 0 » (cliquable → journal). */
export function BandeauSync({
  theme,
  enAttente,
  desactive = false,
  onPress,
}: {
  theme: AppTheme;
  enAttente: number;
  /** Suivi désactivé : la file attend la réactivation pour partir. */
  desactive?: boolean;
  onPress: () => void;
}) {
  const enFile = enAttente > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        enFile
          ? desactive
            ? `${enAttente} positions attendent la réactivation du suivi pour partir — voir le journal`
            : `${enAttente} positions en attente d’envoi — voir le journal`
          : 'Toutes les positions sont envoyées — voir le journal'
      }
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: enFile ? theme.colors.syncPending : theme.colors.syncSent,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3],
          opacity: pressed ? 0.8 : 1,
          minHeight: 48,
          justifyContent: 'center',
        },
      ]}
    >
      <Text
        style={[
          theme.fonts.metaLg,
          { color: enFile ? theme.colors.syncPendingInk : theme.colors.syncSentInk },
        ]}
      >
        {enFile
          ? desactive
            ? `◷ ${enAttente} position${enAttente > 1 ? 's' : ''} attend${enAttente > 1 ? 'ent' : ''} la réactivation du suivi pour partir`
            : `◷ ${enAttente} position${enAttente > 1 ? 's' : ''} en attente`
          : '✓ envoyés — file : 0'}
      </Text>
    </Pressable>
  );
}
