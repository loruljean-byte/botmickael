// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', 3200);
}

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) { location.href = '/'; return; }
  return res;
}

// ---------- State ----------
let me = null;

// ---------- Init ----------
(async () => {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (!res.ok) { location.href = '/'; return; }
  me = await res.json();
  renderUser();

  if (me.is_admin) $('#adminTab').style.display = 'block';

  // Popup niche si pas encore répondu
  if (me.niche_call_done === null) $('#nicheModal').classList.add('show');

  loadPlanning();
  loadRediffs();
  renderAppels();
})();

function renderUser() {
  $('#userChip').style.display = 'flex';
  $('#userName').textContent = me.username;
  $('#userPoints').textContent = me.points;
  $('#pointsBig').textContent = me.points;
  const avatarUrl = me.avatar
    ? `https://cdn.discordapp.com/avatars/${me.discord_id}/${me.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  $('#userAvatar').src = avatarUrl;
}

// ---------- Tabs ----------
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ---------- Logout ----------
$('#logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  location.href = '/';
});

// ---------- Niche popup ----------
$('#nicheYes').addEventListener('click', () => submitNiche(true));
$('#nicheNo').addEventListener('click', () => submitNiche(false));

async function submitNiche(done) {
  const res = await api('/api/niche-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done }),
  });
  if (res && res.ok) {
    me.niche_call_done = done ? 1 : 0;
    $('#nicheModal').classList.remove('show');
    renderAppels();
    toast(done ? 'Noté : appel offert non disponible.' : '🎁 Ton appel offert est disponible !', 'success');
  }
}

// ---------- Planning ----------
async function loadPlanning() {
  const res = await fetch('/api/planning');
  const list = await res.json();
  const grid = $('#planningGrid');
  grid.innerHTML = list.map(s => {
    const coachClass = s.coach === 'frak' ? 'coach-frak' : 'coach-zayoon';
    return `
      <div class="card ${coachClass}">
        <div class="day-title"><span class="live-dot"></span>${s.day}</div>
        <div class="time-big">${s.time}</div>
        <p>Coaching de groupe en direct</p>
        <div class="coach-tag ${s.coach}">Avec ${s.coach}</div>
      </div>
    `;
  }).join('');
}

// ---------- Rediffs ----------
async function loadRediffs() {
  const res = await api('/api/rediffs');
  if (!res) return;
  const list = await res.json();
  const c = $('#rediffsList');
  if (!list.length) { $('#noRediffs').style.display = 'block'; c.innerHTML = ''; return; }
  $('#noRediffs').style.display = 'none';
  c.innerHTML = list.map(r => {
    const coachCls = r.coach === 'frak' ? 'by-frak' : r.coach === 'zayoon' ? 'by-zayoon' : '';
    return `
    <div class="rediff-item ${coachCls}">
      <div class="rediff-info">
        <h4>${escapeHtml(r.title)}</h4>
        <span>${r.coach ? 'Coach : ' + r.coach + ' · ' : ''}${new Date(r.created_at * 1000).toLocaleDateString('fr-FR')}</span>
      </div>
      <div class="rediff-actions">
        <a class="icon-btn" href="${escapeAttr(r.url)}" target="_blank" rel="noopener" title="Ouvrir">▶</a>
        ${me.is_admin ? `<button class="icon-btn" onclick="deleteRediff(${r.id})" title="Supprimer">🗑</button>` : ''}
      </div>
    </div>
    `;
  }).join('');
}

window.deleteRediff = async (id) => {
  if (!confirm('Supprimer cette rediff ?')) return;
  const res = await api('/api/rediffs/' + id, { method: 'DELETE' });
  if (res && res.ok) { toast('Rediff supprimée', 'success'); loadRediffs(); }
};

const triggerMotivBtn = document.getElementById('triggerMotivBtn');
if (triggerMotivBtn) {
  triggerMotivBtn.addEventListener('click', async () => {
    triggerMotivBtn.disabled = true;
    const res = await api('/api/motivation/trigger', { method: 'POST' });
    triggerMotivBtn.disabled = false;
    if (res && res.ok) toast('Message envoyé dans le salon général ✅', 'success');
    else toast('Erreur lors de l\'envoi', 'error');
  });
}

$('#addRediffBtn').addEventListener('click', async () => {
  const title = $('#newTitle').value.trim();
  const url = $('#newUrl').value.trim();
  const coach = $('#newCoach').value;
  if (!title || !url) return toast('Titre et lien requis', 'error');
  const res = await api('/api/rediffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, url, coach }),
  });
  if (res && res.ok) {
    $('#newTitle').value = ''; $('#newUrl').value = ''; $('#newCoach').value = '';
    toast('Rediff ajoutée', 'success');
    loadRediffs();
  }
});

// ---------- Appels 1to1 ----------
function renderAppels() {
  const body = $('#appelsBody');
  const freeAvailable = me.niche_call_done === 0;
  const canPay = me.points >= 20;

  body.innerHTML = `
    ${freeAvailable ? `
      <div class="card" style="margin-bottom:16px; background:linear-gradient(135deg,rgba(255,214,10,0.12),rgba(255,159,10,0.06)); border-color:rgba(255,159,10,0.35)">
        <h3>🎁 Appel offert — découverte de niche</h3>
        <p>Un appel privé gratuit pour trouver ta niche TikTok avec zayoon.</p>
        <button class="btn btn-gold" style="margin-top:16px" id="bookFreeBtn">Réserver mon appel offert</button>
      </div>
    ` : ''}

    <div class="card" style="background:linear-gradient(135deg,rgba(191,90,242,0.12),rgba(255,55,95,0.06)); border-color:rgba(191,90,242,0.35)">
      <h3>💎 Appel 1to1 supplémentaire</h3>
      <p>Un appel privé sur mesure pour débloquer ta stratégie. Coût : <strong>20 points</strong>.</p>
      <p style="margin-top:8px">Solde actuel : <strong>${me.points} pts</strong></p>
      <button class="btn btn-accent" style="margin-top:16px" id="bookPaidBtn" ${!canPay ? 'disabled' : ''}>
        ${canPay ? 'Réserver (−20 pts)' : 'Pas assez de points'}
      </button>
    </div>
  `;

  const freeBtn = $('#bookFreeBtn');
  if (freeBtn) freeBtn.addEventListener('click', () => openBooking('free_niche'));
  $('#bookPaidBtn').addEventListener('click', () => openBooking('paid'));
}

let bookingType = null;
function openBooking(type) {
  bookingType = type;
  $('#bookingTitle').textContent = type === 'free_niche' ? '🎁 Réserver l\'appel offert' : '💎 Réserver un appel 1to1 (−20 pts)';
  $('#bookingSub').textContent = type === 'free_niche'
    ? 'Appel découverte de niche. zayoon te contactera sur WhatsApp.'
    : '20 points seront déduits de ton solde à la confirmation.';
  $('#bookReason').value = '';
  $('#bookWhatsapp').value = '';
  $('#bookingModal').classList.add('show');
}

$('#bookCancel').addEventListener('click', () => $('#bookingModal').classList.remove('show'));

$('#bookConfirm').addEventListener('click', async () => {
  const reason = $('#bookReason').value.trim();
  const whatsapp = $('#bookWhatsapp').value.trim();
  if (!reason || !whatsapp) return toast('Raison et numéro WhatsApp requis', 'error');

  const btn = $('#bookConfirm');
  btn.disabled = true;

  const res = await api('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, whatsapp, coach: bookingCoach, useFreeNiche: bookingType === 'free_niche' }),
  });

  btn.disabled = false;

  if (!res) return;
  const data = await res.json();
  if (!res.ok) {
    const messages = {
      not_enough_points: 'Pas assez de points.',
      not_eligible_free: 'Tu n\'es pas éligible à l\'appel offert.',
      missing_fields: 'Champs manquants.',
    };
    return toast(messages[data.error] || 'Erreur', 'error');
  }

  $('#bookingModal').classList.remove('show');
  toast('Réservation envoyée ! On te contacte vite sur WhatsApp.', 'success');

  // refresh état user
  const meRes = await fetch('/api/me', { credentials: 'include' });
  me = await meRes.json();
  renderUser();
  renderAppels();
});

// ---------- Points (uploads) ----------
$('#uploadScreen').addEventListener('change', (e) => uploadProof(e.target.files[0], 'screenshot'));
$('#uploadVideo').addEventListener('change',  (e) => uploadProof(e.target.files[0], 'video'));

async function uploadProof(file, type) {
  if (!file) return;
  toast('Envoi en cours…');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  const res = await api('/api/proofs', { method: 'POST', body: fd });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'cooldown') {
      applyCooldown(data.nextAvailableAt);
      return toast('Tu dois attendre avant ta prochaine preuve.', 'error');
    }
    return toast(data.error || 'Erreur envoi', 'error');
  }
  toast(`+${type === 'video' ? 20 : 10} points ! Solde : ${data.points}`, 'success');
  me.points = data.points;
  renderUser();
  renderAppels();
  loadCooldown();
}

// ---------- Cooldown 14 jours ----------
let cooldownTimer = null;

async function loadCooldown() {
  const res = await api('/api/proof-cooldown');
  if (!res) return;
  const { nextAvailableAt } = await res.json();
  applyCooldown(nextAvailableAt);
}

function applyCooldown(nextAvailableAt) {
  clearInterval(cooldownTimer);
  const banner = $('#cooldownBanner');
  const cardScreen = $('#cardScreen');
  const cardVideo = $('#cardVideo');
  const inputScreen = $('#uploadScreen');
  const inputVideo = $('#uploadVideo');

  const update = () => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = nextAvailableAt - now;
    if (!nextAvailableAt || remaining <= 0) {
      banner.style.display = 'none';
      [cardScreen, cardVideo].forEach(c => { c.style.opacity = '1'; c.style.pointerEvents = 'auto'; });
      inputScreen.disabled = false;
      inputVideo.disabled = false;
      clearInterval(cooldownTimer);
      return;
    }
    const d = Math.floor(remaining / 86400);
    const h = Math.floor((remaining % 86400) / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    banner.style.display = 'block';
    banner.innerHTML = `⏳ Prochaine preuve disponible dans <strong>${d}j ${h}h ${m}m</strong>.`;
    [cardScreen, cardVideo].forEach(c => { c.style.opacity = '0.4'; c.style.pointerEvents = 'none'; });
    inputScreen.disabled = true;
    inputVideo.disabled = true;
  };
  update();
  cooldownTimer = setInterval(update, 60 * 1000); // refresh chaque minute
}

// init
loadCooldown();

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
