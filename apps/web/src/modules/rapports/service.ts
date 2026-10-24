import type { ClassementsEdition } from '@azzel/shared';

import {
  COUREUR_STATUSES,
  COUREUR_STATUS_LABELS,
  type CoureurStatus,
} from '@/modules/inscriptions/domain';
import type { SessionRecord } from '@/modules/iam/store';

import { LIBELLES_MOTIF_ABANDON, type MotifAbandon } from '@/modules/chrono/domain';
import { versClassements } from '@/modules/chrono/service';

import {
  MENTION_ZERO_STOCK,
  construireCsv,
  dateCivileAlger,
  formaterHorodatageRapport,
  formaterTempsRapport,
  lignesCommande,
  type SectionCsv,
} from './domain';
import type { RapportRecord, RapportsStore } from './store';
import { getRapportsStore } from './store';

// Story 7.4 — service rapports : compose les DEUX fichiers de l'organisation
// de session (rapport post-course FR-26, export commande J-10) au-dessus de
// la lecture UNIQUE du store (NFR-4) et des classements 7.1 repris TELS QUELS
// (versClassements : rangs ex æquo et temps OFFICIELS, jamais recalculés).
// Les CSV ne portent QUE des dossards — l'auteur d'un abandon est un
// organisateur, son email reste (auditabilité 5.3).

export interface RapportsServiceDeps {
  store?: RapportsStore;
}

/** Fichier prêt à servir : nom daté + contenu CSV complet (BOM inclus). */
export interface FichierRapport {
  nomFichier: string;
  contenu: string;
}

const RAPPORT_SLUG_SANS_EDITION = 'aucune-edition';

/**
 * Préfixe du nom de fichier : azzel-{rapport-post-course|commande}-{edition}-
 * {date}.csv — la date est CIVILE, lue en Africa/Algiers (calque
 * dateAujourdhui du rappel J-7 : le fichier porte le jour que vit
 * l'organisateur, pas celui du serveur).
 */
function nomFichier(nature: 'rapport-post-course' | 'commande', slugEdition: string): string {
  return `azzel-${nature}-${slugEdition}-${dateCivileAlger(new Date())}.csv`;
}

/**
 * En-tête du fichier : « Généré le … — fraîcheur des données : … », heures
 * lues en Africa/Algiers. Un seul instant (genereA) fonde le calcul
 * classements ET cette ligne — le fichier ne se contredit jamais.
 */
function enTeteCsv(genereA: Date, fraicheur: Date | null): string {
  return `Généré le ${formaterHorodatageRapport(genereA)} — fraîcheur des données : ${
    fraicheur === null ? 'aucune donnée reçue' : formaterHorodatageRapport(fraicheur)
  }`;
}

function statutLabel(statut: string): string {
  return COUREUR_STATUS_LABELS[statut as CoureurStatus] ?? statut;
}

function motifLabel(motif: string): string {
  return LIBELLES_MOTIF_ABANDON[motif as MotifAbandon] ?? motif;
}

/** Synthèse : inscrits total + par statut, présents/retraits, partants/arrivées/abandons par épreuve. */
function sectionSynthese(record: RapportRecord, classements: ClassementsEdition): SectionCsv {
  const parStatut = new Map(record.inscritsParStatut.map((row) => [row.statut, row.total]));
  const inscritsTotal = record.inscritsParStatut.reduce((somme, row) => somme + row.total, 0);

  const lignes: SectionCsv['lignes'] = [
    ['Édition', record.edition?.nom ?? '—'],
    ['Inscrits (total)', inscritsTotal],
    ...COUREUR_STATUSES.map(
      (statut) => [`Inscrits — ${statutLabel(statut)}`, parStatut.get(statut) ?? 0],
    ),
    ['Retraits (présents au départ)', record.retraits],
  ];
  for (const epreuve of classements.epreuves) {
    lignes.push([`Partants — ${epreuve.epreuveNom}`, epreuve.lignes.length]);
    lignes.push([
      `Arrivées — ${epreuve.epreuveNom}`,
      epreuve.lignes.filter((ligne) => ligne.statut === 'arrivé').length,
    ]);
    lignes.push([
      `Abandons — ${epreuve.epreuveNom}`,
      epreuve.lignes.filter((ligne) => ligne.statut === 'abandonné').length,
    ]);
  }
  return { titre: 'Synthèse', lignes };
}

/** Arrivées avec rang/temps : les lignes « arrivé » des classements 7.1 servis. */
function sectionArrivees(classements: ClassementsEdition): SectionCsv {
  const lignes: SectionCsv['lignes'] = [['Épreuve', 'Dossard', 'Rang', 'Temps']];
  for (const epreuve of classements.epreuves) {
    for (const ligne of epreuve.lignes) {
      if (ligne.statut !== 'arrivé') {
        continue;
      }
      // Temps repris TEL QUEL du calcul 7.1 : HH:MM:SS, « — » si l'épreuve
      // n'a pas d'heure de départ (jamais de temps faux à zéro).
      lignes.push([
        epreuve.epreuveNom,
        ligne.dossard,
        ligne.rang ?? '—',
        formaterTempsRapport(ligne.tempsMs),
      ]);
    }
  }
  return { titre: 'Arrivées', lignes };
}

/**
 * Rapport post-course (FR-26) : UN fichier unique à sections — synthèse,
 * passages par checkpoint, arrivées (rang/temps 7.1), abandons détaillés 5.3,
 * portée des partages 7.2. Édition vide : sections présentes, zéros lisibles.
 */
export async function genererRapportPostCourse(
  session: SessionRecord,
  deps: RapportsServiceDeps = {},
): Promise<FichierRapport> {
  const store = deps.store ?? getRapportsStore();
  const record = await store.lireRapport(session.organisationId);

  // UN instant partagé : classements calculés UNE fois, la synthèse, les
  // arrivées et l'en-tête « Généré le » décrivent le même moment.
  const genereA = new Date();
  const classements = versClassements(record.classements, genereA);

  const totalVisites = record.visites.reduce((somme, jour) => somme + jour.visites, 0);
  const sections: SectionCsv[] = [
    sectionSynthese(record, classements),
    {
      titre: 'Passages par checkpoint',
      lignes: [
        ['Checkpoint', 'Secteur', 'Coureurs passés'],
        ...record.checkpoints.map((checkpoint) => [
          checkpoint.titre,
          checkpoint.secteurNom,
          checkpoint.passes,
        ]),
      ],
    },
    sectionArrivees(classements),
    {
      titre: 'Abandons',
      lignes: [
        ['Épreuve', 'Dossard', 'Lieu', 'Motif', 'Heure', 'Auteur'],
        ...record.abandons.map((abandon) => [
          abandon.epreuveNom ?? '—',
          abandon.dossard ?? '—',
          abandon.lieu,
          motifLabel(abandon.motif),
          formaterHorodatageRapport(abandon.horodatage),
          abandon.auteurEmail,
        ]),
      ],
    },
    {
      titre: 'Portée des partages',
      lignes: [
        ['Jour', 'Visites'],
        ...record.visites.map((visite) => [visite.jour, visite.visites]),
        ['Total', totalVisites],
      ],
    },
  ];

  return {
    nomFichier: nomFichier('rapport-post-course', record.edition?.slug ?? RAPPORT_SLUG_SANS_EDITION),
    contenu: construireCsv(sections, enTeteCsv(genereA, record.classements.fraicheur)),
  };
}

/**
 * Export « commande » (processus J-10) : validés par épreuve × taille,
 * totaux t-shirts toutes tailles, médailles (1 par coureur validé par
 * épreuve) + total, mention zéro stock. Les « en constitution » n'y
 * commandent rien — la lecture du store ne part QUE des VALIDÉS.
 */
export async function genererCommande(
  session: SessionRecord,
  deps: RapportsServiceDeps = {},
): Promise<FichierRapport> {
  const store = deps.store ?? getRapportsStore();
  const record = await store.lireRapport(session.organisationId);

  const genereA = new Date();
  const classements = versClassements(record.classements, genereA);
  // Jointure par SLUG (jamais par nom : deux épreuves homonymes de la même
  // édition ne fusionnent pas) — l'epreuveSlug du store est consommé ici.
  const commande = lignesCommande({
    epreuves: classements.epreuves.map((epreuve) => ({
      slug: epreuve.epreuveSlug,
      nom: epreuve.epreuveNom,
    })),
    decomptes: record.validesParTaille.map((valide) => ({
      epreuveSlug: valide.epreuveSlug,
      taille: valide.taille,
      total: valide.total,
    })),
  });

  const sections: SectionCsv[] = [
    {
      titre: 'Commande t-shirts par épreuve et taille (validés)',
      lignes: commande.tshirts,
    },
    { titre: 'Médailles par épreuve', lignes: commande.medailles },
    { titre: 'Zéro stock', lignes: [[MENTION_ZERO_STOCK]] },
  ];

  return {
    nomFichier: nomFichier('commande', record.edition?.slug ?? RAPPORT_SLUG_SANS_EDITION),
    contenu: construireCsv(sections, enTeteCsv(genereA, record.classements.fraicheur)),
  };
}

/** État de la page /admin/rapports : édition courante (note J-10 dérivée). */
export interface EtatRapports {
  edition: { nom: string; slug: string; raceDate: string } | null;
}

/**
 * Lecture légère pour la page : édition courante seule (nom, slug, date de
 * course ISO) — la note J-10 s'en dérive (− 10 jours) sans payer le rapport.
 * Sans édition : null (note générique, jamais une erreur).
 */
export async function getEtatRapports(
  session: SessionRecord,
  deps: RapportsServiceDeps = {},
): Promise<EtatRapports> {
  const store = deps.store ?? getRapportsStore();
  const edition = await store.lireEdition(session.organisationId);
  return {
    edition:
      edition === null
        ? null
        : {
            nom: edition.nom,
            slug: edition.slug,
            raceDate: edition.raceDate.toISOString(),
          },
  };
}
