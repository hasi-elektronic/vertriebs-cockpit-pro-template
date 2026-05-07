// Vertriebs-Cockpit Pro · Multi-User Auth
// Entwickelt von Hasi Elektronic

// === DEFAULT USERS (Fallback wenn KV leer) ===
const VOLKER_SIG = [
  'Mit freundlichen Grüßen',
  '',
  'Sales Person 1',
  'Vertrieb & Einkauf',
  '',
  '{{COMPANY_NAME}} GmbH & Co. KG',
  '{{ADDRESS}}',
  '{{ZIP}} {{CITY}}',
  'GERMANY',
  '',
  'Tel.:  {{TEL_MAIN}}',
  'Fax.: {{FAX}}',
  'Mobil: {{TEL_MOBILE}}',
  '',
  'E-Mail: sales1@{{DOMAIN}}',
  'Homepage: www.{{DOMAIN}}',
  '',
  'Geschäftsführer: {{CEO_NAMES}}',
  'Reg.-Gericht: {{REGISTER}} {{COURT}}',
  'Ust-Id.Nr. {{VAT_ID}}',
  '',
  '',
  'Sofern wir von Ihnen personenbezogene Daten verarbeiten, sind wir gemäß Art. 13 und 14 DSGVO',
  'verpflichtet Sie über Art und Umfang dieser Verarbeitung sowie über Ihre Rechte als betroffene',
  'Person zu informieren. Zu diesem Zweck haben wir im Datenschutzbereich unserer Website',
  'Informationsdokumente bereitgestellt. Diese finden Sie unter',
  'https://www.{{DOMAIN}}/datenschutz.html.',
].join('\n');

const HAMDI_SIG = [
  'Mit freundlichen Grüßen',
  '',
  'Admin User',
  'IT & Digitalisierung',
  '',
  '{{COMPANY_NAME}} GmbH & Co. KG',
  '{{ADDRESS}}',
  '{{ZIP}} {{CITY}}',
  'GERMANY',
].join('\n');

const DEFAULT_USERS = [
  { password: '11111', id: 'admin',  name: 'Admin User',   role: 'admin',    color: '#0a4d8c', email_signature: '' },
  { password: '22222', id: 'sales1', name: 'Sales 1',      role: 'vertrieb', color: '#16a34a', email_signature: '' },
  { password: '33333', id: 'sales2', name: 'Sales 2',      role: 'vertrieb', color: '#ea580c', email_signature: '' },
];

// Load users from KV (fallback to defaults). Returns array of {password,id,name,role,color}
async function loadUsers(env) {
  if (!env || !env.KV) return DEFAULT_USERS;
  try {
    const val = await env.KV.get('users');
    if (val) {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate: ensure every user has email_signature field; merge defaults for missing fields
        let dirty = false;
        for (const u of parsed) {
          if (typeof u.email_signature === 'undefined') {
            const def = DEFAULT_USERS.find(d => d.id === u.id);
            u.email_signature = def && def.email_signature ? def.email_signature : '';
            dirty = true;
          }
          // Auto-rename Vertrieb 1 -> Sales Person 1 once
          if (u.id === 'vertrieb1' && u.name === 'Vertrieb 1') {
            u.name = 'Sales Person 1';
            u.email_signature = VOLKER_SIG;
            dirty = true;
          }
        }
        if (dirty) {
          try { await env.KV.put('users', JSON.stringify(parsed)); } catch (e) {}
        }
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_USERS;
}

async function saveUsers(env, users) {
  if (!env || !env.KV) return false;
  await env.KV.put('users', JSON.stringify(users));
  return true;
}

// Sprint 10: Input length limits (KV-Storage protection)
const MAX_TEXT = 5000;
const MAX_NAME = 200;
function clamp(s, max) { return (typeof s === 'string') ? s.slice(0, max) : ''; }

// Sprint 10: Brute-Force Schutz fuer Login (5 Versuche / 15min / IP)
async function checkLoginRateLimit(env, ip) {
  if (!env || !env.KV || !ip) return { ok: true };
  const key = `ratelimit:login:${ip}`;
  const val = await env.KV.get(key);
  let entry = val ? JSON.parse(val) : { count: 0, first: Date.now() };
  const now = Date.now();
  // Reset Fenster nach 15 Minuten
  if (now - entry.first > 15 * 60 * 1000) entry = { count: 0, first: now };
  entry.count++;
  await env.KV.put(key, JSON.stringify(entry), { expirationTtl: 16 * 60 });
  if (entry.count > 5) return { ok: false, retry: Math.ceil((entry.first + 15*60*1000 - now) / 1000) };
  return { ok: true };
}

// Sprint 13: API Write Rate-Limit (30 writes/min/user)
async function checkWriteRateLimit(env, userId) {
  if (!env || !env.KV || !userId) return { ok: true };
  const key = `ratelimit:write:${userId}`;
  const val = await env.KV.get(key);
  let entry = val ? JSON.parse(val) : { count: 0, first: Date.now() };
  const now = Date.now();
  if (now - entry.first > 60 * 1000) entry = { count: 0, first: now };
  entry.count++;
  await env.KV.put(key, JSON.stringify(entry), { expirationTtl: 70 });
  if (entry.count > 30) return { ok: false, retry: Math.ceil((entry.first + 60000 - now) / 1000) };
  return { ok: true };
}

// Sprint 10: Origin-Check fuer CSRF-Schutz
function checkOrigin(request) {
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const host = new URL(request.url).host;
  // Erlaube Same-Origin POST/PATCH/DELETE
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  if (origin) return origin.endsWith('://' + host) || origin.includes(host);
  if (referer) return referer.includes('://' + host + '/') || referer.includes('//' + host + '/');
  return false; // Kein Origin/Referer = nicht von Browser
}

// Activity-Log pro Firma — unified timeline (max 100 events per firm)
async function appendActivity(env, leadId, event) {
  if (!env || !env.KV) return;
  try {
    const key = `activity:${leadId}`;
    const existing = await env.KV.get(key);
    let arr = existing ? JSON.parse(existing) : [];
    arr.push(event);
    if (arr.length > 100) arr = arr.slice(-100);
    await env.KV.put(key, JSON.stringify(arr));
  } catch (e) { /* noop */ }
}

function findUserByPassword(users, pw) {
  return users.find(u => u.password === pw);
}
function findUserById(users, id) {
  return users.find(u => u.id === id);
}

const COOKIE_NAME = 'cockpit_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage (Sprint 10: war 30)

// Cookie-Value Format: "user-id|token"
// Token wird zur Validierung verwendet (verhindert Manipulation)
// IMPORTANT: Change this secret to a random value before deployment
// Generate via: openssl rand -base64 48
const TOKEN_SECRET = '{{TOKEN_SECRET_PLEASE_CHANGE}}';

async function makeToken(userId) {
  const data = new TextEncoder().encode(userId + '|' + TOKEN_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 32);
}

async function makeCookieValue(userId) {
  const token = await makeToken(userId);
  return `${userId}|${token}`;
}

async function parseCookie(cookieHeader, env) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim().split('='));
  const auth = cookies.find(c => c[0] === COOKIE_NAME);
  if (!auth || !auth[1]) return null;
  const [userId, token] = auth[1].split('|');
  if (!userId || !token) return null;
  const expected = await makeToken(userId);
  if (token !== expected) return null;
  const users = await loadUsers(env);
  const user = findUserById(users, userId);
  if (!user) return null;
  // Don't expose password in user object
  return { id: user.id, name: user.name, role: user.role, color: user.color, email_signature: user.email_signature || '' };
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Vertriebs-Cockpit Pro · Login</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #0a4d8c 0%, #1e6db8 100%);
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .card {
    background: white; padding: 48px 40px; border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 420px; width: 100%;
  }
  .logo { text-align: center; margin-bottom: 32px; }
  .logo-text {
    font-size: 24px; font-weight: 700; color: #0a4d8c; letter-spacing: -0.5px;
  }
  .logo-sub {
    font-size: 13px; color: #6b7280; margin-top: 4px; font-weight: 500;
  }
  h1 { font-size: 22px; color: #1f2937; margin-bottom: 8px; text-align: center; }
  .desc { font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 28px; line-height: 1.5; }
  .field { margin-bottom: 16px; }
  label { display: block; font-size: 13px; color: #374151; font-weight: 600; margin-bottom: 6px; }
  input[type=password] {
    width: 100%; padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 10px;
    font-size: 18px; transition: all 0.2s; letter-spacing: 4px; text-align: center;
    font-family: monospace;
  }
  input[type=password]:focus { outline: none; border-color: #0a4d8c; }
  button {
    width: 100%; padding: 14px; background: #0a4d8c; color: white; border: none;
    border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: all 0.2s; margin-top: 8px;
  }
  button:hover { background: #1e6db8; }
  .error {
    background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px;
    font-size: 13px; margin-bottom: 16px; text-align: center; font-weight: 500;
  }
  .footer {
    margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb;
    font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.6;
  }
  .footer strong { color: #0a4d8c; }
  .hint {
    margin-top: 16px; font-size: 11px; color: #9ca3af; text-align: center;
    padding: 8px; background: #f9fafb; border-radius: 6px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-text">Vertriebs-Cockpit Pro</div>
    <div class="logo-sub">Lead-Analyse · Akquise-Plattform</div>
  </div>
  <h1>🔐 Geschützter Bereich</h1>
  <p class="desc">Bitte deinen persönlichen Zugangscode eingeben.</p>
  __ERROR__
  <form method="POST" action="/__login">
    <div class="field">
      <label for="pw">Zugangscode</label>
      <input type="password" id="pw" name="pw" required autofocus inputmode="numeric" pattern="[0-9]*" maxlength="20">
    </div>
    <button type="submit">Zugang freischalten</button>
  </form>
  <div class="hint">Vergessen? Wende dich an deinen Admin (IT)</div>
  <div class="footer">
    <strong>{{COMPANY_NAME}} GmbH &amp; Co. KG</strong><br>
    Entwickelt von <strong>Hasi Elektronic</strong> · www.hasi-elektronic.de
  </div>
</div>
</body>
</html>`;

function loginPage(error) {
  const errorBlock = error ? `<div class="error">❌ ${error}</div>` : '';
  return new Response(LOGIN_HTML.replace('__ERROR__', errorBlock), {
    status: error ? 401 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // === Login POST ===
  if (url.pathname === '/__login' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rl = await checkLoginRateLimit(env, ip);
    if (!rl.ok) {
      return new Response(LOGIN_HTML.replace('__ERROR__',
        `<div class="error">Zu viele Login-Versuche. Bitte ${Math.ceil(rl.retry/60)} Minuten warten.</div>`),
        { status: 429, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const formData = await request.formData();
    const pw = (formData.get('pw') || '').toString().trim();
    const allUsers = await loadUsers(env);
    const user = findUserByPassword(allUsers, pw);
    if (user) {
      const cookieValue = await makeCookieValue(user.id);
      // Audit log: write login event to KV
      if (env.KV) {
        const ts = new Date().toISOString();
        const eventKey = `audit:login:${ts}:${user.id}`;
        await env.KV.put(eventKey, JSON.stringify({
          user: user.id, name: user.name, action: 'login', ts,
          ip: request.headers.get('cf-connecting-ip') || '?',
          ua: request.headers.get('user-agent') || '?',
        }), { expirationTtl: 60 * 60 * 24 * 90 }); // 90 Tage Audit-Retention
      }
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE_NAME}=${cookieValue}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`,
        },
      });
    }
    return loginPage('Falscher Zugangscode. Bitte erneut versuchen.');
  }

  // === Logout ===
  if (url.pathname === '/__logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  // Sprint 15: PWA-public assets (no auth required)
  const PWA_PUBLIC = ['/manifest.json', '/sw.js', '/icon-192.png', '/icon-512.png', '/icon.svg', '/favicon.ico', '/robots.txt'];
  if (PWA_PUBLIC.includes(url.pathname)) {
    return next();
  }

  // === Auth check (everything else needs auth) ===
  const user = await parseCookie(request.headers.get('Cookie'), env);
  if (!user) return loginPage(null);

  // === API: GET /api/admin/users (admin only) ===
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    const users = await loadUsers(env);
    return jsonResponse({ users });
  }

  // === API: POST /api/admin/users (admin only) — replaces full user list ===
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    const body = await request.json().catch(() => ({}));
    const newUsers = body.users;
    if (!Array.isArray(newUsers) || newUsers.length === 0) {
      return jsonResponse({ error: 'users-Array erforderlich' }, 400);
    }
    // Validate each user
    const ids = new Set();
    const pws = new Set();
    for (const u of newUsers) {
      if (!u.id || !u.password || !u.name || !u.role) {
        return jsonResponse({ error: 'id, password, name, role sind Pflicht' }, 400);
      }
      if (ids.has(u.id)) return jsonResponse({ error: 'Doppelte ID: ' + u.id }, 400);
      if (pws.has(u.password)) return jsonResponse({ error: 'Doppeltes Passwort' }, 400);
      ids.add(u.id);
      pws.add(u.password);
      if (!u.color) u.color = '#64748b';
    }
    // Make sure at least 1 admin
    if (!newUsers.some(u => u.role === 'admin')) {
      return jsonResponse({ error: 'Mindestens ein Admin erforderlich' }, 400);
    }
    await saveUsers(env, newUsers);
    const ts = new Date().toISOString();
    await env.KV.put(`audit:users:${ts}`, JSON.stringify({
      action: 'users_updated', count: newUsers.length,
      user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    return jsonResponse({ ok: true, count: newUsers.length });
  }

  // === API: POST /api/change-password (jeder User kann sein eigenes ändern) ===
  if (url.pathname === '/api/change-password' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const oldPw = (body.old || '').toString().trim();
    const newPw = (body.new || '').toString().trim();
    if (!oldPw || !newPw) return jsonResponse({ error: 'old und new erforderlich' }, 400);
    if (newPw.length < 4) return jsonResponse({ error: 'Passwort min. 4 Zeichen' }, 400);

    const users = await loadUsers(env);
    const u = findUserById(users, user.id);
    if (!u) return jsonResponse({ error: 'User nicht gefunden' }, 404);
    if (u.password !== oldPw) return jsonResponse({ error: 'Altes Passwort falsch' }, 400);
    // Check uniqueness of new pw
    if (users.some(x => x.password === newPw && x.id !== user.id)) {
      return jsonResponse({ error: 'Passwort bereits vergeben' }, 400);
    }
    u.password = newPw;
    await saveUsers(env, users);
    const ts = new Date().toISOString();
    await env.KV.put(`audit:pwchange:${ts}:${user.id}`, JSON.stringify({
      action: 'password_changed', user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    return jsonResponse({ ok: true });
  }

  // === API: /api/me ===
  if (url.pathname === '/api/me') {
    return jsonResponse({
      id: user.id,
      name: user.name,
      role: user.role,
      color: user.color,
      email_signature: user.email_signature || '',
    });
  }

  // === API: GET /api/firminfo — alle Firmen-Overrides (zum Mergen im Frontend) ===
  if (url.pathname === '/api/firminfo' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ overrides: {} });
    const list = await env.KV.list({ prefix: 'firminfo:', limit: 1000 });
    const overrides = {};
    for (const k of list.keys) {
      const id = k.name.replace('firminfo:', '');
      const val = await env.KV.get(k.name);
      if (val) {
        try { overrides[id] = JSON.parse(val); } catch (e) {}
      }
    }
    return jsonResponse({ overrides });
  }

  // === API: POST /api/firminfo/:leadId — Firmen-Stammdaten editieren ===
  const firmInfoMatch = url.pathname.match(/^\/api\/firminfo\/(\d+)$/);
  if (firmInfoMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = firmInfoMatch[1];
    const body = await request.json().catch(() => ({}));
    // Allowed fields
    const ALLOWED = ['mail', 'mail2', 'tel', 'tel2', 'web', 'kontakt_person', 'kontakt_mail', 'kontakt_tel', 'notes_internal'];
    const override = {};
    for (const key of ALLOWED) {
      if (typeof body[key] === 'string') {
        const max = key === 'notes_internal' ? MAX_TEXT : MAX_NAME;
        override[key] = clamp(body[key].trim(), max);
      }
    }
    override._edited_by = user.id;
    override._edited_by_name = user.name;
    override._edited_ts = new Date().toISOString();
    await env.KV.put(`firminfo:${leadId}`, JSON.stringify(override));
    await env.KV.put(`audit:firminfo:${override._edited_ts}:${leadId}`, JSON.stringify({
      action: 'firminfo_updated', leadId,
      fields: Object.keys(override).filter(k => !k.startsWith('_')),
      user: user.id, name: user.name, ts: override._edited_ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    await appendActivity(env, leadId, {
      type: 'firminfo_edited', ts: override._edited_ts,
      by_user: user.id, by_name: user.name, by_color: user.color,
      fields: Object.keys(override).filter(k => !k.startsWith('_')),
    });
    return jsonResponse({ ok: true, override });
  }

  // Sprint 10: CSRF Origin-Check fuer alle nicht-GET API requests
  if (url.pathname.startsWith('/api/') && !checkOrigin(request)) {
    return jsonResponse({ error: 'Cross-Site Request blockiert (Origin/Referer fehlt)' }, 403);
  }

  // Sprint 13: Rate-Limit alle nicht-GET API requests (30/min/user)
  if (url.pathname.startsWith('/api/') && request.method !== 'GET' && request.method !== 'HEAD') {
    const wrl = await checkWriteRateLimit(env, user.id);
    if (!wrl.ok) {
      return jsonResponse({ error: `Zu viele Anfragen. Bitte ${wrl.retry}s warten.` }, 429);
    }
  }

  // === Sprint 13: Audit-Log Viewer (admin only, filterable) ===
  if (url.pathname === '/api/audit-log' && request.method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ events: [] });
    const params = url.searchParams;
    const limit = Math.min(parseInt(params.get('limit') || '100', 10), 500);
    const filterUser = params.get('user') || '';
    const filterType = params.get('type') || '';  // status|note|firminfo|login|konk|score|file
    const prefix = filterType ? `audit:${filterType}` : 'audit:';
    const list = await env.KV.list({ prefix, limit: 1000 });
    // Sort by ts (in key) descending
    const sorted = list.keys.slice().sort((a, b) => b.name.localeCompare(a.name)).slice(0, limit);
    const events = [];
    for (let i = 0; i < sorted.length; i += 30) {
      await Promise.all(sorted.slice(i, i + 30).map(async k => {
        const v = await env.KV.get(k.name);
        if (v) {
          try {
            const e = JSON.parse(v);
            e._key = k.name;
            const eUser = e.user || e.deleted_by || e.edited_by || e.uploaded_by || '';
            if (filterUser && !eUser.toLowerCase().includes(filterUser.toLowerCase())) return;
            events.push(e);
          } catch (err) {}
        }
      }));
    }
    events.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    return jsonResponse({ events: events.slice(0, limit), total: list.keys.length });
  }

  // === Sprint 13: Restore-from-Backup (admin only, gefaehrlich) ===
  if (url.pathname === '/api/restore' && request.method === 'POST') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const body = await request.json().catch(() => ({}));
    if (!body.data || typeof body.data !== 'object') {
      return jsonResponse({ error: 'data-Object erforderlich (aus Backup-JSON)' }, 400);
    }
    const dryRun = !!body.dry_run;
    const keysOnly = body.keys_only;  // optional: array of prefixes to restore (z.B. ["status:","notes:"])
    let restored = 0;
    let skipped = 0;
    const errors = [];
    for (const prefix in body.data) {
      if (keysOnly && Array.isArray(keysOnly) && !keysOnly.includes(prefix)) {
        skipped++;
        continue;
      }
      const bucket = body.data[prefix];
      if (prefix === 'users' && bucket && typeof bucket === 'object' && bucket.length) {
        if (!dryRun) await env.KV.put('users', JSON.stringify(bucket));
        restored++;
        continue;
      }
      if (typeof bucket !== 'object' || bucket === null) continue;
      const entries = Object.entries(bucket);
      for (let i = 0; i < entries.length; i += 25) {
        await Promise.all(entries.slice(i, i + 25).map(async ([key, val]) => {
          try {
            if (!dryRun) {
              await env.KV.put(key, typeof val === 'string' ? val : JSON.stringify(val));
            }
            restored++;
          } catch (e) { errors.push(`${key}: ${e.message}`); }
        }));
      }
    }
    const ts = new Date().toISOString();
    await env.KV.put(`audit:restore:${ts}`, JSON.stringify({
      action: 'kv_restore', restored, skipped, dry_run: dryRun,
      user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    return jsonResponse({ ok: true, restored, skipped, errors: errors.slice(0, 20), dry_run: dryRun });
  }

  // === Sprint 13: Health-Check (admin only) ===
  if (url.pathname === '/api/health' && request.method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ status: 'no-kv' });
    const counts = {};
    for (const prefix of ['status:','notes:','firminfo:','contacts:','tags:','score:','activity:','news:','file:','files:','konk:','audit:']) {
      const list = await env.KV.list({ prefix, limit: 1000 });
      counts[prefix.slice(0,-1)] = list.keys.length;
    }
    return jsonResponse({
      status: 'ok',
      ts: new Date().toISOString(),
      kv_keys: counts,
      uptime: 'cloudflare-pages',
    });
  }

  // === Sprint 12: Datei-Upload pro Firma (KV-backed, max 5MB) ===
  const filesListMatch = url.pathname.match(/^\/api\/files\/(\d+)$/);
  const fileItemMatch = url.pathname.match(/^\/api\/file\/(\d+)\/([\w-]+)$/);

  if (filesListMatch && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ files: [] });
    const leadId = filesListMatch[1];
    const idx = await env.KV.get(`files:${leadId}`);
    return jsonResponse({ files: idx ? JSON.parse(idx) : [] });
  }

  if (filesListMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = filesListMatch[1];
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return jsonResponse({ error: 'multipart erforderlich' }, 400);
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') return jsonResponse({ error: 'Datei fehlt' }, 400);
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) return jsonResponse({ error: 'Max 5 MB pro Datei' }, 400);
    if (file.size === 0) return jsonResponse({ error: 'Leere Datei' }, 400);
    // Read as ArrayBuffer, encode to base64 (chunked to avoid stack overflow)
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const fileId = Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const ts = new Date().toISOString();
    const meta = {
      id: fileId,
      name: clamp(file.name || 'unnamed', 200),
      type: clamp(file.type || 'application/octet-stream', 100),
      size: file.size,
      uploaded_by: user.id,
      uploaded_by_name: user.name,
      ts,
    };
    await env.KV.put(`file:${leadId}:${fileId}`, JSON.stringify({ ...meta, data: base64 }));
    const idx = await env.KV.get(`files:${leadId}`);
    let arr = idx ? JSON.parse(idx) : [];
    arr.push(meta);
    // Cap at 10 — delete oldest if exceeded
    while (arr.length > 10) {
      const oldest = arr.shift();
      try { await env.KV.delete(`file:${leadId}:${oldest.id}`); } catch (e) {}
    }
    await env.KV.put(`files:${leadId}`, JSON.stringify(arr));
    await appendActivity(env, leadId, {
      type: 'file_uploaded', ts, file_id: fileId,
      file_name: meta.name, file_size: file.size, file_type: meta.type,
      by_user: user.id, by_name: user.name, by_color: user.color,
    });
    return jsonResponse({ ok: true, file: meta });
  }

  if (fileItemMatch && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = fileItemMatch[1], fileId = fileItemMatch[2];
    const val = await env.KV.get(`file:${leadId}:${fileId}`);
    if (!val) return jsonResponse({ error: 'Datei nicht gefunden' }, 404);
    const f = JSON.parse(val);
    const binary = atob(f.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const safeName = encodeURIComponent(f.name).replace(/['()]/g, escape);
    return new Response(bytes, {
      headers: {
        'Content-Type': f.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(bytes.length),
      },
    });
  }

  if (fileItemMatch && request.method === 'DELETE') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = fileItemMatch[1], fileId = fileItemMatch[2];
    await env.KV.delete(`file:${leadId}:${fileId}`);
    const idx = await env.KV.get(`files:${leadId}`);
    let arr = idx ? JSON.parse(idx) : [];
    const removed = arr.find(f => f.id === fileId);
    arr = arr.filter(f => f.id !== fileId);
    await env.KV.put(`files:${leadId}`, JSON.stringify(arr));
    if (removed) {
      await appendActivity(env, leadId, {
        type: 'file_deleted', ts: new Date().toISOString(),
        file_name: removed.name,
        by_user: user.id, by_name: user.name, by_color: user.color,
      });
    }
    return jsonResponse({ ok: true });
  }

  // === Sprint 11: Tags pro Lead (KV-backed) ===
  if (url.pathname === '/api/tags' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ tags: {} });
    const list = await env.KV.list({ prefix: 'tags:', limit: 1000 });
    const tags = {};
    const keys = list.keys.slice(0, 500);
    for (let i = 0; i < keys.length; i += 30) {
      await Promise.all(keys.slice(i, i + 30).map(async k => {
        const id = k.name.slice(5);
        const val = await env.KV.get(k.name);
        if (val) { try { tags[id] = JSON.parse(val); } catch (e) {} }
      }));
    }
    return jsonResponse({ tags });
  }
  const tagsMatch = url.pathname.match(/^\/api\/tags\/(\d+)$/);
  if (tagsMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = tagsMatch[1];
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.tags)) return jsonResponse({ error: 'tags-Array erforderlich' }, 400);
    // Sanitize: trim, limit 30 chars, max 10 tags
    const cleaned = body.tags
      .map(t => clamp((t || '').toString().trim().toLowerCase().replace(/[^a-z0-9-_äöüß]/g, ''), 30))
      .filter(t => t.length > 0)
      .slice(0, 10);
    const unique = Array.from(new Set(cleaned));
    if (unique.length === 0) {
      await env.KV.delete(`tags:${leadId}`);
    } else {
      await env.KV.put(`tags:${leadId}`, JSON.stringify(unique));
    }
    const ts = new Date().toISOString();
    await appendActivity(env, leadId, {
      type: 'tags_updated', ts, tags: unique,
      by_user: user.id, by_name: user.name, by_color: user.color,
    });
    return jsonResponse({ ok: true, tags: unique });
  }

  // === API: GET /api/backup — Sprint 10: Komplettes KV-Export (admin only) ===
  if (url.pathname === '/api/backup' && request.method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const PREFIXES = ['users','status:','notes:','firminfo:','konk:','contacts:','activity:','score:','news:','audit:'];
    const dump = { backup_ts: new Date().toISOString(), backup_by: user.id, data: {} };
    for (const prefix of PREFIXES) {
      if (prefix === 'users') {
        const v = await env.KV.get('users');
        if (v) { try { dump.data.users = JSON.parse(v); } catch (e) {} }
        continue;
      }
      const list = await env.KV.list({ prefix, limit: 1000 });
      const bucket = {};
      const keys = list.keys.slice(0, 500);
      for (let i = 0; i < keys.length; i += 30) {
        await Promise.all(keys.slice(i, i + 30).map(async k => {
          const v = await env.KV.get(k.name);
          if (v) {
            try { bucket[k.name] = JSON.parse(v); } catch (e) { bucket[k.name] = v; }
          }
        }));
      }
      dump.data[prefix] = bucket;
    }
    const filename = `brand-backup-${new Date().toISOString().slice(0,10)}.json`;
    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // === API: GET /api/score-overrides — alle manuellen Score-Korrekturen ===
  if (url.pathname === '/api/score-overrides' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ overrides: {} });
    const list = await env.KV.list({ prefix: 'score:', limit: 1000 });
    const overrides = {};
    const keys = list.keys;
    for (let i = 0; i < keys.length; i += 30) {
      await Promise.all(keys.slice(i, i + 30).map(async k => {
        const id = k.name.slice(6);
        const val = await env.KV.get(k.name);
        if (val) { try { overrides[id] = JSON.parse(val); } catch (e) {} }
      }));
    }
    return jsonResponse({ overrides });
  }

  // === API: POST /api/score-override/:leadId — Score manuell setzen ===
  const scoreMatch = url.pathname.match(/^\/api\/score-override\/(\d+)$/);
  if (scoreMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = scoreMatch[1];
    const body = await request.json().catch(() => ({}));
    const PRODUKTE = ['ventilatoren','schallhauben','laufrad_wuchten','schweissbaugruppen','metalldrueckteile','industrielackierung','lohnfertigung_blech','nuten_fraesen_drehen','werkzeugschraenke'];
    const existing = await env.KV.get(`score:${leadId}`);
    let override = existing ? JSON.parse(existing) : { scores: {} };
    if (!override.scores) override.scores = {};
    const changed = [];
    for (const p of PRODUKTE) {
      if (body.scores && Object.prototype.hasOwnProperty.call(body.scores, p)) {
        const v = body.scores[p];
        if (v === null || v === '' || v === undefined) {
          // Reset/remove override for this produkt
          delete override.scores[p];
          changed.push(p + ':reset');
        } else {
          const n = Math.max(0, Math.min(100, Number(v)));
          if (!isNaN(n)) {
            override.scores[p] = Math.round(n * 10) / 10;
            changed.push(p + ':' + override.scores[p]);
          }
        }
      }
    }
    override._edited_by = user.id;
    override._edited_by_name = user.name;
    override._edited_ts = new Date().toISOString();
    if (Object.keys(override.scores).length === 0) {
      // No overrides left -> delete key entirely
      await env.KV.delete(`score:${leadId}`);
    } else {
      await env.KV.put(`score:${leadId}`, JSON.stringify(override));
    }
    await env.KV.put(`audit:score:${override._edited_ts}:${leadId}`, JSON.stringify({
      action: 'score_override', leadId, changed,
      user: user.id, name: user.name, ts: override._edited_ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    await appendActivity(env, leadId, {
      type: 'score_override', ts: override._edited_ts,
      by_user: user.id, by_name: user.name, by_color: user.color,
      changed,
    });
    return jsonResponse({ ok: true, override });
  }

  // === API: GET /api/news — alle gesammelten News ===
  if (url.pathname === '/api/news' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ news: {} });
    const list = await env.KV.list({ prefix: 'news:', limit: 200 });
    const news = {};
    const keys = list.keys.slice(0, 100);
    for (let i = 0; i < keys.length; i += 30) {
      await Promise.all(keys.slice(i, i + 30).map(async k => {
        const id = k.name.slice(5);
        const val = await env.KV.get(k.name);
        if (val) { try { news[id] = JSON.parse(val); } catch (e) {} }
      }));
    }
    return jsonResponse({ news });
  }

  // === API: POST /api/news/refresh — Top-50 A-Tier News abholen (admin only) ===
  if (url.pathname === '/api/news/refresh' && request.method === 'POST') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const body = await request.json().catch(() => ({}));
    const firms = Array.isArray(body.firms) ? body.firms : [];
    if (firms.length === 0) return jsonResponse({ error: 'firms-Array erforderlich' }, 400);
    const results = {};
    const errors = [];
    // Limit to 25 firms per call (subrequest budget)
    for (const f of firms.slice(0, 25)) {
      try {
        // Bereinige Firmennamen: entferne Rechtsform-Suffixe fuer breitere Treffer
        const cleanName = (f.firma || '').replace(/\s*(GmbH|AG|KG|Co\.|& Co|mbH|Ltd|SE|OHG|UG|Verwaltungs|Holding|Group|Werke|Fabrik|GbR|SE|Inc).*$/i, '').trim();
        const searchTerm = cleanName.length >= 3 ? cleanName : (f.firma || '');
        // Quoted search fuer exakten Firmennamen + 1-Jahr Filter
        const q = encodeURIComponent(`"${searchTerm}"`);
        const rssUrl = `https://news.google.com/rss/search?q=${q}+when:1y&hl=de&gl=DE&ceid=DE:de`;
        const r = await fetch(rssUrl, { cf: { cacheTtl: 300 }, headers: { 'User-Agent': 'Mozilla/5.0 {{COMPANY_NAME}}Cockpit/1.0' } });
        if (!r.ok) { errors.push(f.id + ':' + r.status); continue; }
        const xml = await r.text();
        // Parse RSS items via regex (simple, no DOM)
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRegex.exec(xml)) !== null && items.length < 5) {
          const block = m[1];
          const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
          const link  = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
          const date  = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
          const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
          if (title && link) items.push({ title: title.trim(), link: link.trim(), date: date.trim(), source: source.trim() });
        }
        const entry = { firma: f.firma, items, fetched_at: new Date().toISOString(), fetched_by: user.id };
        await env.KV.put(`news:${f.id}`, JSON.stringify(entry));
        results[f.id] = items.length;
      } catch (e) {
        errors.push(f.id + ':' + (e.message || 'err'));
      }
    }
    return jsonResponse({ ok: true, results, errors });
  }

  // === API: GET /api/leads-geo — minimal Lead-Daten fuer Karten-View ===
  if (url.pathname === '/api/leads-geo' && request.method === 'GET') {
    // We fetch the index.html ourselves (server-side), parse out DATA, return minimal projection
    try {
      const indexUrl = new URL('/', request.url);
      const indexResp = await env.ASSETS ? env.ASSETS.fetch(new Request(indexUrl.toString())) : fetch(indexUrl.toString());
      const html = await (await indexResp).text();
      const m = html.match(/const\s+DATA\s*=\s*(\{[\s\S]+?"leads":\s*\[[\s\S]+?\][\s\S]*?\})\s*;\s*\n/);
      if (!m) return jsonResponse({ leads: [], error: 'parse fail' });
      const data = JSON.parse(m[1]);
      const leads = (data.leads || []).filter(l => typeof l.lat === 'number' && typeof l.lng === 'number')
        .map(l => ({
          id: l.id, firma: l.firma, plz: l.plz, plz_ort: l.plz_ort,
          tier: l.tier, best_score: l.best_score,
          lat: l.lat, lng: l.lng,
          branchen: (l.branchen || []).slice(0, 2),
          web: l.web, mail: l.mail, tel: l.tel,
        }));
      return jsonResponse({ leads });
    } catch (e) {
      return jsonResponse({ leads: [], error: String(e) });
    }
  }

  // === API: GET /api/activity/:leadId — chronologische Timeline pro Firma ===
  const activityMatch = url.pathname.match(/^\/api\/activity\/(\d+)$/);
  if (activityMatch && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ events: [] });
    const leadId = activityMatch[1];
    const val = await env.KV.get(`activity:${leadId}`);
    const events = val ? JSON.parse(val) : [];
    return jsonResponse({ events });
  }

  // === API: GET/POST/PATCH/DELETE /api/contacts/:leadId[/contactId] ===
  const contactsListMatch = url.pathname.match(/^\/api\/contacts\/(\d+)$/);
  const contactItemMatch = url.pathname.match(/^\/api\/contacts\/(\d+)\/([\w-]+)$/);

  if (contactsListMatch && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ contacts: [] });
    const leadId = contactsListMatch[1];
    const val = await env.KV.get(`contacts:${leadId}`);
    return jsonResponse({ contacts: val ? JSON.parse(val) : [] });
  }
  if (contactsListMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = contactsListMatch[1];
    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').toString().trim();
    if (!name) return jsonResponse({ error: 'Name erforderlich' }, 400);
    const ts = new Date().toISOString();
    const contact = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: clamp(name, MAX_NAME),
      position: clamp((body.position || '').toString().trim(), MAX_NAME),
      mail: clamp((body.mail || '').toString().trim(), MAX_NAME),
      tel: clamp((body.tel || '').toString().trim(), MAX_NAME),
      mobil: clamp((body.mobil || '').toString().trim(), MAX_NAME),
      linkedin: clamp((body.linkedin || '').toString().trim(), MAX_NAME * 2),
      note: clamp((body.note || '').toString().trim(), MAX_TEXT),
      primary: !!body.primary,
      created_by: user.id, created_by_name: user.name, created_ts: ts,
    };
    const existing = await env.KV.get(`contacts:${leadId}`);
    const list = existing ? JSON.parse(existing) : [];
    if (contact.primary) list.forEach(c => c.primary = false);
    list.push(contact);
    await env.KV.put(`contacts:${leadId}`, JSON.stringify(list));
    await appendActivity(env, leadId, {
      type: 'contact_added', ts,
      by_user: user.id, by_name: user.name, by_color: user.color,
      contact_name: name, contact_position: contact.position,
    });
    return jsonResponse({ ok: true, contact });
  }
  if (contactItemMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = contactItemMatch[1];
    const contactId = contactItemMatch[2];
    const body = await request.json().catch(() => ({}));
    const existing = await env.KV.get(`contacts:${leadId}`);
    if (!existing) return jsonResponse({ error: 'Kontakt nicht gefunden' }, 404);
    const list = JSON.parse(existing);
    const c = list.find(x => x.id === contactId);
    if (!c) return jsonResponse({ error: 'Kontakt nicht gefunden' }, 404);
    const ALLOWED = ['name','position','mail','tel','mobil','linkedin','note','primary'];
    for (const k of ALLOWED) {
      if (typeof body[k] !== 'undefined') {
        if (k === 'primary') c[k] = !!body[k];
        else c[k] = clamp(body[k].toString().trim(), k === 'note' ? MAX_TEXT : MAX_NAME);
      }
    }
    if (c.primary) list.forEach(x => { if (x.id !== contactId) x.primary = false; });
    c.edited_by = user.id; c.edited_by_name = user.name; c.edited_ts = new Date().toISOString();
    await env.KV.put(`contacts:${leadId}`, JSON.stringify(list));
    await appendActivity(env, leadId, {
      type: 'contact_edited', ts: c.edited_ts,
      by_user: user.id, by_name: user.name, by_color: user.color,
      contact_name: c.name,
    });
    return jsonResponse({ ok: true, contact: c });
  }
  if (contactItemMatch && request.method === 'DELETE') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = contactItemMatch[1];
    const contactId = contactItemMatch[2];
    const existing = await env.KV.get(`contacts:${leadId}`);
    if (!existing) return jsonResponse({ ok: true, deleted: 0 });
    const list = JSON.parse(existing);
    const c = list.find(x => x.id === contactId);
    const filtered = list.filter(x => x.id !== contactId);
    await env.KV.put(`contacts:${leadId}`, JSON.stringify(filtered));
    if (c) {
      await appendActivity(env, leadId, {
        type: 'contact_deleted', ts: new Date().toISOString(),
        by_user: user.id, by_name: user.name, by_color: user.color,
        contact_name: c.name,
      });
    }
    return jsonResponse({ ok: true, deleted: list.length - filtered.length });
  }

  // === API: GET /api/dashboard — Pipeline-Funnel + User-Stats ===
  if (url.pathname === '/api/dashboard' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ funnel: {}, by_user: {}, totals: {} });
    const isAdmin = user.role === 'admin';
    // Pipeline funnel: count current statuses
    const statusList = await env.KV.list({ prefix: 'status:', limit: 1000 });
    const funnel = { Neu: 0, Kontaktiert: 0, 'Erstgespräch': 0, Angebot: 0, Abschluss: 0, Kunde: 0, Verloren: 0 };
    // Batch in groups of 30 to stay under subrequest limits
    const statusKeys = statusList.keys.slice(0, 200);
    for (let i = 0; i < statusKeys.length; i += 30) {
      await Promise.all(statusKeys.slice(i, i + 30).map(async k => {
        const val = await env.KV.get(k.name);
        if (val) {
          try { const s = JSON.parse(val); if (s.status && funnel.hasOwnProperty(s.status)) funnel[s.status]++; }
          catch (e) {}
        }
      }));
    }
    // User-Stats: aktivitaet pro user (7d / 30d)
    const now = Date.now();
    const cutoff7 = now - 7 * 86400 * 1000;
    const cutoff30 = now - 30 * 86400 * 1000;
    const auditList = await env.KV.list({ prefix: 'audit:', limit: 1000 });
    const by_user = {};
    // Map alte User-IDs auf neue (nach Umbenennung)
    const ID_ALIAS = { vertrieb1: 'rapp', vertrieb2: 'leskovar' };
    // Liste der aktuell gueltigen User-IDs (alles andere wird gefiltert)
    const allUsers = await loadUsers(env);
    const validIds = new Set(allUsers.map(u => u.id));
    const userNameById = {};
    const userColorById = {};
    allUsers.forEach(u => { userNameById[u.id] = u.name; userColorById[u.id] = u.color; });
    // Sort newest first by key name (ts is in key) and only fetch values for last 30 days
    const sortedKeys = auditList.keys.slice().sort((a, b) => b.name.localeCompare(a.name)).slice(0, 300);
    for (let i = 0; i < sortedKeys.length; i += 30) {
      await Promise.all(sortedKeys.slice(i, i + 30).map(async k => {
        const val = await env.KV.get(k.name);
        if (!val) return;
        try {
          const e = JSON.parse(val);
          let uid = e.user || e.deleted_by || e.edited_by || '?';
          // Alias-Mapping fuer alte IDs
          if (ID_ALIAS[uid]) uid = ID_ALIAS[uid];
          // Filter: nur aktuell gueltige User
          if (!validIds.has(uid)) return;
          const uname = userNameById[uid] || e.name || uid;
          const ucolor = userColorById[uid] || '#64748b';
          const t = e.ts ? new Date(e.ts).getTime() : 0;
          if (!by_user[uid]) by_user[uid] = { id: uid, name: uname, color: ucolor, d7: { status:0, note:0, firminfo:0, login:0 }, d30: { status:0, note:0, firminfo:0, login:0 } };
          let cat = null;
          if (k.name.startsWith('audit:status')) cat = 'status';
          else if (k.name.startsWith('audit:note')) cat = 'note';
          else if (k.name.startsWith('audit:firminfo')) cat = 'firminfo';
          else if (k.name.startsWith('audit:login')) cat = 'login';
          if (!cat) return;
          if (t >= cutoff7) by_user[uid].d7[cat] = (by_user[uid].d7[cat] || 0) + 1;
          if (t >= cutoff30) by_user[uid].d30[cat] = (by_user[uid].d30[cat] || 0) + 1;
        } catch (e) {}
      }));
    }
    // Filter for non-admins: only show own row
    if (!isAdmin) {
      const filtered = {};
      if (by_user[user.id]) filtered[user.id] = by_user[user.id];
      return jsonResponse({ funnel, by_user: filtered, totals: { leads: 1190, statuses: statusList.keys.length } });
    }
    return jsonResponse({ funnel, by_user, totals: { leads: 1190, statuses: statusList.keys.length } });
  }

  // === API: /api/audit (only for admin) ===
  if (url.pathname === '/api/audit' && request.method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);
    if (!env.KV) return jsonResponse({ events: [] });
    const list = await env.KV.list({ prefix: 'audit:', limit: 100 });
    const events = [];
    for (const k of list.keys.reverse()) {
      const val = await env.KV.get(k.name);
      if (val) events.push(JSON.parse(val));
    }
    return jsonResponse({ events });
  }

  // === API: GET /api/status (all statuses) ===
  if (url.pathname === '/api/status' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ statuses: {} });
    const list = await env.KV.list({ prefix: 'status:', limit: 1000 });
    const statuses = {};
    await Promise.all(list.keys.map(async k => {
      const val = await env.KV.get(k.name);
      if (val) {
        const id = k.name.slice(7);
        statuses[id] = JSON.parse(val);
      }
    }));
    return jsonResponse({ statuses });
  }

  // === API: POST /api/status/:leadId — Pipeline-Status setzen ===
  const statusMatch = url.pathname.match(/^\/api\/status\/(\d+)$/);
  if (statusMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = statusMatch[1];
    const body = await request.json().catch(() => ({}));
    const status = (body.status || '').toString().trim();
    const VALID = ['Neu','Kontaktiert','Erstgespräch','Angebot','Abschluss','Kunde','Verloren'];
    if (!VALID.includes(status)) return jsonResponse({ error: 'Ungueltiger Status' }, 400);
    const ts = new Date().toISOString();
    const entry = { status, by_user: user.id, by_name: user.name, by_color: user.color, ts };
    await env.KV.put(`status:${leadId}`, JSON.stringify(entry));
    await env.KV.put(`audit:status:${ts}:${leadId}`, JSON.stringify({
      action: 'status_changed', leadId, status,
      user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    await appendActivity(env, leadId, {
      type: 'status_changed', ts, status,
      by_user: user.id, by_name: user.name, by_color: user.color,
    });
    return jsonResponse({ ok: true, leadId, status, ts });
  }

  // === API: GET/POST /api/notes/:leadId ===
  const notesMatch = url.pathname.match(/^\/api\/notes\/(\d+)$/);
  if (notesMatch && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ notes: [] });
    const leadId = notesMatch[1];
    const val = await env.KV.get(`notes:${leadId}`);
    return jsonResponse({ notes: val ? JSON.parse(val) : [] });
  }
  if (notesMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = notesMatch[1];
    const body = await request.json().catch(() => ({}));
    const text = clamp((body.text || '').toString().trim(), MAX_TEXT);
    const reminder_date = body.reminder_date || null;
    if (!text && !reminder_date) return jsonResponse({ error: 'Text oder Wiedervorlage erforderlich' }, 400);
    const ts = new Date().toISOString();
    const note = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      text, reminder_date,
      by_user: user.id, by_name: user.name, by_color: user.color, ts,
    };
    const existing = await env.KV.get(`notes:${leadId}`);
    const notes = existing ? JSON.parse(existing) : [];
    notes.push(note);
    await env.KV.put(`notes:${leadId}`, JSON.stringify(notes));
    await env.KV.put(`audit:note:${ts}:${leadId}`, JSON.stringify({
      action: 'note_added', leadId, noteId: note.id,
      text: text.slice(0, 100), reminder_date,
      user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    await appendActivity(env, leadId, {
      type: 'note_added', ts, note_id: note.id,
      by_user: user.id, by_name: user.name, by_color: user.color,
      text_preview: text.slice(0, 120),
      reminder_date: reminder_date || null,
    });
    return jsonResponse({ ok: true, note });
  }

  const noteItemMatch = url.pathname.match(/^\/api\/notes\/(\d+)\/([\w-]+)$/);
  if (noteItemMatch && request.method === 'DELETE') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = noteItemMatch[1];
    const noteId = noteItemMatch[2];
    const existing = await env.KV.get(`notes:${leadId}`);
    if (!existing) return jsonResponse({ ok: true, deleted: 0 });
    const notes = JSON.parse(existing);
    const note = notes.find(n => n.id === noteId);
    const filtered = notes.filter(n => n.id !== noteId);
    await env.KV.put(`notes:${leadId}`, JSON.stringify(filtered));
    if (note) {
      await appendActivity(env, leadId, {
        type: 'note_deleted', ts: new Date().toISOString(), note_id: noteId,
        by_user: user.id, by_name: user.name, by_color: user.color,
        original_author: note.by_name, original_text: (note.text||'').slice(0, 120),
      });
    }
    return jsonResponse({ ok: true, deleted: notes.length - filtered.length });
  }
  if (noteItemMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const leadId = noteItemMatch[1];
    const noteId = noteItemMatch[2];
    const body = await request.json().catch(() => ({}));
    const newText = clamp((body.text || '').toString().trim(), MAX_TEXT);
    const newReminder = body.reminder_date || null;
    if (!newText && !newReminder) return jsonResponse({ error: 'Text oder Wiedervorlage erforderlich' }, 400);
    const existing = await env.KV.get(`notes:${leadId}`);
    if (!existing) return jsonResponse({ error: 'Notiz nicht gefunden' }, 404);
    const notes = JSON.parse(existing);
    const note = notes.find(n => n.id === noteId);
    if (!note) return jsonResponse({ error: 'Notiz nicht gefunden' }, 404);
    note.text = newText;
    note.reminder_date = newReminder;
    note.edited = true;
    note.edited_by = user.id;
    note.edited_by_name = user.name;
    note.edited_ts = new Date().toISOString();
    await env.KV.put(`notes:${leadId}`, JSON.stringify(notes));
    await appendActivity(env, leadId, {
      type: 'note_edited', ts: note.edited_ts, note_id: noteId,
      by_user: user.id, by_name: user.name, by_color: user.color,
    });
    return jsonResponse({ ok: true, note });
  }

  if (url.pathname === '/api/notes-summary' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ counts: {}, reminders: {} });
    const list = await env.KV.list({ prefix: 'notes:', limit: 1000 });
    const counts = {};
    const reminders = {};
    await Promise.all(list.keys.map(async k => {
      const id = k.name.slice(6);
      const val = await env.KV.get(k.name);
      if (val) {
        const arr = JSON.parse(val);
        counts[id] = arr.length;
        const today = new Date().toISOString().slice(0,10);
        const upcoming = arr.filter(n => n.reminder_date && n.reminder_date >= today).map(n => n.reminder_date).sort();
        if (upcoming.length) reminders[id] = upcoming[0];
      }
    }));
    return jsonResponse({ counts, reminders });
  }

  if (url.pathname === '/api/konk-class' && request.method === 'GET') {
    if (!env.KV) return jsonResponse({ overrides: {} });
    const list = await env.KV.list({ prefix: 'konk:', limit: 1000 });
    const overrides = {};
    await Promise.all(list.keys.map(async k => {
      const slug = k.name.slice(5);
      const val = await env.KV.get(k.name);
      if (val) { try { overrides[slug] = JSON.parse(val); } catch (e) {} }
    }));
    return jsonResponse({ overrides });
  }
  const konkMatch = url.pathname.match(/^\/api\/konk-class\/([^\/]+)$/);
  if (konkMatch && request.method === 'POST') {
    if (!env.KV) return jsonResponse({ error: 'KV not bound' }, 500);
    const slug = decodeURIComponent(konkMatch[1]);
    const body = await request.json().catch(() => ({}));
    const cls = (body.classification || '').toString();
    const VALID = ['direct', 'possible-lead', 'neutral', 'kunde'];
    if (!VALID.includes(cls)) return jsonResponse({ error: 'Ungueltige Klassifikation' }, 400);
    const ts = new Date().toISOString();
    const entry = { classification: cls, by_user: user.id, by_name: user.name, ts };
    await env.KV.put(`konk:${slug}`, JSON.stringify(entry));
    await env.KV.put(`audit:konk:${ts}:${slug.slice(0,40)}`, JSON.stringify({
      action: 'konk_class', slug, classification: cls,
      user: user.id, name: user.name, ts,
    }), { expirationTtl: 60 * 60 * 24 * 365 });
    return jsonResponse({ ok: true, ts });
  }

  return next();
}
