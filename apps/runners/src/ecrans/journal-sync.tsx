import { ScrollView, Text, View } from 'react-native';
import { formatLocalDateTime } from '@azzel/shared';

import type { AppTheme } from '../theme';
import type { EntreeJournalSync } from '../tracking/outbox-sqlite';
import { Bouton, Carte, Surtitre, Titre } from './ui';

// Story 6.2 — journal sync (lecture seule) : chaque envoi par lots y laisse
// une entrée — envoyés, déjà connus, rejets motivés, offset horloge moyen.
// Horodatages stockés ISO UTC, affichés en HEURE LOCALE. Borné à 100 entrées
// côté outbox — les plus anciennes sautent.

export interface PropsEcranJournal {
  theme: AppTheme;
  entrees: EntreeJournalSync[];
  onRetour: () => void;
}

export function EcranJournalSync({ theme, entrees, onRetour }: PropsEcranJournal) {
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
        <Titre theme={theme}>Journal des envois</Titre>
        <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
          {entrees.length === 0
            ? 'Aucun envoi pour le moment — dès que le réseau revient, les positions en attente partent et l’envoi apparaît ici.'
            : 'Chaque envoi réussi laisse une trace ici : positions parties, déjà connues du serveur, refusées, et l’écart d’horloge estimé.'}
        </Text>
      </Carte>

      {entrees.map((entree) => (
        <Carte key={entree.id} theme={theme}>
          <Text style={[theme.fonts.metaLg, { color: theme.colors.ink }]}>
            {formatLocalDateTime(entree.horodatage)}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing[4] }}>
            <Text style={[theme.fonts.body, { color: theme.colors.success }]}>
              ✓ {entree.envoyes}
            </Text>
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              ≡ {entree.dejaConnus}
            </Text>
            <Text style={[theme.fonts.body, { color: theme.colors.danger }]}>
              ✕ {entree.rejetes}
            </Text>
          </View>
          {entree.motifs.length > 0 ? (
            <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
              Rejets : {entree.motifs.join(', ')}
            </Text>
          ) : null}
          {entree.offsetMoyenMs !== null ? (
            <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
              Horloge : {formaterOffset(entree.offsetMoyenMs)}
            </Text>
          ) : null}
        </Carte>
      ))}

      <Bouton theme={theme} label="Retour au suivi" variante="contour" onPress={onRetour} />
    </ScrollView>
  );
}

/** Offset ms lisible : « +2 s », « −450 ms » — jamais un brut technique. */
function formaterOffset(offsetMs: number): string {
  const signe = offsetMs >= 0 ? '+' : '−';
  const abs = Math.abs(offsetMs);
  if (abs >= 60_000) {
    return `${signe}${Math.round(abs / 60_000)} min`;
  }
  if (abs >= 1_000) {
    return `${signe}${Math.round(abs / 100) / 10} s`;
  }
  return `${signe}${abs} ms`;
}
