# Publier StepWars sur l'App Store et le Play Store

Ce guide suit l'ordre réel des opérations. Les builds sont faits dans le cloud avec **EAS** (Expo Application Services), donc **aucun Mac n'est nécessaire**, même pour iOS.

> Les règles des stores changent souvent. Les montants et délais ci-dessous étaient valables à la rédaction : vérifiez-les sur les sites d'Apple et de Google avant de payer quoi que ce soit.

---

## 0. Ce qu'il faut préparer

| Élément | App Store | Play Store |
| --- | --- | --- |
| Compte développeur | [Apple Developer Program](https://developer.apple.com/programs/) : 99 $/an | [Google Play Console](https://play.google.com/console/signup) : 25 $ une seule fois |
| Délai d'ouverture du compte | De 1 à 2 jours (pièce d'identité ; numéro D-U-N-S si vous publiez au nom d'une société) | Vérification d'identité de quelques jours |
| Icône | 1024×1024, sans transparence | 512×512 |
| Captures d'écran | iPhone 6,9" (1320×2868), au moins 1 et jusqu'à 10 | Téléphone, au moins 2 ; image de présentation 1024×500 |
| Politique de confidentialité | URL publique **obligatoire** | URL publique **obligatoire** |
| Compte Expo | Gratuit sur [expo.dev](https://expo.dev/signup) | Idem |

### Identifiants de l'app

Dans `app.json`, l'identifiant est `com.stepwars.app` (iOS `bundleIdentifier` et Android `package`). **Il ne pourra plus être changé après la première publication.** Remplacez-le par un nom de domaine que vous possédez, par exemple `com.votrenom.stepwars`, avant le premier build de production.

---

### Carte sur Android : clé Google Maps

Sur iPhone, la carte utilise Apple Plans : rien à faire. Sur Android, les builds EAS ont besoin d'une clé Google Maps, sinon la carte reste grise (Expo Go n'en a pas besoin) :

1. Sur [console.cloud.google.com](https://console.cloud.google.com), créez un projet, activez **Maps SDK for Android**, puis créez une **clé API** limitée à cette API et à votre package Android.
2. Déclarez-la sur EAS, elle n'est jamais commitée :
   ```bash
   npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_KEY --value <votre-clé> --visibility secret --environment production --environment preview --environment development
   ```
   `app.config.js` la transmet automatiquement à la configuration Android.

## 1. Relier le projet à EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init      # crée le projet sur expo.dev et ajoute son projectId dans app.json
```

Les profils de build sont déjà définis dans `eas.json` :

| Profil | Usage |
| --- | --- |
| `development` | App de développement à installer sur votre téléphone |
| `preview` | Test interne : APK Android et build iOS ad hoc à partager avec quelques testeurs |
| `production` | Build signé pour les stores, avec numéro de build incrémenté automatiquement |

---

## 2. Tester sur de vrais téléphones

```bash
npm run build:preview
```

- **Android** : EAS fournit un lien vers l'APK, à installer directement.
- **iOS** : EAS vous demande d'enregistrer les iPhone de test (`eas device:create`). Pour un test plus large, passez par TestFlight (étape 4).

Vérifiez en particulier la demande d'autorisation « Activité physique » au premier lancement, et que les pas montent quand vous marchez.

---

## 3. Builds de production

```bash
npm run build:prod
```

Au premier build, EAS propose de **générer et stocker les certificats de signature** :

- **iOS** : connectez-vous avec votre identifiant Apple Developer, puis laissez EAS créer le certificat de distribution et le profil de provisionnement.
- **Android** : laissez EAS générer la clé d'upload (keystore). **Ne la perdez jamais** : EAS la garde, mais vous pouvez la télécharger avec `eas credentials` pour en avoir une copie.

Résultat : un fichier `.ipa` (iOS) et un fichier `.aab` (Android).

---

## 4. App Store (iOS)

1. Sur [App Store Connect](https://appstoreconnect.apple.com), allez dans **Apps**, puis **+**, puis **Nouvelle app** : choisissez le bundle ID `com.stepwars.app` (ou le vôtre), le nom « StepWars », la langue principale et un SKU.
2. Envoyez le build :
   ```bash
   npm run submit:ios
   ```
   EAS demande l'app à cibler et crée une clé API App Store Connect si besoin. Pour ne plus avoir à répondre, ajoutez `"ascAppId": "<identifiant Apple de l'app>"` sous `submit.production.ios` dans `eas.json`.
3. **TestFlight** : le build y apparaît après 10 à 30 minutes de traitement. Ajoutez des testeurs internes (jusqu'à 100) ou externes (jusqu'à 10 000, après une courte revue).
4. Remplissez la fiche de l'app :
   - description, mots-clés, captures d'écran, URL de support, URL de confidentialité ;
   - **Confidentialité de l'app** : déclarez « Forme physique » (nombre de pas), « Localisation approximative » (la zone d'environ 200 m envoyée pour la carte, seulement si le joueur choisit d'être visible, jamais la position précise) « Identifiants : identifiant utilisateur » (le compte) et « Coordonnées : adresse e-mail » (facultative, pour retrouver son compte), **liés à l'utilisateur**, utilisés pour les « fonctionnalités de l'app » et non pour le pistage. Le pseudo et les pas sont visibles par d'autres joueurs (amis, ligue, carte selon la visibilité choisie) ;
   - classification par âge : répondez au questionnaire honnêtement ; les interactions entre joueurs (pseudos, carte, signalements) font en général monter la classification au-dessus de 4+ ;
   - chiffrement : déjà déclaré dans `app.json` (`ITSAppUsesNonExemptEncryption: false`).
5. Cliquez sur **Soumettre pour vérification**. La revue prend en général de 24 à 48 h.

**Rejets fréquents à éviter :**
- Soumettez un build **connecté à Supabase** (voir `docs/BACKEND.md`) : en mode démo, les amis simulés risquent un refus.
- Dans les notes de revue, expliquez comment tester sans second téléphone : donnez le code ami d'un compte de test que vous gardez actif.
- Les noms d'équipe et les pseudos sur la carte sont du **contenu créé par les joueurs** et visible de tous : Apple exige de pouvoir les signaler et bloquer un joueur (règle 1.2). C'est en place (appui long sur une équipe dans le classement ; boutons Signaler et Bloquer sur chaque fiche joueur) ; indiquez-le dans les notes de revue.
- La carte publique montre des inconnus proches : elle est réservée aux 16 ans et plus (confirmation avant de passer en « Tout le monde »). Choisissez une classification par âge cohérente (12+ ou plus sur l'App Store, « Interactions entre utilisateurs » et « Partage de position » déclarés sur le Play Store).
- La **suppression de compte** exigée par Apple est déjà en place, dans l'onglet Profil, puis « Supprimer mon compte ».

---

## 5. Play Store (Android)

1. Sur la [Play Console](https://play.google.com/console), cliquez sur **Créer une application** et choisissez le nom, la langue, « Application » et « Gratuite ».
2. **Le tout premier `.aab` doit être envoyé à la main** (limite de l'API Google) : allez dans **Tests**, puis **Tests internes**, puis **Créer une version**, et déposez le fichier `.aab` téléchargé depuis expo.dev.
3. Pour automatiser les envois suivants :
   - créez un **compte de service Google Cloud** avec accès à la Play Console (guide : [docs.expo.dev/submit/android](https://docs.expo.dev/submit/android/)) ;
   - enregistrez la clé JSON sous `google-play-service-account.json` à la racine du projet. Ce fichier est dans `.gitignore`, **ne le committez jamais** ;
   - puis lancez :
     ```bash
     npm run submit:android   # envoie sur la piste « internal »
     ```
4. Remplissez **Contenu de l'application** (dans le menu Règles) :
   - politique de confidentialité ;
   - **Sécurité des données** : « Santé et remise en forme » (nombre de pas), « Position approximative » (carte) et « Identifiants de l'appareil ou autres » (compte anonyme), collectés, chiffrés en transit, non partagés avec des tiers, et supprimables depuis l'app ;
   - **Applications de santé** : déclarez l'app comme application de remise en forme, car elle utilise `ACTIVITY_RECOGNITION` ;
   - classification du contenu, public cible, annonces (aucune).
5. **Compte personnel créé récemment** : Google exige un **test fermé avec au moins 12 testeurs pendant 14 jours d'affilée** avant de pouvoir publier en production. Prévoyez-le tôt, par exemple avec la famille et les amis, qui sont la cible de l'app de toute façon. Les comptes d'organisation en sont dispensés.
6. Passez ensuite la version en **Production** et envoyez-la en examen. Comptez de quelques heures à quelques jours.

---

## 6. Mises à jour

- **Changement de code JavaScript uniquement** : mise à jour à distance sans repasser par les stores, avec `npx eas-cli@latest update` (nécessite `expo-updates`, à ajouter le moment venu).
- **Nouveau module natif ou changement de permissions** : nouveau `npm run build:prod`, puis soumission. Le numéro de build est incrémenté automatiquement. Augmentez `version` dans `app.json` pour les versions visibles par les utilisateurs (1.0.0, puis 1.1.0, etc.).

---

## Liste de contrôle avant la première soumission

- [ ] Identifiant `com.stepwars.app` remplacé par le vôtre dans `app.json`
- [ ] Icône, écran de démarrage et icône adaptative Android définitifs dans `assets/`
- [ ] Serveur Supabase à jour (toutes les migrations, `docs/BACKEND.md`), modèles d'e-mail avec le code, service d'envoi d'e-mails branché
- [ ] Politique de confidentialité complétée et en ligne : brouillon dans `docs/CONFIDENTIALITE.md`
- [ ] Captures d'écran prises sur de vrais téléphones
- [ ] Test sur au moins un iPhone et un téléphone Android
- [ ] (Android, compte personnel) test fermé de 12 testeurs pendant 14 jours terminé
