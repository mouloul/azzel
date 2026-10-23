import { COUREUR_STATUS_VALIDE } from '@/modules/inscriptions/domain';
import type { InscriptionsStore } from '@/modules/inscriptions/store';

import type { OutboxStore } from './outbox-store';

// Story 6.4 — planification du rappel batterie J-7. Le déclenchement reste un
// cron VPS externe (`emails:j7`, comme `emails:send`) : aucune horloge interne.
// Fenêtre « J-7 ≤ aujourd'hui < jour de course » : le rattrapage est inclus —
// un cron qui a raté le jour J-7 enfile dès son prochain passage, tant que la
// course n'a pas eu lieu. L'idempotence est portée par l'index unique partiel
// (migration 0032, scopé par édition via payload->>'dateCourse') : un rejeu ne
// double JAMAIS l'envoi, mais deux saisons distinctes rappellent chacune.

const JOUR_MS = 86_400_000;

/** Jours avant la course où le rappel devient dû (nommé : la fenêtre s'en lit). */
export const RAPPEL_J7_JOURS = 7;

/** Garde anti-boucle : plafond de pages coureurs par organisation (100 × 200 = 20 000). */
export const MAX_PAGES_COUREURS_J7 = 100;

/**
 * Date civile du jour au format `YYYY-MM-DD` en fuseau `Africa/Algiers` (la
 * course se court en Algérie : « aujourd'hui » y est lu, pas en UTC). Repli
 * UTC si Intl est indisponible (environnement exotique).
 */
export function dateAujourdhui(): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function versUtcMs(dateIso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (match === null) {
    return null;
  }
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(ms)) {
    return null;
  }
  // Aller-retour : Date.UTC fait glisser les dates inexistantes (2027-02-31
  // devient le 3 mars) — la chaîne re-formatée doit être identique, sinon la
  // date n'existe pas.
  return new Date(ms).toISOString().slice(0, 10) === dateIso ? ms : null;
}

/**
 * Fenêtre J-7 (pure, testée) : vrai ssi `J-7 ≤ aujourd'hui < jour de course`.
 * Comparaison de dates civiles, sans fuseau — une date invalide (y compris
 * inexistantes comme 2027-02-31) n'est jamais dans la fenêtre.
 */
export function estDansFenetreJ7(aujourdhui: string, dateCourse: string): boolean {
  const aujourdhuiMs = versUtcMs(aujourdhui);
  const courseMs = versUtcMs(dateCourse);
  if (aujourdhuiMs === null || courseMs === null) {
    return false;
  }
  return aujourdhuiMs >= courseMs - RAPPEL_J7_JOURS * JOUR_MS && aujourdhuiMs < courseMs;
}

/** Résumé d'un passage de planification (affiché par le CLI `emails:j7`). */
export interface ResumeRappelsJ7 {
  /** Organisations examinées. */
  organisations: number;
  /** Éditions courantes dans la fenêtre J-7. */
  organisationsDansFenetre: number;
  /** Lignes insérées (coureurs validés non encore notifiés). */
  enfiles: number;
  /** Inserts résorbés par l'index unique partiel (rejeu/rattrapage : jamais doublés). */
  dejaEnfiles: number;
  /** Organisations dont l'édition courante est hors fenêtre (avant J-7, course passée). */
  horsFenetre: number;
  /** Erreurs accumulées (une organisation malade n'arrête pas la boucle). */
  erreur: string | null;
}

export interface DepsRappelsJ7 {
  outbox: Pick<OutboxStore, 'listOrganisationIds' | 'insertRappelJ7'>;
  inscriptions: Pick<InscriptionsStore, 'findCurrentEdition' | 'listCoureurs'>;
}

/**
 * Enfile le rappel J-7 pour chaque coureur VALIDÉ de l'édition courante de
 * chaque organisation, uniquement dans la fenêtre `J-7 ≤ aujourd'hui < course`.
 * Les coureurs sont paginés (tant que `hasMore`) : au-delà d'une page, les
 * validés les plus anciens reçoivent eux aussi le rappel. Best effort par
 * organisation (worker-like) : les erreurs sont accumulées, jamais jetées.
 */
export async function planifierRappelsJ7(
  deps: DepsRappelsJ7,
  aujourdhui: string = dateAujourdhui(),
): Promise<ResumeRappelsJ7> {
  const resume: ResumeRappelsJ7 = {
    organisations: 0,
    organisationsDansFenetre: 0,
    enfiles: 0,
    dejaEnfiles: 0,
    horsFenetre: 0,
    erreur: null,
  };
  const erreurs: string[] = [];
  let organisationIds: string[];
  try {
    organisationIds = await deps.outbox.listOrganisationIds();
  } catch (error) {
    resume.erreur = error instanceof Error ? error.message : String(error);
    console.error('[rappel-j7] lecture des organisations impossible :', error);
    return resume;
  }
  for (const organisationId of organisationIds) {
    resume.organisations += 1;
    let dateCourse: string;
    let editionId: string;
    try {
      const edition = await deps.inscriptions.findCurrentEdition(organisationId);
      if (edition === null) {
        continue;
      }
      if (!estDansFenetreJ7(aujourdhui, edition.dateCourse)) {
        resume.horsFenetre += 1;
        continue;
      }
      dateCourse = edition.dateCourse;
      editionId = edition.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      erreurs.push(`${organisationId} (édition) : ${message}`);
      console.error('[rappel-j7] édition courante illisible pour %s :', organisationId, error);
      continue;
    }
    resume.organisationsDansFenetre += 1;
    try {
      // Pagination : tant que hasMore, la page suivante est lue (offset =
      // coureurs déjà vus). Gardes anti-boucle : une page VIDE n'avance pas
      // (un store mentant sur hasMore ne pend pas le cron) et un plafond de
      // pages borne le passage.
      let offset = 0;
      let hasMore = true;
      let pages = 0;
      while (hasMore && pages < MAX_PAGES_COUREURS_J7) {
        pages += 1;
        const page = await deps.inscriptions.listCoureurs({
          organisationId,
          editionId,
          offset,
        });
        for (const coureur of page.items) {
          if (coureur.status !== COUREUR_STATUS_VALIDE) {
            continue;
          }
          if (coureur.email === '') {
            console.warn(
              '[rappel-j7] coureur %s sans email : rappel non enfilé',
              coureur.coureurId,
            );
            continue;
          }
          const insere = await deps.outbox.insertRappelJ7(organisationId, {
            destinataire: coureur.email,
            payload: { prenom: coureur.prenom, dateCourse },
          });
          if (insere) {
            resume.enfiles += 1;
          } else {
            resume.dejaEnfiles += 1;
          }
        }
        hasMore = page.hasMore;
        if (page.items.length === 0) {
          break;
        }
        offset += page.items.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      erreurs.push(`${organisationId} (coureurs) : ${message}`);
      console.error('[rappel-j7] coureurs illisibles pour %s :', organisationId, error);
    }
  }
  resume.erreur = erreurs.length > 0 ? erreurs.join(' ; ') : null;
  return resume;
}
