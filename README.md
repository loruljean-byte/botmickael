# Monet x Wu — Site membres (TikTok Money)

Site privé pour les clients de l'accompagnement, avec login Discord, planning, rediffs, réservation d'appels 1to1 et système de points.

## 🧰 Stack
- Node.js + Express
- SQLite (`better-sqlite3`)
- Discord OAuth2 + bot (`discord.js`)
- Upload fichiers (`multer`)
- Front HTML/CSS/JS vanilla, style Apple minimaliste

## 🚀 Lancer en local

```bash
cd coaching-site
npm install
cp .env.example .env     # puis édite .env avec tes vraies valeurs
npm start
```

Ouvre http://localhost:3000

## 🔐 Admin
Les comptes Discord listés dans `ADMIN_DISCORD_IDS` (dans `.env`) voient un onglet **Admin** pour ajouter/supprimer des rediffs, et reçoivent tous les MP du bot (réservations, screenshots, vidéos, réponse popup niche).

## 🤖 Bot Discord
Le bot envoie un MP aux admins à chaque :
- Réservation d'appel 1to1 (offert ou payant)
- Upload de screenshot (10 pts) ou vidéo (20 pts)
- Réponse au popup "appel niche déjà fait ?"

Le bot doit être **sur le serveur Discord configuré** (`GUILD_ID`).

## 💾 Données
Tout est stocké dans `data.db` (SQLite, fichier local). Les fichiers uploadés dans `uploads/`.

## ☁️ Déploiement prod
Héberge sur un VPS (Hetzner, Railway, Render, VPS OVH…). Pense à :
- Changer `DISCORD_REDIRECT_URI` vers ton domaine `https://tondomaine.com/auth/callback`
- Ajouter cette URL dans **Discord Developer Portal → OAuth2 → Redirects**
- Mettre un `SESSION_SECRET` long et aléatoire
- Activer HTTPS (Caddy, Nginx + Certbot, Cloudflare)
