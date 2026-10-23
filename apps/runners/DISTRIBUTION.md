# Distribution de l'app coureurs Azzel — Story 6.1

L'app vit dans `apps/runners` (Expo SDK 58 / React Native 0.88). **Dev build obligatoire — jamais Expo Go** : le suivi GPS arrière-plan (story 6.2) et `expo-secure-store` exigent un binaire natif dédié.

## Prérequis

- Node ≥ 22, pnpm ≥ 11 (`corepack enable`)
- Compte [Expo](https://expo.dev) + `eas-cli` : `npm i -g eas-cli` puis `eas login`
- Variables d'environnement du build (inlinées au binaire via `EXPO_PUBLIC_*`) :
  - `EXPO_PUBLIC_API_URL` — base URL du monolithe (ex. `https://azzel.example.dz` ; en dev local `http://<ip-locale>:3000` — l'émulateur Android atteint la machine hôte via `10.0.2.2`)
  - `EXPO_PUBLIC_ASSISTANCE_PHONE` (optionnel — défaut `+213 555 010 200`)
- Aucun SDK Supabase côté app : tout passe par l'API JSON du monolithe.

## 1. Build de développement (dev build)

```bash
pnpm install
cd apps/runners
eas build --profile development --platform android   # ou --platform ios
```

- Profil `development` (`eas.json`) : `developmentClient: true`, distribution interne, APK Android.
- Le build s'installe manuellement (lien/QR fourni par EAS) puis l'app se lance via `expo start --dev-client` pour le rechargement JS :

```bash
pnpm dev:runners   # expo start --dev-client
```

- iOS : inscrire les UDID des appareils de test dans le compte EAS (`eas device:create`) — distribution interne, pas besoin de TestFlight pour l'équipe.

## 2. Installation sur le téléphone de l'équipe (recette 6.1)

1. Installer la dev build (APK Android / `.ipa` interne iOS).
2. Vérifier `EXPO_PUBLIC_API_URL` (le QR de dev `expo start` ne sert que le JS, l'URL de l'API est dans le binaire).
3. Parcours attendu : email coureur → code à 6 chiffres (email reçu, Mailpit en dev) → dossier (checklist) ; dossier déjà validé → **e-dossard direct** avec QR ; couper le réseau → tout reste lisible (bandeau « hors-ligne »).

## 3. Repli Android : APK sideload

Si les stores ne sont pas encore disponibles (délais de revue), distribution directe par APK :

1. Build dédié : `eas build --profile sideload-apk --platform android` → APK signé par EAS.
2. Sur le téléphone : **Paramètres → Sécurité → Installer des applications inconnues** (ou « Applications spéciales »), autoriser le navigateur/le gestionnaire de fichiers pour la source utilisée.
3. Transférer l'APK (lien EAS direct de préférence) et l'installer ; confirmer l'avertissement « source inconnue ».
4. Mise à jour : installer le nouvel APK par-dessus (même signature EAS = mise à jour en place, données locales conservées).

⚠️ Ne jamais distribuer un binaire de production signé « preview » et un sideload de signatures différentes : la mise à jour en place échouerait (désinstallation = cache e-dossard perdu).

## 4. Checklist de soumission stores (anticipée — pas de soumission réelle en 6.1)

À préparer tôt (délais de revue iOS) pour les stories suivantes :

- [ ] Comptes : Google Play Console (organisateur) + Apple Developer Program, équipes et rôles.
- [ ] Fiches store : nom « Azzel », description coureur (e-dossard, hors-ligne), captures (dossier, e-dossard sombre, QR), icônes 1024×1024, captures tablette si requises.
- [ ] Identifiants : `dz.azzel.runners` (Android `package` / iOS `bundleIdentifier`, déjà dans `app.json`).
- [ ] Mode sombre : vérifier les captures en clair ET sombre (`userInterfaceStyle: automatic`).
- [ ] Confidentialité : en 6.1 l'app ne collecte **aucune donnée de position** ; le manifeste déclaratif (Data safety / App Privacy) doit refléter : email (auth), données de dossier (prestation). Prévoir la mise à jour en 6.2 (localisation en arrière-plan = justification + mentions).
- [ ] iOS : `NSLocationWhenInUseUsageDescription`/`Always` à rédiger en 6.2 (pas de permission posée en 6.1) ; test « Autoriser une fois » (story 6.3).
- [ ] Tracks : Play `internal`/`production`, iOS TestFlight puis App Store ; `eas submit --platform all` (profil `submit.production` déjà déclaré).
- [ ] Journal de versions : `app.json` → `version` + `runtimeVersion` si updates OTA activés plus tard.

## 5. Dépannage dev

- `Network request failed` sur émulateur : `EXPO_PUBLIC_API_URL` doit viser `10.0.2.2:3000` (alias hôte de l'émulateur Android) ou l'IP LAN en physique.
- Bearer 401 immédiat : une connexion web a révoqué la session (AD-5, voulu) — reconnecte-toi dans l'app.
- QR illisible : vérifier que `payloadQr` commence par `azzel-e1:` (contrat `@azzel/shared`).
