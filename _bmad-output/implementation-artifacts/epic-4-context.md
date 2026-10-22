# Epic 4 Context: Chronométrage offline & e-dossard

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Dossier validé = e-dossard QR prêt, consultable hors-ligne pendant 30 jours. Les guichets scannent le retrait (~700 le jour J, ~300 en avance) avec voyant doublon ; les scanneurs en zone blanche enregistrent chaque Passage avec confirmation < 1 s (bip + voyant) validée contre l'annuaire local ; la sync par lots idempotente remonte tout au retour du réseau — zéro Passage perdu au soir de la course. C'est le cœur offline-first du produit : « l'appareil propose, le serveur dispose ».

## Stories

- Story 4.1: E-dossard QR hors-ligne
- Story 4.2: Moteur de scan caméra et états de retour
- Story 4.3: Scan de retrait du dossard
- Story 4.4: Scan de passage aux checkpoints
- Story 4.5: Synchronisation par lots idempotente

## Requirements & Constraints

- **E-dossard** : QR unique en haute définition, encodant un jeton unique édition (jamais le dossard nu), lisible après 30 jours de cache sans réseau (NFR-6). Sert au retrait, aux passages et à l'arrivée.
- **Retrait** : scan au guichet marque le coureur « présent au départ », hors-ligne inclus ; second scan du même coureur = voyant doublon avec l'heure du premier retrait, aucun enregistrement dupliqué. Cible : attente moyenne < 5 min par coureur (SM-1).
- **Passage** : confirmation < 1 s par coureur (bip + voyant), qualification sur le fallback iOS Safari `@zxing/browser` (NFR-1) ; doublon même coureur/même checkpoint = voyant rouge, Passage non dupliqué ; coureur absent de l'annuaire = « DOSSARD INCONNU » explicite avec bouton d'appel PC direct.
- **Sync** : lots idempotents au retour du réseau ; 100 % des Passages synchronisés au soir de la course, zéro perdu (NFR-3) ; le rejeu ne crée jamais de doublon visible ; dédoublonnage cross-appareils.
- **Offline-first radical** : scan, validation locale et e-dossard ne dépendent jamais du réseau (NFR-8).
- **Accessibilité** : jamais la couleur seule (bip + texte intégral) ; clignotements bornés ≤ 1 flash/s ; cibles ≥ 48 dp/44 pt, gap ≥ 8 px, pause/stop scan ≥ 64 dp ; `prefers-reduced-motion` → statique. UI en français, code/identifiants en anglais.

## Technical Decisions

- **Outbox append-only locale** (IndexedDB web / SQLite natif) : toute donnée de terrain est un événement inséré en append-only, poussé par lots idempotents (clé : appareil + entité + identifiant naturel). Jamais de mutation distante hors canal sync, jamais de CRDT ; le serveur est le seul juge (AD-2).
- **Arbitrage serveur** : pour un coureur + checkpoint, le premier Passage reçu fait foi ; les suivants sont archivés (audit) et neutres pour le classement. Heures de départ officielles configurées côté serveur — le scan au départ est un contrôle de présence, jamais une référence horaire de classement. L'horodatage appareil est conservé comme donnée, l'offset estimé (référence serveur à la sync) journalisé (AD-3).
- **Jeton d'appareil** : chaque installation productrice d'événements (PWA scanneuse) détient un jeton dédié au canal sync, indépendant des sessions interactives, révocable séparément — la boîte d'envoi survit à une session révoquée (AD-5).
- **Contrats dans `packages/shared` uniquement, versionnés** : format du payload QR e-dossard, schéma de la réplique annuaire, clé naturelle du Passage (édition, coureur, checkpoint) — jamais réinventée localement (AD-6, AD-8).
- **Aucune suppression de Passage**, sur aucune surface : toute correction passe par annulation auditable côté admin (AD-8) ; jamais de temps « définitif » côté appareil.
- **Lecture QR** : `BarcodeDetector` si disponible, fallback `@zxing/browser` 0.2.1 toujours actif (désactivé par défaut sur iOS Safari) ; validation locale contre l'annuaire préchargé en IndexedDB.
- **Modules** : e-dossard/retrait et chrono vivent dans `apps/web` (PWA volontaires) + `apps/runners`, module `chrono`. Enveloppe d'erreur unique définie dans `shared` ; horodatages ISO 8601 UTC stockés, affichage local ; journal sync (lots, rejets, offsets horloge) — l'auditabilité du chrono prime.

## UX & Interaction Patterns

- **Caméra scan plein écran** (UX-DR-6) : viseur plein cadre ; badges « · LIVE » + heure locale et mission en cours sur voile quasi opaque ≥ 96 % ; dernier scan traité en pastille ; audio débloqué au tap « Démarrer le scan » (premier geste) ; vibration en 3ᵉ canal ; deux mélodies distinctes doublon/inconnu. Le bip + voyant EST la confirmation : aucun bouton « valider » intermédiaire.
- **Voyant scan** (UX-DR-7) : pill plein cadre ≥ 96 px de haut, texte ≥ 24 px graisse 800, heure mono ≥ 16 px ; trois états — succès « ✓ Passage enregistré » / « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » (le premier passage reste) / « ⚠ DOSSARD INCONNU — revérifier » + bouton appel PC direct ; clignotement ≤ 1 flash/s ; `role="status"` + `aria-live="assertive"` ; doublon et inconnu différenciés par icône (↻ / ⚠) et position.
- **Bandeau sync** (UX-DR-8) : compteur d'outbox toujours visible — « ◷ N passages en attente » → « ✓ envoyés — file : 0 » ; Journal sync en lecture seule accessible depuis le bandeau (lots, rejets, offsets horloge).
- **E-dossard** (UX-DR-9) : carte sombre, numéro 74 px, badge « HORS-LIGNE PRÊT » en mono, QR sur carte blanche coins 16 px à modules encre ; raccourci système recommandé (widget iOS / quick settings Android) — accessible en un geste écran verrouillé.
- **Permission caméra refusée/indisponible** (UX-DR-18) : détection au premier lancement du scanner → écran dédié « Autoriser la caméra » avec chemin Réglages complet + bouton assistance PC ; le scan ne démarre qu'avec caméra accessible.
- Couleurs opérationnelles jour J réservées à leur sémantique (succès / danger / sync attente / sync envoyé), paires clair/sombre testées (départs à l'aube). Maquettes 1:1 : `mockups/key-scan.html`, `mockups/key-edossard.html`.

## Cross-Story Dependencies

- **4.1** présuppose le dossier validé (épopée 1) : checklist verte débloque l'e-dossard ; le même e-dossard est retrouvé dans l'app native (épopée 6), déjà vert → accès direct.
- **4.2** requiert la PWA volontaires (3.3) et l'annuaire des coureurs préchargé (3.4, IndexedDB, versionné via `shared`) ; l'état « caméra active · annuaire chargé » est annoncé au démarrage du scanner.
- **4.3 et 4.4** bâtissent sur le moteur de scan 4.2 et alimentent l'outbox que **4.5** vide au retour du réseau (jeton d'appareil, clé d'idempotence du contrat `shared`).
- En aval : les Passages arbitrés alimentent le tableau de bord PC et l'annulation auditable (épopée 5) ainsi que les classements et résultats live (épopée 7) ; le retrait (4.3) alimente les « partants » du PC.
