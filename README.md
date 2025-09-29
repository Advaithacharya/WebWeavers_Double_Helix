IEEE Student Branch, SMVITM — Website

Frontend with glassmorphism and animated background + Node/Express backend (no DB).

Run Locally

1. Install Node.js LTS: https://nodejs.org
2. Open PowerShell in this folder
3. Install deps and start:

```
npm install
npm start
```

Visit `http://localhost:3000`.

Test Logins

Use email + role (password ignored in demo):
- Office Bearer: `chair@s.smvitm.ac.in`, `secretary@s.smvitm.ac.in`
- Member: `member@example.com`, `student@s.smvitm.ac.in`

Features

- Pages: Welcome, Home, About, Team, Achievements, Publication
- Auth: cookie JWT; whitelist in `data/users.json`
- Events: bearer uploads details + photos → `data/events.json`, `uploads/`
- Notifications: in-app via SSE; Email via SMTP (optional)

Optional Email Setup

Create `.env` next to `server.js`:
```
PORT=3000
BASE_URL=http://localhost:3000
JWT_SECRET=change-me
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_pass
MAIL_FROM="IEEE SB SMVITM <no-reply@smvitm.edu>"
```
If SMTP not set, emails log to console.


