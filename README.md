# StepWars

Application mobile (iOS et Android) de défis de pas entre amis : le téléphone compte vos pas, vous lancez des duels contre vos amis et vous grimpez au classement.

Construite avec **Expo SDK 57 / React Native**. Un seul code TypeScript pour l'App Store et le Play Store.

## Fonctionnalités

Le public visé : les gens qui font leurs 10 000 pas par jour, pour leur santé ou pendant un rééquilibrage alimentaire, et que la compétition motive.

| Écran | Contenu |
| --- | --- |
| **Premier lancement** | Présentation, pseudo, objectif quotidien (10 000 par défaut), rappel du soir. « J'ai déjà un compte » retrouve un compte par e-mail |
| **Accueil** | Anneau des pas du jour, série avec joker hebdomadaire, meilleure série, distance, bilan du lundi (« Tu montes en Route ! »), nouveau badge, ma ligue, mon équipe, invitations et duels en cours, 7 derniers jours. Écran de fête et partage quand l'objectif est atteint |
| **Ligue** | Sous-onglet **Ligue** : chaque semaine, jusqu'à 30 joueurs de ton niveau (Sentier, Chemin, Route, Col, Sommet), zones de montée et de descente, objectif à atteindre. Sous-onglet **Équipes** : ton équipe contre toutes les autres, contribution de chaque membre, invitation par lien |
| **Carte** | Les marcheurs autour de toi en bulles (pseudo, pas du jour). Chacun choisit d'être invisible (par défaut), visible par ses amis ou public. Fiche joueur : pas, série, rang, bilan de duels, défier, signaler, bloquer |
| **Duels** | Invitations à accepter ou refuser, duels de 1, 3 ou 7 jours avec gage facultatif, revanche, classement des amis sur 1, 7 ou 30 jours |
| **Profil** | Sauvegarde du compte par e-mail, badges, pseudo, objectif, rappel, invitation d'amis par lien ou QR code, amis, suppression du compte |

**Ce qui fait revenir les joueurs** : la ligue de la semaine (monter, ne pas descendre), la série protégée par un joker, les duels entre amis, les badges, le bilan du lundi et le rappel du soir.

Le serveur est **Supabase** : comptes anonymes, amis par code, pas partagés et défis entre amis. Mise en place dans **[docs/BACKEND.md](docs/BACKEND.md)**.

> **Serveur :** l'app est branchée sur le projet Supabase de production via `.env`. Pour le **mode démo**, créez un `.env.local` avec les deux variables vides : l'app fonctionne alors sans serveur. Vos pas sont réels, mais les amis et leurs pas sont simulés localement.

## Essayer l'app

| Où | Comment | Ce qui marche |
| --- | --- | --- |
| **Navigateur** | `npm run preview:web` construit un aperçu autonome dans `dist-preview/`, à héberger n'importe où | Toute l'app en mode démo. Pas de podomètre : un bouton « Marcher 1 000 pas » le remplace. Les confirmations (quitter l'équipe, retirer un ami) et le partage ne fonctionnent pas dans un navigateur |
| **Téléphone (Expo Go)** | Sur un ordinateur : `npm install` puis `npx expo start --go` (ajouter `--tunnel` sur Chromebook), et scanner le QR code avec l’app Expo Go | L'app complète avec le vrai podomètre, tant que le téléphone et l'ordinateur sont sur le même réseau Wi-Fi |
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
    (tabs)/            # les 5 onglets
    challenge/         # création et détail d'un duel
    account.tsx        # sauvegarde / connexion par e-mail (code à 6 chiffres)
    add/, join/        # liens d'invitation (ami, équipe)
    share.tsx          # image à partager (format story)
  components/          # composants d'interface
  hooks/usePedometerSync.ts   # lecture du podomètre iOS / Android
  lib/reminders.ts     # rappel quotidien (notification locale)
  lib/game.ts          # logique de jeu pure (duels, séries et joker, équipes), testée
  lib/league.ts        # ligues hebdomadaires par niveau, testées
  lib/badges.ts        # badges, testés
  lib/invite.ts        # liens d'invitation
  lib/hex.ts           # grille d'hexagones de la carte, testée
  lib/players.ts       # joueurs sur la carte, fiches, % de victoires, démo, testés
  lib/remote.ts        # conversion des données serveur, testée
  lib/api.ts           # appels Supabase
  state/AppStore.tsx   # état global, cache local et synchronisation
  state/MapStore.tsx   # position, visibilité sur la carte, joueurs et fiches
supabase/migrations/   # schéma de la base et règles de sécurité
supabase/tests/        # tests du schéma
tests/                 # tests (node --test)
app.json               # configuration de l'app (identifiants, permissions, icônes)
eas.json               # profils de build et de soumission EAS
```

## Feuille de route

1. **Comptage en arrière-plan et anti-triche renforcé** : Apple HealthKit (iOS) et Health Connect (Android). Sans eux, Android ne compte les pas que lorsque l'app est ouverte. Nécessite un build EAS (pas Expo Go).
2. **Notifications envoyées par le serveur** : « Lina t'a défié », « Sarah vient de te dépasser », bilan du lundi matin.
3. **Envoi d'e-mails** par un service dédié (Resend, Brevo) : celui de Supabase est limité à quelques e-mails par heure.
4. **Connexion Apple et Google**, en plus de l'e-mail.
5. **Liens d'invitation https** (universal links) qui mènent au store quand l'app n'est pas installée.

Les icônes de `assets/` sont générées par `scripts/make-icons.mjs`.
