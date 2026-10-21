# StepWars

Application mobile (iOS et Android) de défis de pas entre amis : le téléphone compte vos pas, vous lancez des duels contre vos amis et vous grimpez au classement.

Construite avec **Expo SDK 58 / React Native**. Un seul code TypeScript pour l'App Store et le Play Store.

## Fonctionnalités (MVP)

| Écran | Contenu |
| --- | --- |
| **Aujourd'hui** | Pas du jour (podomètre du téléphone), anneau de progression vers l'objectif, historique sur 7 jours |
| **Défis** | Liste des duels (en cours / terminés), création d'un duel de 1, 3 ou 7 jours, détail jour par jour |
| **Classement** | Classement entre amis sur aujourd'hui, 7 jours ou 30 jours |
| **Profil** | Pseudo, avatar, objectif quotidien, code ami, gestion des amis |

Le serveur est **Supabase** : comptes anonymes, amis par code, pas partagés et défis entre amis. Mise en place dans **[docs/BACKEND.md](docs/BACKEND.md)**.

> **Mode démo :** tant que le fichier `.env.local` ne contient pas les clés Supabase, l'app fonctionne sans serveur. Vos pas sont réels, mais les amis et leurs pas sont simulés localement.

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
  lib/game.ts          # logique de jeu pure (défis, classement), testée
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
3. **Notifications** : défi reçu, dépassé par un ami, victoire.
4. **Identité visuelle** : icône, écran de démarrage et captures d'écran définitifs (les fichiers de `assets/` sont ceux du modèle Expo).
