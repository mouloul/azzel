import { ScrollView, Text, View } from 'react-native';
import type { ChecklistState } from '@azzel/shared';

import type { AppTheme } from '../theme';
import { dossierValide, motifRefusDossier } from '../app-state';
import { BandeauHorsLigne, Bouton, BoutonAssistance, Carte, Surtitre, Titre } from './ui';

// Story 6.1 — écran dossier : la checklist telle que le web la rend (mêmes
// pièces, même statut), augmentée du motif de refus éventuel. La couleur ne
// porte jamais seule : chaque pièce affiche « Fait » ou « À faire » en toutes
// lettres. Servi du cache réseau coupé (bandeau).

interface PropsDossier {
  theme: AppTheme;
  telephone: string;
  dossier: ChecklistState;
  depuisCache: boolean;
  onVoirEdossard: () => void;
  onVoirSuivi: () => void;
  onActualiser: () => void;
  onDeconnexion: () => void;
}

export function EcranDossier({
  theme,
  telephone,
  dossier,
  depuisCache,
  onVoirEdossard,
  onVoirSuivi,
  onActualiser,
  onDeconnexion,
}: PropsDossier) {
  const valide = dossierValide(dossier);
  const motifRefus = motifRefusDossier(dossier);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        gap: theme.spacing[4],
        padding: theme.spacing.marginMobile,
      }}
    >
      {depuisCache ? <BandeauHorsLigne theme={theme} /> : null}
      <Carte theme={theme}>
        <Surtitre theme={theme}>Mon dossier</Surtitre>
        <Titre theme={theme}>
          {dossier.edition ? dossier.edition.nom : 'Aucune édition pour le moment'}
        </Titre>
        {valide ? (
          <Text style={[theme.fonts.bodyLg, { color: theme.colors.success }]}>
            ✓ Dossier validé — ton e-dossard est prêt.
          </Text>
        ) : motifRefus !== null ? (
          <Text style={[theme.fonts.bodyLg, { color: theme.colors.danger }]}>
            Dossier refusé : {motifRefus}
          </Text>
        ) : (
          <Text style={[theme.fonts.bodyLg, { color: theme.colors.ink2 }]}>
            Ton e-dossard arrive dès que ton dossier est validé par l’organisation.
          </Text>
        )}
        <View style={{ gap: theme.spacing[2] }}>
          {dossier.pieces.map((piece) => (
            <View
              key={piece.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                minHeight: 48,
                alignItems: 'center',
                gap: theme.spacing[3],
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.fonts.body, { color: theme.colors.ink }]}>
                  {piece.fait ? '✓' : '•'} {piece.libelle}
                </Text>
                {piece.texteSecondaire ? (
                  <Text style={[theme.fonts.meta, { color: theme.colors.ink2 }]}>
                    {piece.texteSecondaire}
                  </Text>
                ) : null}
                {piece.motifRefus ? (
                  <Text style={[theme.fonts.meta, { color: theme.colors.danger }]}>
                    {piece.motifRefus}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  theme.fonts.meta,
                  { color: piece.fait ? theme.colors.success : theme.colors.ink2 },
                ]}
              >
                {piece.fait ? 'Fait' : 'À faire'}
              </Text>
            </View>
          ))}
        </View>
        {dossier.recap ? (
          <View style={{ gap: theme.spacing[1] }}>
            <Text style={[theme.fonts.surtitre, { color: theme.colors.action }]}>Récapitulatif</Text>
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              {dossier.recap.epreuve} · {dossier.recap.distanceKm} km · {dossier.recap.categorieAge}
            </Text>
            <Text style={[theme.fonts.body, { color: theme.colors.ink2 }]}>
              Course le {dossier.recap.dateCourse}
            </Text>
          </View>
        ) : null}
        <Bouton theme={theme} label="Actualiser" variante="contour" onPress={onActualiser} />
      </Carte>
      <Bouton theme={theme} label="Voir mon e-dossard" onPress={onVoirEdossard} />
      <Bouton theme={theme} label="Suivi GPS de ma course" variante="contour" onPress={onVoirSuivi} />
      <Bouton theme={theme} label="Se déconnecter" variante="destructeur" onPress={onDeconnexion} />
      <BoutonAssistance theme={theme} telephone={telephone} />
    </ScrollView>
  );
}
