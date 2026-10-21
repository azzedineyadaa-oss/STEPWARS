# StepWars

Application mobile (iOS et Android) de défis de pas entre amis : le téléphone compte vos pas, vous lancez des duels contre vos amis et vous grimpez au classement.

Construite avec **Expo SDK 58 / React Native**. Un seul code TypeScript pour l'App Store et le Play Store.

## Fonctionnalités

| Écran | Contenu |
| --- | --- |
| **Premier lancement** | Présentation, pseudo et avatar, objectif quotidien, activation des rappels |
| **Accueil** | Pas du jour dans un anneau en dégradé, série 🔥 et record, distance, position de ton équipe dans la guerre, duel en cours, 7 derniers jours. Une célébration (confettis et vibration) quand l'objectif est atteint |
| **Guerre** | Guerre d'équipes hebdomadaire (lundi-dimanche) : classement de toutes les équipes, compte à rebours, écart à combler pour dépasser l'équipe de devant, contribution de chaque membre, recrutement par code, signalement des noms offensants |
| **Duels** | Duels de 1, 3 ou 7 jours contre un ami, classement des amis sur 1, 7 ou 30 jours |
| **Profil** | Pseudo, avatar, objectif, heure du rappel du soir, code ami, amis, suppression du compte |

**Ce qui fait revenir les joueurs** : la série 🔥 qu'on ne veut pas casser, l'équipe qui compte sur toi, le duel en cours, et un rappel chaque soir.

Le serveur est **Supabase** : comptes anonymes, amis par code, pas partagés et défis entre amis. Mise en place dans **[docs/BACKEND.md](docs/BACKEND.md)**.

> **Mode démo :** tant que le fichier `.env.local` ne contient pas les clés Supabase, l'app fonctionne sans serveur. Vos pas sont réels, mais les amis et leurs pas sont simulés localement.

## Essayer l'app

| Où | Comment | Ce qui marche |
| --- | --- | --- |
| **Navigateur** | `npm run preview:web` construit un aperçu autonome dans `dist-preview/`, à héberger n'importe où | Toute l'app en mode démo. Pas de podomètre : un bouton « Marcher 1 000 pas » le remplace. Les confirmations (quitter l'équipe, retirer un ami) et le partage ne fonctionnent pas dans un navigateur |
| **Téléphone (Expo Go)** | Sur un ordinateur : `npm install` puis `npx expo start`, appuyer sur `s` pour passer en mode Expo Go, et scanner le QR code avec l'app Expo Go | L'app complète avec le vrai podomètre, tant que le téléphone et l'ordinateur sont sur le même réseau Wi-Fi |
| **Téléphone (installée)** | `npm run build:preview` (compte Expo gratuit) : lien d'installation direct sur Android ; iOS demande un compte Apple Developer | L'app comme elle sera sur les stores |

## Démarrer

Prérequis : Node.js 22.18 ou plus récent, et un téléphone (le podomètre ne fonctionne pas dans les simulateurs).

```bash
npm install
npm start          # serveur de développement
npm test           # tests de la logique de jeu
npm run test:db    # tests du schéma et des règles de sécurité (Postgres local)
npm run test:api   # test de bout en bout des appels serveur
npm run lint       # ESLint
npm run typecheck  # vérification TypeScript
```

L'app utilise `expo-dev-client` : il faut d'abord installer un **build de développement** sur le téléphone (une seule fois, puis à chaque ajout de module natif) :

```bash
npx eas-cli@latest login
npm run build:dev   # build de développement pour iOS et Android
```

Installez le build sur votre téléphone (lien ou QR code fourni par EAS), puis lancez `npm start` et scannez le QR code.

## Publier sur l'App Store et le Play Store

Toutes les étapes (comptes développeur, identifiants, captures d'écran, confidentialité, soumission) sont dans **[docs/PUBLICATION.md](docs/PUBLICATION.md)**.

En bref :

```bash
npm run build:prod       # builds de production signés (EAS)
npm run submit:ios       # envoi vers App Store Connect
npm run submit:android   # envoi vers Google Play (piste interne)
```

## Structure

```
src/
  app/                 # écrans (Expo Router : un fichier = un écran)
    (tabs)/            # les 4 onglets
    challenge/         # création et détail d'un défi
  components/          # composants d'interface
  hooks/usePedometerSync.ts   # lecture du podomètre iOS / Android
  lib/reminders.ts     # rappel quotidien (notification locale)
  lib/game.ts          # logique de jeu pure (duels, séries, guerre d'équipes), testée
  lib/remote.ts        # conversion des données serveur, testée
  lib/api.ts           # appels Supabase
  state/AppStore.tsx   # état global, cache local et synchronisation
supabase/migrations/   # schéma de la base et règles de sécurité
supabase/tests/        # tests du schéma
tests/                 # tests (node --test)
app.json               # configuration de l'app (identifiants, permissions, icônes)
eas.json               # profils de build et de soumission EAS
```

## Feuille de route

1. **Connexion Apple et Google**, pour ne pas perdre son compte en changeant de téléphone.
2. **Comptage en arrière-plan** : Apple HealthKit (iOS) et Health Connect (Android). Sans eux, Android ne compte les pas que lorsque l'app est ouverte.
3. **Notifications envoyées par le serveur** : « ton équipe vient de passer 2ᵉ », « Lina t'a défié », résultat de la guerre le lundi matin.
4. **Historique des guerres** : vainqueurs des semaines passées, trophées d'équipe.

Les icônes de `assets/` sont générées par `scripts/make-icons.mjs`.
