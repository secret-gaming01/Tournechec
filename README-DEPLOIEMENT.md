# Tournechec

Site professionnel pour organiser des tournois d'échecs rapidement et efficacement.
Hébergement : **GitHub Pages** (site 100 % statique) + **Supabase** (base de données, comptes et sécurité).

## Ce que contient le projet

- Site complet en HTML/CSS/JS (aucun framework, ultra rapide).
- Backend : **Supabase** (PostgreSQL + Auth + Row Level Security). Aucun serveur à gérer.
- `schema.sql` : tout le schéma de base de données (tables, déclencheurs, politiques de sécurité RLS).
- `js/api.js` : couche d'accès aux données qui parle directement à Supabase depuis le navigateur.
- Comptes avec confirmation par courriel (gérée par Supabase Auth), rôles joueur / arbitre / admin.
- Notifications internes : tables publiées, fin de tournoi, invitations, annonces manuelles de l'admin.
- Sécurité : mots de passe gérés par Supabase Auth (hachage bcrypt côté serveur Supabase), politiques RLS sur chaque table, anti-bot (honeypot) sur les formulaires publics, double confirmation côté client.

## Déploiement pas à pas (20 minutes)

### 1. Créer le projet Supabase (gratuit)

1. Va sur https://supabase.com et crée un compte.
2. « New project » : donne-lui un nom (ex. `tournechec`), une région proche (ex. `East US`) et un mot de passe de base de données (note-le quelque part).
3. Attends ~2 minutes que le projet soit provisionné.

### 2. Créer les tables

1. Dans Supabase, ouvre **SQL Editor** → **New query**.
2. Copie-colle TOUT le contenu du fichier `schema.sql` de ce dossier, puis clique **Run**.
3. Vérifie dans **Table Editor** que les tables apparaissent : `profiles`, `tournaments`, `tournament_arbitres`, `registrations`, `rounds`, `matches`, `notifications`, `support_messages`.

> Le premier compte créé devient automatiquement administrateur.

### 3. Récérer les clés et configurer le site

1. Dans Supabase : **Project Settings** → **API**.
2. Copie :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - **anon public** key (la clé publique, PAS la clé `service_role` — ne la mets jamais ici)
3. Ouvre `js/config.js` et remplace les deux valeurs :

```js
window.TOURNECHEC_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi....",
};
```

### 4. Configurer l'authentification

Dans Supabase : **Authentication** → **Providers** → **Email** :

- **Confirm email** : activé (recommandé) → les nouveaux comptes reçoivent un courriel de confirmation avant de pouvoir se connecter.
- Pour des tests rapides en classe, tu peux le désactiver : la connexion sera immédiate après l'inscription.

Optionnel (**Authentication** → **URL Configuration**) : mets **Site URL** à l'adresse finale du site (ex. `https://toncompte.github.io/tournechec/`) pour que les liens des courriels pointent au bon endroit.

### 5. Publier sur GitHub Pages

1. Crée un dépôt sur https://github.com (ex. `tournechec`).
2. Envoie tout le contenu de ce dossier dans le dépôt :

```
git init
git add .
git commit -m "Tournechec"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/tournechec.git
git push -u origin main
```

3. Sur GitHub : **Settings** → **Pages** → **Source** : `Deploy from a branch`, branche `main`, dossier `/ (root)` → **Save**.
4. Attends 1–2 minutes : le site est en ligne sur `https://toncompte.github.io/tournechec/`.
5. Ouvre le site, crée ton compte : il devient automatiquement **admin**.

## Limites connues (version GitHub Pages)

- Les courriels de tournoi sont remplacés par des **notifications internes** visibles dans l'espace utilisateur et dans le journal de l'admin (onglet « Notifications »). Seuls les courriels de confirmation de compte et de réinitialisation de mot de passe sont envoyés réellement (par Supabase).
- Pas de bans d'IP possible sans serveur : l'onglet admin correspondant a été remplacé par la boîte de **messages de support**. Tu peux toujours bannir des comptes.
- La suppression de compte retire toutes les données du profil ; l'utilisateur d'authentification résiduel peut être supprimé manuellement dans **Authentication → Users** si besoin.

## Mettre à jour le site

Modifie les fichiers, puis :

```
git add .
git commit -m "Description des changements"
git push
```

GitHub Pages redéploie automatiquement en ~1 minute.
