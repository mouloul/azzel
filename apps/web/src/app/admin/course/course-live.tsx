'use client';

import { formatLocalTime } from '@azzel/shared';
import { useCallback, useEffect, useState } from 'react';

import {
  LIBELLE_ABANDON_A_VENIR,
  LIBELLE_CONTACT_NON_RENSEIGNE,
  NOTE_SANS_ALERTE,
  lienAppelerSecteur,
  libelleAlerte,
  libelleDepuisAttente,
  libelleDepuisBarriere,
  trierAlertesCourse,
} from '@/lib/course/alertes-course';
import {
  appliquerResultatPolling,
  interpreterReponseEtat,
  libelleEtatCourse,
  type EtatPolling,
} from '@/lib/course/fraicheur-course';
import type { EtatCourse } from '@/modules/chrono/service';

// Story 5.1 — tableau de bord live du PC course (UX-DR-12, NFR-5) : état
// initial SSR en props, puis polling 5 s de GET /api/admin/course/etat. Mise
// à jour d'état SANS rechargement ni flash (setState ciblé, aucune animation —
// prefers-reduced-motion respecté par construction). Onglet caché : polling ET
// horloge en pause, reprise immédiate au retour (visibilitychange). Réseau
// dégradé : le dernier état RESTE affiché, sa fraîcheur vieillit, un point
// « reconnexion… » discret apparaît — jamais d'écran vide.

const POLLING_MS = 5_000;
const HORLOGE_MS = 1_000;
const TIMEOUT_FETCH_MS = 10_000;
/** Heure de board avant le montage client (jamais l'heure du serveur). */
const HEURE_ATTENTE = '--:--:--';

function totalPartants(etat: EtatCourse): number {
  return etat.partants.reduce((total, epreuve) => total + epreuve.total, 0);
}

function Carte({
  chiffre,
  titre,
  note,
  children,
}: {
  chiffre: number;
  titre: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="course-carte">
      <p className="course-carte-chiffre">{chiffre}</p>
      <p className="course-carte-titre">{titre}</p>
      {note !== undefined && <p className="course-carte-note">{note}</p>}
      {children}
    </div>
  );
}

/** Rendu pur (testé en SSR) : cartes, fraîcheur, boards UX-DR-12. */
export function VueCourse({
  etat,
  enEchec,
  maintenant,
}: {
  etat: EtatCourse;
  enEchec: boolean;
  /** Horloge de rendu — null côté serveur (fraîcheur initiale à ~0 s). */
  maintenant: Date | null;
}) {
  const horloge = maintenant ?? new Date(etat.genereA);
  return (
    <div className="course-live">
      {/* NFR-5 + a11y : l'âge chiffré est aria-hidden et se met à jour en
          silence (toutes les secondes — jamais annoncé au lecteur d'écran) ;
          la zone role="status" n'existe que pour la TRANSITION réseau, son
          apparition/disparition est la seule chose annoncée. */}
      <p className="course-fraicheur">
        <span className="course-fraicheur-age" aria-hidden="true" suppressHydrationWarning>
          {libelleEtatCourse(etat, horloge)}
        </span>
        {enEchec ? (
          <span className="course-reconnexion" role="status">
            · reconnexion…
          </span>
        ) : null}
      </p>

      <div className="course-cartes">
        <Carte chiffre={etat.retraits} titre="Retraits" />
        <Carte chiffre={totalPartants(etat)} titre="Partants">
          <ul className="course-partants">
            {etat.partants.map((epreuve) => (
              <li key={epreuve.epreuveId}>
                <span>{epreuve.epreuveNom}</span>
                <span className="course-partants-nombre">{epreuve.total}</span>
              </li>
            ))}
          </ul>
        </Carte>
        <Carte chiffre={etat.enCourse} titre="En course" />
        <Carte
          chiffre={etat.arrives}
          titre="Arrivés"
          note={etat.arriveeDefinie ? undefined : 'aucun checkpoint d’arrivée défini'}
        />
        <Carte
          chiffre={etat.abandones}
          titre="Abandonnés"
          note={etat.abandones === 0 ? 'saisie des abandons à venir' : undefined}
        />
      </div>

      {/* Story 5.2 — bloc alertes hors-délais (UX-DR-12) : clignotement CSS
          borné 1 flash/s, désactivé sous prefers-reduced-motion — le texte
          intégral porte l'alerte dans tous les cas. L'heure locale de la
          barrière suit le calque board : emplacement avant montage, heure
          client ensuite (aucun écart de fuseau masqué par l'hydratation).
          Vide : bloc ABSENT, note discrète à la place (l'alerte batterie
          n'existe pas avant le suivi GPS des coureurs). */}
      {etat.alertes.length > 0 ? (
        <section className="course-alertes" aria-labelledby="course-alertes-titre">
          <h2 className="course-alertes-titre" id="course-alertes-titre">
            Alertes hors-délais ({etat.alertes.length})
          </h2>
          <ul className="course-alertes-liste">
            {trierAlertesCourse(etat.alertes).map((alerte) => {
              const lien = lienAppelerSecteur(alerte.contactSecteur);
              return (
                <li
                  className="course-alerte"
                  key={`${alerte.dossard}-${alerte.checkpointId}`}
                >
                  <p className="course-alerte-texte">
                    {libelleAlerte(
                      alerte,
                      maintenant === null
                        ? libelleDepuisAttente()
                        : libelleDepuisBarriere(alerte.barriereLe),
                    )}
                  </p>
                  <div className="course-alerte-actions">
                    {lien !== null ? (
                      <a className="btn-lien" href={lien}>
                        Appeler le secteur
                      </a>
                    ) : (
                      <span className="course-alerte-inactif">{LIBELLE_CONTACT_NON_RENSEIGNE}</span>
                    )}
                    <button type="button" className="btn-lien" disabled>
                      {LIBELLE_ABANDON_A_VENIR}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="course-sans-alerte">{NOTE_SANS_ALERTE}</p>
      )}

      <div className="course-boards">
        {etat.checkpoints.length === 0 ? (
          <p className="hint">
            Aucun checkpoint sur cette édition — crée des missions « Scan
            checkpoint » pour voir les passages.
          </p>
        ) : (
          etat.checkpoints.map((checkpoint) => (
            <section
              className="course-board"
              key={checkpoint.id}
              aria-labelledby={`board-${checkpoint.id}`}
            >
              <h2 className="course-board-titre" id={`board-${checkpoint.id}`}>
                {checkpoint.titre}
                {checkpoint.estArrivee ? ' — arrivée' : ''}
              </h2>
              {checkpoint.passages.length === 0 ? (
                <p className="course-board-vide">En attente du premier passage…</p>
              ) : (
                <ul className="course-board-liste">
                  {checkpoint.passages.map((passage) => (
                    <li
                      className="course-board-ligne"
                      key={`${passage.dossard}-${passage.horodatageReception}`}
                    >
                      <span className="course-dossard">{passage.dossard}</span>
                      {/* Heure CLIENT-ONLY (calque de l'horloge fraîcheur) :
                          le serveur rend un emplacement, l'heure locale n'est
                          calculée qu'après montage — aucun écart de fuseau
                          masqué par l'hydratation. */}
                      <span className="course-heure">
                        {maintenant === null
                          ? HEURE_ATTENTE
                          : formatLocalTime(passage.horodatageReception)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export function CourseLive({ etatInitial }: { etatInitial: EtatCourse }) {
  const [polling, setPolling] = useState<EtatPolling>({ etat: etatInitial, enEchec: false });
  // Horloge de rendu : null côté serveur, posée au montage — aucun libellé de
  // fraîcheur calculé avec l'heure du serveur ne peut mentir à l'hydratation.
  const [maintenant, setMaintenant] = useState<Date | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/course/etat', {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
      });
      if (!response.ok) {
        setPolling((precedent) => appliquerResultatPolling(precedent, { ok: false }));
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      setPolling((precedent) =>
        appliquerResultatPolling(precedent, interpreterReponseEtat(payload)),
      );
    } catch {
      setPolling((precedent) => appliquerResultatPolling(precedent, { ok: false }));
    }
  }, []);

  useEffect(() => {
    setMaintenant(new Date());
    // Onglet caché : les intervals tournent mais les handlers no-op — le
    // polling est EN PAUSE (aucun fetch), l'horloge aussi ; au retour,
    // rafraîchissement IMMÉDIAT (visibilitychange) puis reprise du rythme.
    const tick = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
      }
    };
    const poll = () => {
      if (!document.hidden) {
        void rafraichir();
      }
    };
    const auRetour = () => {
      if (!document.hidden) {
        setMaintenant(new Date());
        void rafraichir();
      }
    };
    const horlogeId = window.setInterval(tick, HORLOGE_MS);
    const pollingId = window.setInterval(poll, POLLING_MS);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.clearInterval(horlogeId);
      window.clearInterval(pollingId);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [rafraichir]);

  return (
    <VueCourse
      etat={polling.etat}
      enEchec={polling.enEchec}
      maintenant={maintenant}
    />
  );
}
