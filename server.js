require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const db = require('./db');
const bot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middlewares ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 jours
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Uploads (multer) ----------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max (vidéos)
});

// ---------- Helpers ----------
const ADMIN_IDS = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
function isAdminId(id) { return ADMIN_IDS.includes(id); }

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'not_authenticated' });
  if (!isAdminId(req.session.user.discord_id)) return res.status(403).json({ error: 'not_admin' });
  next();
}

// ---------- OAuth2 Discord ----------
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    // Échange code -> token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=oauth_failed');

    // Récupère profil
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Récupère la liste des guilds de l'utilisateur
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const guilds = await guildsRes.json();

    const isInGuildOAuth = Array.isArray(guilds) && guilds.some(g => g.id === process.env.GUILD_ID);
    // Double-vérif via le bot (plus fiable)
    const isInGuildBot = await bot.isMemberOfGuild(user.id).catch(() => false);

    if (!isInGuildOAuth && !isInGuildBot) {
      return res.redirect('/?error=not_in_server');
    }

    // Upsert user
    const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(user.id);
    if (existing) {
      db.prepare('UPDATE users SET username = ?, avatar = ? WHERE discord_id = ?')
        .run(user.username, user.avatar, user.id);
    } else {
      db.prepare('INSERT INTO users (discord_id, username, avatar) VALUES (?, ?, ?)')
        .run(user.id, user.username, user.avatar);
    }

    req.session.user = {
      discord_id: user.id,
      username: user.username,
      avatar: user.avatar,
      is_admin: isAdminId(user.id),
    };
    res.redirect('/app.html');
  } catch (e) {
    console.error('OAuth error:', e);
    res.redirect('/?error=oauth_failed');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------- API ----------
app.get('/api/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT discord_id, username, avatar, points, niche_call_done FROM users WHERE discord_id = ?')
    .get(req.session.user.discord_id);
  res.json({ ...row, is_admin: req.session.user.is_admin });
});

// Popup niche
app.post('/api/niche-answer', requireAuth, async (req, res) => {
  const { done } = req.body; // true = déjà fait, false = pas fait
  const val = done ? 1 : 0;
  db.prepare('UPDATE users SET niche_call_done = ? WHERE discord_id = ?')
    .run(val, req.session.user.discord_id);
  await bot.notifyNicheAnswer({
    username: req.session.user.username,
    discordId: req.session.user.discord_id,
    answer: !!done,
  }).catch(() => {});
  res.json({ ok: true });
});

// Planning (statique)
app.get('/api/planning', (_req, res) => {
  res.json([
    { day: 'Lundi',    time: '20h30', coach: 'frak'    },
    { day: 'Mercredi', time: '20h30', coach: 'frak'    },
    { day: 'Jeudi',    time: '20h30', coach: 'zayoon'  },
    { day: 'Samedi',   time: '20h30', coach: 'zayoon'  },
  ]);
});

// Rediffs
app.get('/api/rediffs', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM rediffs ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/rediffs', requireAdmin, async (req, res) => {
  const { title, url, coach } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'missing_fields' });
  const info = db.prepare('INSERT INTO rediffs (title, url, coach, created_by) VALUES (?, ?, ?, ?)')
    .run(title, url, coach || null, req.session.user.discord_id);
  // Annonce dans le salon général
  bot.announceNewRediff({ title, url, coach }).catch(e => console.error('announceNewRediff:', e.message));
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/rediffs/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM rediffs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Déclenche manuellement un message de motivation (admin uniquement)
app.post('/api/motivation/trigger', requireAdmin, async (_req, res) => {
  try {
    await bot.sendMotivation();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Booking 1to1
app.post('/api/bookings', requireAuth, async (req, res) => {
  const { reason, whatsapp, useFreeNiche } = req.body;
  if (!reason || !whatsapp) return res.status(400).json({ error: 'missing_fields' });

  const u = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(req.session.user.discord_id);
  let type = 'paid';

  if (useFreeNiche) {
    if (u.niche_call_done !== 0) {
      return res.status(400).json({ error: 'not_eligible_free' });
    }
    type = 'free_niche';
    db.prepare('UPDATE users SET niche_call_done = 1 WHERE discord_id = ?').run(u.discord_id);
  } else {
    if (u.points < 20) return res.status(400).json({ error: 'not_enough_points' });
    db.prepare('UPDATE users SET points = points - 20 WHERE discord_id = ?').run(u.discord_id);
  }

  db.prepare('INSERT INTO bookings (discord_id, reason, whatsapp, type) VALUES (?, ?, ?, ?)')
    .run(u.discord_id, reason, whatsapp, type);

  await bot.notifyBooking({
    username: u.username,
    discordId: u.discord_id,
    reason,
    whatsapp,
    type,
  }).catch(e => console.error('notifyBooking failed:', e.message));

  res.json({ ok: true });
});

// Cooldown = 14 jours en secondes
const PROOF_COOLDOWN = 14 * 24 * 60 * 60;

// Renvoie le timestamp UNIX (secondes) à partir duquel l'utilisateur peut reposter
function getProofCooldown(discordId) {
  const last = db.prepare('SELECT created_at FROM proofs WHERE discord_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(discordId);
  if (!last) return 0;
  const nextAvailable = last.created_at + PROOF_COOLDOWN;
  const now = Math.floor(Date.now() / 1000);
  return nextAvailable > now ? nextAvailable : 0;
}

app.get('/api/proof-cooldown', requireAuth, (req, res) => {
  res.json({ nextAvailableAt: getProofCooldown(req.session.user.discord_id) });
});

// Preuves (screenshots / vidéos)
app.post('/api/proofs', requireAuth, upload.single('file'), async (req, res) => {
  const { type } = req.body; // 'screenshot' ou 'video'
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  if (!['screenshot', 'video'].includes(type)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'bad_type' });
  }

  // Cooldown 14 jours
  const nextAvailable = getProofCooldown(req.session.user.discord_id);
  if (nextAvailable > 0) {
    fs.unlink(req.file.path, () => {}); // supprime le fichier uploadé
    return res.status(429).json({ error: 'cooldown', nextAvailableAt: nextAvailable });
  }

  const points = type === 'video' ? 20 : 10;
  const u = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(req.session.user.discord_id);

  db.prepare('INSERT INTO proofs (discord_id, type, filename, points_awarded) VALUES (?, ?, ?, ?)')
    .run(u.discord_id, type, req.file.filename, points);
  db.prepare('UPDATE users SET points = points + ? WHERE discord_id = ?').run(points, u.discord_id);

  const updated = db.prepare('SELECT points FROM users WHERE discord_id = ?').get(u.discord_id);

  await bot.notifyProof({
    username: u.username,
    discordId: u.discord_id,
    type,
    filename: req.file.filename,
    pointsAwarded: points,
    totalPoints: updated.points,
  }).catch(e => console.error('notifyProof failed:', e.message));

  res.json({ ok: true, points: updated.points });
});

// ---------- Pages protégées ----------
app.get('/app.html', (req, res, next) => {
  if (!req.session.user) return res.redirect('/');
  next();
});
app.get('/admin.html', (req, res, next) => {
  if (!req.session.user) return res.redirect('/');
  if (!isAdminId(req.session.user.discord_id)) return res.redirect('/app.html');
  next();
});

// ---------- Start ----------
(async () => {
  try { await bot.start(); } catch (e) { console.error('Bot start failed:', e.message); }
  app.listen(PORT, () => {
    console.log(`\n🚀 Site en ligne : http://localhost:${PORT}\n`);
  });
})();
