'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Storage directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const TEAM_FILE = path.join(DATA_DIR, 'team.json');
const ACH_FILE = path.join(DATA_DIR, 'achievements.json');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({
  // simple whitelist without passwords (demo). Use real auth in production.
  members: [
    { email: 'member@example.com', role: 'member' },
    { email: 'student@s.smvitm.ac.in', role: 'member' }
  ],
  bearers: [
    { email: 'chair@s.smvitm.ac.in', role: 'bearer' },
    { email: 'secretary@s.smvitm.ac.in', role: 'bearer' }
  ]
}, null, 2));
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(TEAM_FILE)) fs.writeFileSync(TEAM_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ACH_FILE)) fs.writeFileSync(ACH_FILE, JSON.stringify([], null, 2));

// CORS for local dev
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Static files
app.use('/', express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage });

// SSE clients
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\n` +
                  `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { res.write(payload); }
}

// Email transport (logs if no SMTP env)
const mailTransport = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
}) : {
  sendMail: async (opts) => {
    console.log('[MAIL] To:', opts.to, 'Subject:', opts.subject);
    return { messageId: 'dev-log' };
  }
};

function loadUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
function loadEvents() { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8')); }
function saveEvents(events) { fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2)); }
function loadTeam() { return JSON.parse(fs.readFileSync(TEAM_FILE, 'utf-8')); }
function saveTeam(team) { fs.writeFileSync(TEAM_FILE, JSON.stringify(team, null, 2)); }
function loadAchievements() { return JSON.parse(fs.readFileSync(ACH_FILE, 'utf-8')); }
function saveAchievements(list) { fs.writeFileSync(ACH_FILE, JSON.stringify(list, null, 2)); }

function signToken(user) { return jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' }); }
function authMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
function requireBearer(req, res, next) {
  if (req.user && req.user.role === 'bearer') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// Routes
app.post('/api/auth/login', (req, res) => {
  const { email, role, password } = req.body || {};
  if (!email || !role) return res.status(400).json({ error: 'email and role required' });
  const users = loadUsers();
  const allowed = [...users.members, ...users.bearers].find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!allowed) return res.status(401).json({ error: 'Not registered' });
  if (role === 'bearer' && !users.bearers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(403).json({ error: 'Not a bearer' });
  }
  // If a password is set on the user, require it; otherwise, allow for legacy users
  if (Object.prototype.hasOwnProperty.call(allowed, 'password')) {
    const hashed = crypto.createHash('sha256').update(String(password || '')).digest('hex');
    if (allowed.password !== hashed) return res.status(401).json({ error: 'Invalid credentials' });
  }
  const user = { email, role: role === 'bearer' ? 'bearer' : 'member' };
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/events', (req, res) => {
  res.json({ events: loadEvents() });
});

app.post('/api/events', authMiddleware, requireBearer, upload.array('photos', 10), (req, res) => {
  const { title, date, venue } = req.body || {};
  if (!title || !date || !venue) return res.status(400).json({ error: 'Missing fields' });
  const files = (req.files || []).map(f => ({ name: f.originalname, url: `${BASE_URL}/uploads/${path.basename(f.path)}` }));
  const events = loadEvents();
  const ev = { id: Date.now(), title, date, venue, photos: files, createdBy: req.user.email };
  events.push(ev);
  saveEvents(events);

  broadcast('event:new', ev);

  try {
    const users = loadUsers();
    const recipients = [...users.members, ...users.bearers].map(u => u.email).join(',');
    if (recipients) {
      mailTransport.sendMail({
        from: process.env.MAIL_FROM || 'ieee-sb@localhost',
        to: recipients,
        subject: `[IEEE SB SMVITM] New Event: ${title}`,
        text: `Title: ${title}\nDate: ${date}\nVenue: ${venue}\nPhotos: ${(files || []).map(p=>p.url).join(', ')}`
      }).catch(err => console.warn('Mail error:', err.message));
    }
  } catch (e) { /* ignore */ }

  res.json({ ok: true, event: ev });
});

// SSE endpoint for in-app notifications
app.get('/api/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write(`event: ready\n` + `data: {"ok":true}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Team APIs
app.get('/api/team', (req, res) => {
  res.json({ team: loadTeam() });
});

app.post('/api/team', authMiddleware, requireBearer, (req, res) => {
  const { name, position, department, email } = req.body || {};
  if (!name || !position) return res.status(400).json({ error: 'Missing fields' });
  const team = loadTeam();
  const member = { id: Date.now(), name, position, department: department || '', email: email || '' };
  team.push(member);
  saveTeam(team);
  broadcast('team:update', member);
  res.json({ ok: true, member });
});

app.put('/api/team/:id', authMiddleware, requireBearer, (req, res) => {
  const id = Number(req.params.id);
  const team = loadTeam();
  const idx = team.findIndex(t => Number(t.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, position, department, email } = req.body || {};
  team[idx] = { ...team[idx], ...(name ? { name } : {}), ...(position ? { position } : {}), ...(department ? { department } : {}), ...(email ? { email } : {}) };
  saveTeam(team);
  broadcast('team:update', team[idx]);
  res.json({ ok: true, member: team[idx] });
});

app.delete('/api/team/:id', authMiddleware, requireBearer, (req, res) => {
  const id = Number(req.params.id);
  const team = loadTeam();
  const idx = team.findIndex(t => Number(t.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const removed = team.splice(idx, 1)[0];
  saveTeam(team);
  broadcast('team:update', { removedId: id });
  res.json({ ok: true, removed });
});

// Member onboarding: create account with temp password and email it
app.post('/api/members/onboard', authMiddleware, requireBearer, async (req, res) => {
  const { email, name, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const users = loadUsers();
  const all = [...users.members, ...users.bearers];
  const exists = all.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'User already exists' });
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const hashed = crypto.createHash('sha256').update(tempPassword).digest('hex');
  const newUser = { email, role: role === 'bearer' ? 'bearer' : 'member', password: hashed, name: name || '' };
  if (newUser.role === 'bearer') users.bearers.push(newUser); else users.members.push(newUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  try {
    await mailTransport.sendMail({
      from: process.env.MAIL_FROM || 'ieee-sb@localhost',
      to: email,
      subject: '[IEEE SB SMVITM] Your account credentials',
      text: `Hello${name ? ' ' + name : ''},\n\nYour access to IEEE SB SMVITM website has been created.\n\nEmail: ${email}\nTemporary Password: ${tempPassword}\nRole: ${newUser.role}\n\nLogin at ${BASE_URL}/login.html and change your password soon.\n`,
    });
  } catch (e) { /* log-only transport may throw */ }
  res.json({ ok: true, user: { email, role: newUser.role }, tempPassword });
});

// Achievements APIs
app.get('/api/achievements', (req, res) => {
  res.json({ achievements: loadAchievements() });
});

app.post('/api/achievements', authMiddleware, requireBearer, upload.single('image'), (req, res) => {
  const { title, description, link } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const list = loadAchievements();
  let imageUrl = '';
  if (req.file) {
    imageUrl = `${BASE_URL}/uploads/${path.basename(req.file.path)}`;
  }
  const item = { id: Date.now(), title, description: description || '', link: link || '', imageUrl, createdBy: req.user.email, createdAt: new Date().toISOString() };
  list.push(item);
  saveAchievements(list);
  broadcast('ach:new', item);
  res.json({ ok: true, achievement: item });
});

app.listen(PORT, () => {
  console.log(`Server running at ${BASE_URL}`);
});


