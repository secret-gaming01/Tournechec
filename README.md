<div align="center">

<img src="media/images/logo.svg" width="110" alt="Logo Tournechec">

# Tournechec

**Organisez des tournois d'échecs rapidement et efficacement** — du club scolaire au grand événement.

[![Site en ligne](https://img.shields.io/badge/Site-tournechec-2f54eb?style=for-the-badge&logo=github&logoColor=white)](https://secret-gaming01.github.io/Tournechec/)
[![Statut](https://img.shields.io/badge/Statut-En%20ligne-success?style=for-the-badge)](https://secret-gaming01.github.io/Tournechec/)

### Accéder au site : https://secret-gaming01.github.io/Tournechec/

</div>

---

## Fonctionnalités

- **Comptes sécurisés** — inscription, connexion, rôles joueur / arbitre / admin (Supabase Auth)
- **Tournois publics ou privés** — création guidée, règlements intégrés, consentement obligatoire
- **Appariements automatiques** — système suisse (par Elo, sans revanches, byes gérés) ou élimination directe
- **Classement en direct** — points, V/N/D et départage Buchholz, rafraîchi automatiquement
- **Projecteur salle** — affichage plein écran des tables, actualisé toutes les 15 secondes
- **Panels dédiés** — joueur, arbitre (présences, pointages, export CSV) et admin (modération, notifications, statistiques)
- **Notifications internes** — invitations, publication des tables, fin de tournoi
- **Conforme RGPD** — mentions légales, politique de confidentialité, suppression de compte en 1 clic

## Technologies

HTML / CSS / JavaScript pur (aucun framework) · [GitHub Pages](https://pages.github.com) pour l'hébergement · [Supabase](https://supabase.com) pour la base de données, l'authentification et la sécurité Row Level Security.

## Droits d'utilisation

Le site Tournechec est **libre d'utilisation** pour organiser et participer à des tournois d'échecs.

En revanche, le code source est un **logiciel propriétaire** : copie, modification, redistribution et déploiement de versions dérivées sont **interdits** sans l'autorisation écrite de l'auteur. Voir [LICENSE.txt](LICENSE.txt).

## Structure du projet

```
tournechec/
├── *.html               # 18 pages (accueil, panels, aide, légal...)
├── js/
│   ├── config.js        # Tes clés Supabase (à personnaliser)
│   ├── api.js           # Couche données Supabase + appariements
│   ├── navigation.js    # En-tête, pied de page, garde par rôle
│   └── animations.js    # Toasts, modales, animations d'apparition
├── styles/              # 4 feuilles de style (thème clair responsive)
├── media/images/        # Logo et visuels
└── schema.sql           # Schéma complet PostgreSQL + RLS
```

---

<div align="center">

Développé par [secret_gaming01](https://github.com/Secret-gaming01) · [Twitch](https://www.twitch.tv/secret_gaming01) · [Portfolio](https://secret-gaming01.github.io/portfolio/)

[Mentions légales](https://secret-gaming01.github.io/Tournechec/mentions-legales.html) · [Confidentialité](https://secret-gaming01.github.io/Tournechec/confidentialite.html) · [Aide](https://secret-gaming01.github.io/Tournechec/aide.html)

</div>
