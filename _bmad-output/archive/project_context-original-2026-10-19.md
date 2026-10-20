# Project Context: Application de Gestion de Trail en Algérie

## 1. Vision et Objectifs du Projet

* **Nom du projet :** Solution Globale de Gestion de Trail Local (1 000 participants).
* **Contexte géographique :** Algérie (zones à relief élevé ou reculées comme Chréa, Djurdjura, Tikjda, Lalla Khedidja, etc.).
* **Objectif principal :** Proposer une suite logicielle clé en main permettant à un organisateur local d'administrer une course de 1 000 coureurs à moindre coût, sans dépendre d'infrastructures lourdes (puces RFID, tapis magnétiques, liaisons satellite dédiées).
* **Philosophie clé :** **Résilience terrain (Offline-First)**. L'application doit fonctionner de manière fluide même si le réseau mobile est totalement absent pendant plusieurs heures sur les points de contrôle.

---

## 2. Analyse des Specificités et Contraintes Locales

### A. Connectivité et Réseau Mobile
* **Constat :** En milieu naturel et montagneux en Algérie, la couverture 3G/4G des opérateurs (Djezzy, Mobilis, Ooredoo) est très instable, intermittente ou inexistante (zones blanches).
* **Impact :** Aucune fonctionnalité critique (ex: contrôle au départ, chronométrage aux ravitaillements) ne doit dépendre d'une connexion internet en temps réel pour fonctionner.

### B. Habitudes de Paiement et Administratif
* **Modes de paiement :** La population des coureurs est séparée entre le digital et le cash/hors-ligne.
  * *Option Digitale :* Cartes CIB / Edahabia via la passerelle Satim ou Algérie Poste.
  * *Option Hors-Ligne :* Virement CCP/CIB de compte à compte avec envoi de preuve (reçu de virement), ou paiement en espèces auprès de partenaires physiques (magasins de sport, clubs d'athlétisme).
* **Justificatifs administratifs :** Obligation d'associer un certificat médical de non-contre-indication à la pratique du trail en compétition ou une licence sportive valide pour valider l'dossier.

### C. Équipement des Coureurs et Bénévoles
* **Hétérogénéité des smartphones :** Les bénévoles et coureurs utilisent une grande variété d'appareils (iOS, Android récents, smartphones Android d'entrée de gamme).
* **Consommation de batterie :** L'usage du GPS et de la recherche de réseau en zone blanche épuise rapidement la batterie des smartphones. Une stratégie rigoureuse d'économie d'énergie est indispensable.

---

## 3. Architecture Stratégique et Choix Opérationnels

### A. Pointage aux Ravitaillements & Checkpoints (Méthode Hybride / QR Code)
* **Système alternatif au RFID :** Remplacement des puces RFID par des **QR Codes uniques** attribués à chaque coureur (imprimés sur le dossard physique et accessibles dans l'application mobile).
* **Organisation du poste de ravitaillement :**
  * Chaque checkpoint comprend **3 bénévoles** équipés de smartphones.
  * Les 3 bénévoles scannent simultanément les coureurs qui arrivent pour éliminer les files d'attente.
* **Fonctionnement Offline-First :**
  1. **Pré-chargement :** Téléchargement local de l'annuaire des 1 000 participants sur les téléphones des bénévoles avant le départ.
  2. **Scan local :** La caméra lit le QR Code, enregistre le temps de passage (`timestamp` local de l'appareil) et valide la présence du coureur dans la base de données locale du téléphone.
  3. **Synchronisation différée :** Dès que l'appareil du bénévole détecte du réseau (ou à la fin de la course), les données accumulées sont envoyées par lots (*batch sync*) vers le serveur central.

### B. Suivi GPS en Temps Réel ("Smart Tracking")
* **Principe :** Exploiter le smartphone du coureur pour partager sa position sur une carte interactive destinée à l'organisation et aux proches.
* **Fréquence adaptative :** Envoi de la position GPS à intervalle régulier de **5 à 10 minutes** (au lieu d'un flux continu seconde par seconde).
* **Gestion du réseau :** Si le téléphone du coureur perd le réseau, les positions GPS sont enregistrées en cache local et envoyées en rafale dès le retour d'une connexion.
* **Gestion de la batterie :**
  * Utilisation des API de localisation en mode "précision équilibrée" (GPS intermittent + triangulation cellulaire).
  * Application d'un protocole d'éducation préalable des coureurs (charge complète à 100 %, désactivation du tueur de tâches arrière-plan sur Android, batterie externe préconisée pour les longues distances).

---

## 4. Spécifications des Modules Applicatifs

### Module 1 : Espace Coureur & Web-App (Inscriptions & Dossard)
* **Parcours d'inscription :** Choix de l'épreuve (ex: 12 km, 25 km, 50 km), saisie des informations personnelles, choix de la taille de t-shirt.
* **Gestion du dossier :** Upload du certificat médical / licence, sélection du mode de paiement (CIB/Edahabia ou virement/espèces).
* **E-Dossard :** Affichage d'un QR Code haute définition accessible hors-ligne (enregistré dans le cache du navigateur ou téléchargé en image).
* **Module Tracking GPS :** Service d'arrière-plan avec bouton d'activation/désactivation simple pour l'enregistrement des coordonnées géographiques toutes les 5 à 10 minutes.
* **Infos Course :** Trace GPX du parcours, profil de dénivelé ($D+ / D-$), localisation des ravitaillements et consignes de sécurité.

### Module 2 : Application Bénévole (Scan & Chronométrage)
* **Interface ultra-simplifiée :** Mode caméra plein écran optimisé pour la lecture rapide de QR Codes.
* **Retrait des Dossards :** Scanner le QR Code de confirmation pour valider la remise du dossard physique et marquer le coureur comme "Présent au départ".
* **Checkpoints / Ravitos :** 
  * Scan du dossard du coureur à son passage.
  * Confirmation visuelle immédiate (bip sonore + voyant vert pour "Scan Validé", voyant rouge si coureur inconnu ou doublon).
  * Indicateur visuel de l'état de la connexion et du nombre de pings en attente de synchronisation.
* **Gestion Hors-Ligne :** Base de données locale intégrée pour garantir le fonctionnement sans interruption.

### Module 3 : Dashboard Admin & PC Course (Organisateur)
* **Vue d'ensemble en direct :** 
  * Nombre de coureurs au départ, en course, arrivés et abandonnés.
  * Tableau de passage par checkpoint (qui est passé au Ravito 1, 2, 3...).
* **Carte interactive (Live Tracking) :**
  * Affichage de la dernière position GPS connue de chaque coureur.
  * Superposition du tracé officiel GPX avec la position des checkpoints.
* **Module de Sécurité & Alertes :**
  * **Alerte "Hors Délais" :** Détection automatique des coureurs n'ayant pas atteint un checkpoint dans le temps imparti.
  * **Alerte "Batterie Faible" :** Remontée de l'état de batterie du smartphone du coureur si celui-ci passe sous les 15 %.
  * **Gestion des Abandons :** Saisie manuelle par l'organisation ou les bénévoles d'un abandon avec motif et lieu.

---

## 5. Stratégie de Gestion des Risques

| Risque identifié | Impact | Solution & Mitigations |
| :--- | :--- | :--- |
| **Panne de réseau totale sur un checkpoint** | Élevé | Utilisation stricte du mode *Offline-First*. Aucun besoin de réseau pour scanner et horodater. |
| **Épuisement de la batterie du coureur** | Moyen | Stratégie d'intervalle 5-10 min + campagne de sensibilisation + batterie externe conseillée. |
| **Embouteillage au scan à un ravitaillement** | Moyen | 3 bénévoles équipés simultanément par poste + algorithme de scan ultra-rapide (< 1 seconde par coureur). |
| **Désynchronisation de l'heure entre appareils** | Moyen | Synchronisation NTP obligatoire de l'horloge des téléphones bénévoles au QG avant le départ. |
| **Fraude / Échange de dossard** | Faible | Affichage de la photo et du nom du coureur sur l'écran du bénévole au moment du scan. |

---

## 6. Prochaines Étapes Opérationnelles

1. **Validation de la Stack Technique :** Définir les technologies d'implémentation pour les modules Frontend (ex: PWA, Flutter, React Native) et Backend.
2. **Conception UI/UX :** Réaliser les maquettes de l'interface bénévole pour garantir une ergonomie maximale lors du scan (boutons larges, lisibilité au soleil).
3. **Tests de Performance & Terrain :** Réaliser des essais de lecture de QR Code en conditions réelles (luminosité extérieure, mouvement du coureur, caméras d'entrée de gamme).