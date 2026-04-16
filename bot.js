const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

let ready = false;
client.once('ready', () => {
  console.log(`[BOT] Connecté en tant que ${client.user.tag}`);
  ready = true;
  initMotivationScheduler();
});

async function start() {
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.warn('[BOT] DISCORD_BOT_TOKEN manquant — le bot ne démarre pas.');
    return;
  }
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

// Vérifie qu'un user Discord est bien sur le serveur configuré
async function isMemberOfGuild(userId) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    return !!member;
  } catch (e) {
    console.error('[BOT] isMemberOfGuild error:', e.message);
    return false;
  }
}

// Envoie un MP à chaque admin configuré
async function dmAdmins(content, files = []) {
  const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of ids) {
    try {
      const user = await client.users.fetch(id);
      await user.send({ content, files });
    } catch (e) {
      console.error(`[BOT] Impossible d'envoyer un MP à ${id}:`, e.message);
    }
  }
}

function notifyBooking({ username, discordId, reason, whatsapp, type }) {
  const label = type === 'free_niche' ? '🎁 APPEL OFFERT (niche)' : '💎 APPEL PAYANT (20 pts)';
  const msg =
    `**📞 Nouvelle réservation 1to1**\n\n` +
    `${label}\n` +
    `**Client :** ${username} (<@${discordId}>)\n` +
    `**WhatsApp :** ${whatsapp}\n` +
    `**Raison :** ${reason}`;
  return dmAdmins(msg);
}

function notifyProof({ username, discordId, type, filename, pointsAwarded, totalPoints }) {
  const label = type === 'video' ? '🎥 VIDÉO (20 pts)' : '📸 SCREENSHOT (10 pts)';
  const msg =
    `**🏆 Nouvelle preuve de résultat**\n\n` +
    `${label}\n` +
    `**Client :** ${username} (<@${discordId}>)\n` +
    `**Points attribués :** +${pointsAwarded}\n` +
    `**Solde total :** ${totalPoints} pts`;
  const file = new AttachmentBuilder(path.join(__dirname, 'uploads', filename));
  return dmAdmins(msg, [file]);
}

// ---------- Messages de motivation ----------
const MOTIVATION_MESSAGES = [
  "@here Les gars, le volume c'est trop important, c'est ça qui fait tout. Plus tu postes, plus t'as de data sur ce qui a marché ou non. 🔥",
  "@here Celui qui bosse pas, je lui botte les fesses. 👟",
  "@here Les gars, faites pas les flemmards, je sais que vous scrollez là. Va faire une vidéo. 📱",
  "@here Si tu scrolles 1h par jour, c'est chaud frérot. Ça veut dire que tu postes pas 1 vidéo par jour. À la fin du mois ça fait 30 vidéos, si chaque vidéo fait 33€ en moyenne, t'as perdu 1k à scroller. 💸",
  "@here Les gars, postez. 🎬",
  "@here Salut les gars, n'oubliez pas de bosser. 💪",
  "@here Au boulot tout le monde. ⚡",
  "@here Si tu joues 2h/jour aux jeux vidéo, tu perds 2k par mois. Si 1 vidéo = 1h et que tu gagnes 33€ en moyenne, à la fin du mois tu perds 2k à cause de Valorant broooo wtf. 🎮💸",
  "@here Poste. 🎥",
  "@here Poste plus. 🚀",
  "@here Une citation d'un grand homme dit : \"Si tu postes pas plus je vais te botter le cul\". POSTE. 👟",
  "@here Mon reuf, et oui la notif chiante c'est bien ce bot qui te dit de poster plus. 😎",
  "@here Urgent urgent urgent. Si t'as cliqué sur la notif mon gars c'est chaud, t'es pas focus là, va travailler. 🚨",
  "@here Let's go try hard guys. 🔥",
  "@here 3 vidéos par jour, c'est le goal. 🎯",
  "@here 1 vidéo par jour c'est pas ouf boss, faut que tu vises encore plus. 📈",
  "@here Les gars, des fois on se sent un peu perdu, mais c'est important de rien lâcher. 💎",
];

function pickRandomMotivation() {
  return MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];
}

async function sendMotivation() {
  const channelId = process.env.MOTIVATION_CHANNEL_ID || process.env.ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({
      content: pickRandomMotivation(),
      allowedMentions: { parse: ['everyone'] }, // 'everyone' couvre aussi @here
    });
    console.log('[BOT] Message de motivation envoyé.');
  } catch (e) {
    console.error('[BOT] sendMotivation error:', e.message);
  }
}

// Planifie le prochain message à une heure aléatoire entre 10h et 21h du lendemain
function scheduleNextMotivation() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1); // demain
  const hour = 10 + Math.floor(Math.random() * 12); // 10 à 21
  const minute = Math.floor(Math.random() * 60);
  next.setHours(hour, minute, 0, 0);
  const delay = next.getTime() - now.getTime();
  console.log(`[BOT] Prochain message de motivation prévu : ${next.toLocaleString('fr-FR')}`);
  setTimeout(async () => {
    await sendMotivation();
    scheduleNextMotivation();
  }, delay);
}

// Au démarrage : si on est avant 21h, prévoit un message dans la journée; sinon demain
function initMotivationScheduler() {
  const now = new Date();
  const todayTarget = new Date(now);
  const minHour = Math.max(now.getHours() + 1, 10); // au moins dans 1h et après 10h
  if (minHour <= 21) {
    const hour = minHour + Math.floor(Math.random() * (22 - minHour));
    const minute = Math.floor(Math.random() * 60);
    todayTarget.setHours(hour, minute, 0, 0);
    const delay = todayTarget.getTime() - now.getTime();
    console.log(`[BOT] 1er message de motivation prévu : ${todayTarget.toLocaleString('fr-FR')}`);
    setTimeout(async () => {
      await sendMotivation();
      scheduleNextMotivation();
    }, delay);
  } else {
    scheduleNextMotivation();
  }
}

async function announceNewRediff({ title, url, coach }) {
  const channelId = process.env.ANNOUNCE_CHANNEL_ID;
  if (!channelId) {
    console.warn('[BOT] ANNOUNCE_CHANNEL_ID manquant — annonce rediff skippée.');
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const msg = `@everyone aller voir sur ${siteUrl} une nouvelle rediff de coaching 📺`;
    await channel.send({
      content: msg,
      allowedMentions: { parse: ['everyone'] },
    });
  } catch (e) {
    console.error('[BOT] announceNewRediff error:', e.message);
  }
}

function notifyNicheAnswer({ username, discordId, answer }) {
  const msg =
    `**🔔 Réponse popup appel niche**\n\n` +
    `**Client :** ${username} (<@${discordId}>)\n` +
    `**A déjà fait l'appel niche ?** ${answer ? 'OUI (pas d\'appel offert)' : 'NON (appel offert dispo)'}`;
  return dmAdmins(msg);
}

module.exports = {
  start,
  isMemberOfGuild,
  notifyBooking,
  notifyProof,
  notifyNicheAnswer,
  announceNewRediff,
  sendMotivation, // utile pour tester manuellement
  isReady: () => ready,
};
