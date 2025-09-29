// Simple frontend session handling with backend integration
const SESSION_KEY = 'ieee_session_v1';
const API_BASE = '';

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body && body.error) || res.statusText);
  return body;
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function setSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function protectDashboard() {
  const session = getSession();
  if (session && session.role === 'bearer') return;
  // Try server session (cookie)
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(me => {
      if (!(me && me.user && me.user.role === 'bearer')) location.replace('login.html');
    })
    .catch(() => location.replace('login.html'));
}

function onLoginSubmit() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const role = String(data.get('role') || 'member');
    const msg = document.getElementById('loginMsg');

    if (!email.includes('@')) { msg.textContent = 'Please enter a valid email.'; return; }

    // Try backend login first
    api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, role }) })
      .then(() => {
        msg.textContent = 'Logged in successfully. Redirecting...';
        setTimeout(()=>{ location.href = role === 'bearer' ? 'dashboard.html' : 'home.html'; }, 300);
      })
      .catch(() => {
        // Fallback to local session if backend not running
        const session = { email, role, name: email.split('@')[0], loggedInAt: Date.now() };
        setSession(session);
        msg.textContent = 'Logged in (local). Redirecting...';
        setTimeout(()=>{ location.href = role === 'bearer' ? 'dashboard.html' : 'home.html'; }, 300);
      });
  });
}

function onLogoutLink() {
  const link = document.getElementById('logoutLink');
  if (!link) return;
  link.addEventListener('click', function (e) {
    e.preventDefault();
    api('/api/auth/logout', { method: 'POST' }).catch(()=>{}).finally(()=>{
      clearSession();
      location.href = 'login.html';
    });
  });
}

// Minimal in-memory store for events before backend
const EVENTS_KEY = 'ieee_events_v1';
function getEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch { return []; }
}
function setEvents(list) { localStorage.setItem(EVENTS_KEY, JSON.stringify(list)); }

function wireEventForm() {
  const form = document.getElementById('eventForm');
  if (!form) return;
  protectDashboard();
  const msg = document.getElementById('eventMsg');
  const list = document.getElementById('eventsList');

  function render() {
    // Prefer server events; fallback to local
    fetch('/api/events', { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d.events) ? d.events : [])
      .catch(()=> getEvents())
      .then(events => {
        list.innerHTML = '';
        for (const ev of events.slice().reverse()) {
          const li = document.createElement('li');
          li.textContent = `${ev.date} — ${ev.title} @ ${ev.venue}`;
          list.appendChild(li);
        }
      });
  }

  render();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const date = String(data.get('date') || '').trim();
    const venue = String(data.get('venue') || '').trim();

    if (!title || !date || !venue) { msg.textContent = 'Please fill all fields.'; return; }

    const photosInput = document.getElementById('photos');
    const fd = new FormData();
    fd.append('title', title);
    fd.append('date', date);
    fd.append('venue', venue);
    if (photosInput && photosInput.files) {
      Array.from(photosInput.files).slice(0, 10).forEach(f => fd.append('photos', f));
    }

    // Try server first, fallback to local persistence
    fetch('/api/events', { method: 'POST', body: fd, credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Server error')))
      .then(() => { msg.textContent = 'Event saved on server.'; form.reset(); render(); })
      .catch(() => {
        const events = getEvents();
        events.push({ id: Date.now(), title, date, venue, photos: [] });
        setEvents(events);
        msg.textContent = 'Event saved locally (server offline).';
        form.reset();
        render();
      });
  });
}

// Notifications via SSE
function initNotifications() {
  try {
    const es = new EventSource('/api/notifications');
    es.addEventListener('event:new', (e) => {
      const data = JSON.parse(e.data || '{}');
      showToast(`New event: ${data.title} @ ${data.venue} on ${data.date}`);
    });
  } catch { /* ignore */ }
}

function ensureToastContainer() {
  let el = document.getElementById('toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toasts';
    el.style.position = 'fixed';
    el.style.top = '16px';
    el.style.right = '16px';
    el.style.zIndex = '50';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message) {
  const c = ensureToastContainer();
  const div = document.createElement('div');
  div.className = 'glass';
  div.style.padding = '10px 14px';
  div.style.marginTop = '10px';
  div.textContent = message;
  c.appendChild(div);
  setTimeout(()=>{ div.remove(); }, 6000);
}

// Boot per page
document.addEventListener('DOMContentLoaded', function () {
  onLoginSubmit();
  onLogoutLink();
  wireEventForm();
  initNotifications();
  updateNavbar();
  wireTeam();
  wireOnboard();
  wireAchievements();
});

async function updateNavbar() {
  const links = document.querySelector('.nav-links');
  if (!links) return;
  let user = null;
  try {
    const me = await api('/api/auth/me');
    user = me && me.user;
  } catch {
    user = getSession();
  }
  const loginLink = Array.from(links.querySelectorAll('a')).find(a => /login\.html$/i.test(a.getAttribute('href') || ''));
  if (!loginLink) return;
  // Ensure dashboard link exists for bearers
  let dash = Array.from(links.querySelectorAll('a')).find(a => /dashboard\.html$/i.test(a.getAttribute('href') || ''));
  if (user && user.role === 'bearer') {
    if (!dash) {
      dash = document.createElement('a');
      dash.href = 'dashboard.html';
      dash.textContent = 'Dashboard';
      links.insertBefore(dash, loginLink);
    }
  } else if (dash) {
    dash.remove();
  }
  if (user) {
    loginLink.textContent = 'Logout';
    loginLink.id = 'logoutLink';
    loginLink.href = 'login.html';
    onLogoutLink();
  } else {
    loginLink.textContent = 'Login';
    loginLink.id = '';
    loginLink.href = 'login.html';
  }
}

// Team management
function wireTeam() {
  const form = document.getElementById('teamForm');
  const list = document.getElementById('teamList');
  const msg = document.getElementById('teamMsg');
  if (!form || !list) return;
  protectDashboard();

  function render() {
    fetch('/api/team').then(r => r.json()).then(d => Array.isArray(d.team) ? d.team : [])
      .then(team => {
        list.innerHTML = '';
        for (const m of team) {
          const li = document.createElement('li');
          li.textContent = `${m.position}: ${m.name}${m.department ? ' ('+m.department+')' : ''}`;
          list.appendChild(li);
        }
      })
      .catch(()=>{});
  }

  render();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    fetch('/api/team', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => r.ok ? r.json() : r.json().then(x=>Promise.reject(x)))
      .then(() => { msg.textContent = 'Added to team.'; form.reset(); render(); })
      .catch(err => { msg.textContent = (err && err.error) || 'Error'; });
  });
}

// Onboarding management
function wireOnboard() {
  const form = document.getElementById('onboardForm');
  const msg = document.getElementById('onboardMsg');
  if (!form) return;
  protectDashboard();
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    fetch('/api/members/onboard', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => r.ok ? r.json() : r.json().then(x=>Promise.reject(x)))
      .then(res => { msg.textContent = 'Onboarded and emailed credentials.'; form.reset(); })
      .catch(err => { msg.textContent = (err && err.error) || 'Error'; });
  });
}

// Achievements management
function wireAchievements() {
  const form = document.getElementById('achForm');
  const list = document.getElementById('achList');
  const msg = document.getElementById('achMsg');
  if (!form && !list) return;

  function render() {
    fetch('/api/achievements').then(r=>r.json()).then(d=>Array.isArray(d.achievements)?d.achievements:[])
      .then(items => {
        if (!list) return;
        list.innerHTML='';
        for (const a of items.slice().reverse()) {
          const li=document.createElement('li');
          const img = a.imageUrl ? `<br><img src="${a.imageUrl}" alt="${a.title}" style="max-width:100%; border-radius:10px; margin-top:6px;"/>` : '';
          li.innerHTML = `<strong>${a.title}</strong>${a.description? ' — '+a.description:''}${a.link? ' — <a href=\"'+a.link+'\" target=\"_blank\">link</a>':''}${img}`;
          list.appendChild(li);
        }
      }).catch(()=>{});
  }

  render();

  if (form) {
    protectDashboard();
    form.addEventListener('submit', function(e){
      e.preventDefault();
      const fd = new FormData(form);
      fetch('/api/achievements', { method:'POST', credentials:'include', body: fd })
        .then(async r => {
          if (!r.ok) {
            let err; try { err = await r.json(); } catch { err = { error: r.status+' '+r.statusText }; }
            throw err;
          }
          return r.json();
        })
        .then(()=>{ msg.textContent='Achievement published.'; form.reset(); render(); })
        .catch(err=>{
          if (err && (String(err.error||'').includes('Unauthorized') || String(err.error||'').includes('Forbidden'))) {
            msg.textContent = 'Please log in as Office Bearer and try again.';
          } else {
            msg.textContent = (err && err.error) ? 'Error: '+err.error : 'Error publishing achievement.';
          }
        });
    });
  }
}


