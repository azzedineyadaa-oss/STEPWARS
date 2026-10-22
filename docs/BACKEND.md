# Serveur StepWars (Supabase)

L'app utilise [Supabase](https://supabase.com) pour les comptes, les amis, les pas partagés et les défis. Sans configuration, elle fonctionne en **mode démo** (amis simulés). Il faut compter environ 15 minutes pour passer en ligne.

## Fonctionnement

| Élément | Choix |
| --- | --- |
| Comptes | **Anonymes** : un compte est créé automatiquement au premier lancement, sans e-mail ni mot de passe |
| Amis | Ajout par **code ami** à 6 caractères ; l'amitié est réciproque |
| Pas | Le téléphone envoie ses totaux journaliers (au plus toutes les 10 s) ; un total ne peut qu'augmenter, et seuls les 8 derniers jours sont acceptés |
| Défis | Uniquement entre amis, durée de 1, 3 ou 7 jours, visibles et supprimables par les deux joueurs |
| Confidentialité | Un joueur ne voit que son profil, ses amis, les pas de ses amis et ses propres défis. C'est imposé par la base (Row Level Security), pas seulement par l'app |
| Guerre d'équipes | Une équipe par joueur (30 membres au plus), rejointe par un code. Chaque semaine (lundi-dimanche), le total d'une équipe additionne les pas de ses membres **depuis leur arrivée** : changer d'équipe en milieu de semaine n'apporte rien. Les coéquipiers voient leurs profils et leurs pas ; le classement global ne montre que le nom, l'emblème, le nombre de membres et le total de chaque équipe |
| Modération | Un nom d'équipe offensant peut être signalé (appui long dans le classement). Au bout de 3 signalements distincts, l'équipe est masquée du classement des autres. Pour masquer à la main : `update teams set hidden = true where id = '…'` dans l'éditeur SQL |
| Carte | Chacun choisit sa visibilité : **fantôme** (par défaut, rien n'est stocké), **amis** ou **tout le monde**. Seule la **zone** (hexagone d'environ 200 m) quitte le téléphone, jamais les coordonnées GPS, et seulement quand l'app est ouverte. Une position disparaît 30 minutes après la dernière mise à jour |
| Inconnus sur la carte | Visibles seulement entre joueurs publics (**réciprocité**), à moins de 2 km de sa propre position, avec une position **arrondie à environ 600 m**. Seuls le pseudo, l'avatar, l'équipe et les pas du jour apparaissent. **Blocage** dans les deux sens (met aussi fin à l'amitié) et retrait de la carte publique après **3 signalements** distincts. La fiche d'un joueur ne donne que des totaux (pas, série, rang, bilan de duels) |
| Suppression de compte | Bouton dans l'onglet Profil, qui efface tout (obligatoire pour l'App Store) |

Le schéma est dans `supabase/migrations/` : `20261021000000_init.sql` (profils, amis, pas, duels) puis `20261022000000_teams.sql` (guerre d'équipes) `20261023000000_map.sql` puis `20261024000000_players_map.sql` (carte des joueurs) et `20261025000000_anticheat.sql` (limites anti-triche).

## Mise en place

### 1. Créer le projet

1. Créez un compte sur [supabase.com](https://supabase.com), puis un **nouveau projet**. La formule gratuite suffit pour démarrer. Choisissez une région proche de vos joueurs, par exemple Paris (`eu-west-3`) ou Francfort.
2. Allez dans **Authentication**, puis **Sign In / Providers**, et activez **Allow anonymous sign-ins**.
3. Recommandé contre les abus : dans **Authentication**, puis **Attack Protection**, activez une protection CAPTCHA. Gardez aussi les limites de débit par défaut.

### 2. Créer les tables

**Option simple :** ouvrez **SQL Editor**, puis **New query**. Collez tout le contenu de `supabase/setup.sql` et cliquez sur **Run**. Ce fichier rassemble toutes les migrations dans l'ordre ; il est régénéré par `scripts/bundle-sql.sh` et `npm run test:db` vérifie qu'il est à jour.

**Option CLI :** elle est préférable pour les futures migrations.

```bash
npx supabase login
npx supabase link --project-ref <référence-du-projet>
npx supabase db push
```

### 3. Brancher l'app

Dans **Project Settings**, puis **API Keys**, copiez l'URL du projet et la clé **publishable**. Si votre projet n'affiche que les anciennes clés, prenez la clé `anon`.

**En développement :**

```bash
cp .env.example .env.local   # puis collez les deux valeurs
npm start
```

**Pour les builds EAS :** `.env.local` n'est pas envoyé dans le cloud, il faut donc déclarer les variables sur EAS.

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxxx.supabase.co --visibility plaintext --environment production --environment preview --environment development
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_KEY --value sb_publishable_xxxx --visibility plaintext --environment production --environment preview --environment development
```

Ces deux valeurs sont **publiques** : elles se retrouvent dans l'app installée, et c'est prévu ainsi. La sécurité repose sur les règles de la base. Ne mettez **jamais** la clé `secret` ou `service_role` dans l'app.

### 4. Vérifier

Installez l'app sur deux téléphones. Sur le premier, onglet Profil, notez le code ami. Sur le second, saisissez ce code dans « Code ami », puis lancez un défi. Les deux téléphones doivent voir le défi et les pas de l'autre, avec 5 minutes de délai au plus. Tirer pour rafraîchir n'existe pas encore ; revenir dans l'app déclenche une mise à jour.

## Tester le schéma en local

```bash
npm run test:db
```

Cette commande crée un Postgres jetable, y applique la migration et vérifie les règles : un inconnu ne voit rien, on ne peut pas modifier le profil d'un autre, les défis sont réservés aux amis, la suppression de compte efface tout, etc. Il faut les binaires Postgres (`initdb`, `pg_ctl`, `psql`). Lancez-la après toute modification du schéma.

```bash
npm run test:api
```

Cette commande teste de bout en bout le code de l'app (`src/lib/api.ts`), avec la même bibliothèque `supabase-js`, contre la base locale exposée par [PostgREST](https://postgrest.org), la couche API de Supabase. PostgREST est téléchargé au premier lancement. Seule la connexion anonyme n'est pas couverte, puisqu'elle relève du service d'authentification de Supabase : vérifiez-la sur un vrai projet.

## Limites connues

- **Comptes anonymes :** si un joueur désinstalle l'app ou change de téléphone, il perd son compte. Sur iOS, les pas des 7 derniers jours reviennent depuis le téléphone, mais pas les amis. Prochaine étape : « Se connecter avec Apple » et « avec Google », que Supabase sait rattacher au compte anonyme existant.
- **Triche :** les pas sont déclarés par le téléphone. Le serveur ne crédite que des pas possibles : 100 000 par jour au plus, et 200 pas par minute écoulée depuis le dernier envoi, plus 2 000 de marge (`record_steps` renvoie les pas crédités). Les anciens jours ne sont pas modifiables. Ces limites bloquent les faux envois, pas quelqu'un qui secoue son téléphone pendant des heures : pour ça, il faudra lire les pas via HealthKit et Health Connect et repérer les profils aberrants.
- **Pas de temps réel :** les données des amis se mettent à jour toutes les 5 minutes et à chaque retour dans l'app. Supabase Realtime pourra rendre les duels instantanés.
- **Déclarations des stores :** avec un serveur, la fiche de confidentialité change. Les pas sont désormais **collectés** et **liés à un identifiant** (le compte anonyme). Mettez à jour la fiche App Store, la section « Sécurité des données » du Play Store et votre politique de confidentialité, en indiquant l'hébergeur Supabase et la région choisie.
