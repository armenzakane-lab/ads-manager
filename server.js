require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { GoogleAdsApi } = require('google-ads-api');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, 'ads-manager-data.json');

// ─── SIMPLE JSON DB ───────────────────────────────────────────────────────────
function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { settings: {}, tokens: null, clients: [] };
  }
}
function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}
function getSetting(key) { return readDb().settings[key] || null; }
function setSetting(key, value) {
  const db = readDb(); db.settings[key] = value; writeDb(db);
}
function getStoredTokens() { return readDb().tokens; }
function setStoredTokens(t) { const db = readDb(); db.tokens = t; writeDb(db); }
function getClients() { return readDb().clients || []; }
function saveClients(clients) { const db = readDb(); db.clients = clients; writeDb(db); }

// Ensure DB file exists
if (!fs.existsSync(DB_PATH)) writeDb({ settings: {}, tokens: null, clients: [] });

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ads-manager-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
// ─── PASSWORD PROTECTION ─────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ads-manager-2026';

app.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Ads Manager — Login</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#04060d;color:#c8d8f0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:rgba(13,20,36,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 24px 64px rgba(0,0,0,0.5)}
    .logo{font-size:22px;font-weight:800;background:linear-gradient(135deg,#3b82f6,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
    .sub{font-size:14px;color:#5a7a9a;margin-bottom:36px}
    label{font-size:12px;font-weight:600;color:#5a7a9a;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:8px}
    input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px 16px;font-size:16px;color:#fff;font-family:'Inter',sans-serif;outline:none;transition:.15s}
    input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.15)}
    button{width:100%;margin-top:24px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:12px;padding:16px;font-size:15px;font-weight:700;cursor:pointer;transition:.15s;font-family:'Inter',sans-serif}
    button:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(59,130,246,0.35)}
    .error{color:#f43f5e;font-size:13px;margin-top:16px;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Ads Manager</div>
    <div class="sub">Sign in to your dashboard</div>
    <form method="POST" action="/login">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter password" autofocus>
      ${req.query.error ? '<div class="error">Incorrect password. Try again.</div>' : ''}
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

app.use((req, res, next) => {
  if (req.path === '/login' || req.path.startsWith('/auth/')) return next();
  if (!req.session.authenticated) return res.redirect('/login');
  next();
});

app.use(express.static(path.join(__dirname, 'client')));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getOAuthClient() {
  const clientId = getSetting('google_client_id') || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = getSetting('google_client_secret') || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, `http://localhost:${PORT}/auth/callback`);
}

function getAdsClient() {
  const devToken = getSetting('developer_token') || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = getSetting('google_client_id') || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = getSetting('google_client_secret') || process.env.GOOGLE_CLIENT_SECRET;
  const tokens = getStoredTokens();
  if (!devToken || !clientId || !clientSecret || !tokens?.refresh_token) return null;
  return new GoogleAdsApi({ client_id: clientId, client_secret: clientSecret, developer_token: devToken });
}

function formatCustomerId(id) { return String(id).replace(/-/g, ''); }

function getDateRange(range) {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  if (range === 'today') return { start: fmt(today), end: fmt(today) };
  if (range === 'last7') { const d = new Date(today); d.setDate(d.getDate() - 6); return { start: fmt(d), end: fmt(today) }; }
  if (range === 'last30') { const d = new Date(today); d.setDate(d.getDate() - 29); return { start: fmt(d), end: fmt(today) }; }
  if (range === 'thismonth') { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { start: fmt(d), end: fmt(today) }; }
  return { start: fmt(today), end: fmt(today) };
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  const oauth2Client = getOAuthClient();
  if (!oauth2Client) return res.redirect('/settings.html?error=no_credentials');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/settings.html?error=oauth_denied');
  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    setStoredTokens({ google_email: data.email, ...tokens });
    res.redirect('/?connected=true');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/settings.html?error=oauth_failed');
  }
});

app.post('/auth/signout', (req, res) => {
  setStoredTokens(null);
  res.json({ success: true });
});

// ─── SETTINGS ROUTES ─────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const tokens = getStoredTokens();
  res.json({
    google_client_id: getSetting('google_client_id') || process.env.GOOGLE_CLIENT_ID || '',
    google_client_secret: (getSetting('google_client_secret') || process.env.GOOGLE_CLIENT_SECRET) ? '••••••••' : '',
    developer_token: (getSetting('developer_token') || process.env.GOOGLE_ADS_DEVELOPER_TOKEN) ? '••••••••' : '',
    manager_customer_id: getSetting('manager_customer_id') || process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID || '',
    connected: !!tokens?.refresh_token,
    google_email: tokens?.google_email || null,
  });
});

app.post('/api/settings', (req, res) => {
  const { google_client_id, google_client_secret, developer_token, manager_customer_id } = req.body;
  if (google_client_id) setSetting('google_client_id', google_client_id);
  if (google_client_secret && !google_client_secret.includes('•')) setSetting('google_client_secret', google_client_secret);
  if (developer_token && !developer_token.includes('•')) setSetting('developer_token', developer_token);
  if (manager_customer_id) setSetting('manager_customer_id', formatCustomerId(manager_customer_id));
  res.json({ success: true });
});

app.get('/api/settings/status', (req, res) => {
  const tokens = getStoredTokens();
  const hasCredentials = !!(getSetting('google_client_id') || process.env.GOOGLE_CLIENT_ID);
  const hasDevToken = !!(getSetting('developer_token') || process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const hasManagerId = !!(getSetting('manager_customer_id') || process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID);
  res.json({
    connected: !!tokens?.refresh_token,
    google_email: tokens?.google_email || null,
    has_credentials: hasCredentials,
    has_dev_token: hasDevToken,
    has_manager_id: hasManagerId,
    setup_complete: hasCredentials && hasDevToken && !!tokens?.refresh_token,
  });
});

// ─── CLIENT MANAGEMENT ────────────────────────────────────────────────────────
app.get('/api/clients', (req, res) => {
  res.json(getClients().sort((a, b) => a.business_name.localeCompare(b.business_name)));
});

app.post('/api/clients', (req, res) => {
  const { customer_id, business_name, website, industry, contact_name, contact_phone, contact_email, notes, monthly_budget } = req.body;
  if (!customer_id || !business_name) return res.status(400).json({ error: 'customer_id and business_name required' });
  const clients = getClients();
  const clean_id = formatCustomerId(customer_id);
  if (clients.find(c => c.customer_id === clean_id)) return res.status(409).json({ error: 'Client with this Customer ID already exists' });
  const client = {
    id: Date.now(),
    customer_id: clean_id,
    business_name,
    website: website || '',
    industry: industry || '',
    contact_name: contact_name || '',
    contact_phone: contact_phone || '',
    contact_email: contact_email || '',
    notes: notes || '',
    monthly_budget: parseFloat(monthly_budget) || 0,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  clients.push(client);
  saveClients(clients);
  res.json(client);
});

app.put('/api/clients/:customerId', (req, res) => {
  const cid = formatCustomerId(req.params.customerId);
  const clients = getClients();
  const idx = clients.findIndex(c => c.customer_id === cid);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const updates = req.body;
  clients[idx] = { ...clients[idx], ...updates, customer_id: cid, updated_at: new Date().toISOString() };
  if (updates.monthly_budget !== undefined) clients[idx].monthly_budget = parseFloat(updates.monthly_budget) || 0;
  saveClients(clients);
  res.json(clients[idx]);
});

app.delete('/api/clients/:customerId', (req, res) => {
  const cid = formatCustomerId(req.params.customerId);
  const clients = getClients().filter(c => c.customer_id !== cid);
  saveClients(clients);
  res.json({ success: true });
});

// ─── GOOGLE ADS DATA ──────────────────────────────────────────────────────────
async function getCustomerWithTokens(customerId) {
  const adsClient = getAdsClient();
  if (!adsClient) throw new Error('Google Ads not configured. Please complete setup in Settings.');
  const tokens = getStoredTokens();
  const managerId = getSetting('manager_customer_id') || process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID;
  return adsClient.Customer({
    customer_id: formatCustomerId(customerId),
    login_customer_id: managerId ? formatCustomerId(managerId) : undefined,
    refresh_token: tokens.refresh_token,
  });
}

app.get('/api/accounts', async (req, res) => {
  const clients = getClients().sort((a, b) => a.business_name.localeCompare(b.business_name));
  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) return res.json({ clients, connected: false });

  const statsPromises = clients.map(async (client) => {
    try {
      const customer = await getCustomerWithTokens(client.customer_id);
      const { start: monthStart, end: today } = getDateRange('thismonth');
      const [todayRows, monthRows, campaignRows] = await Promise.all([
        customer.query(`SELECT metrics.cost_micros, metrics.clicks FROM customer WHERE segments.date DURING TODAY`),
        customer.query(`SELECT metrics.cost_micros, metrics.clicks FROM customer WHERE segments.date BETWEEN '${monthStart}' AND '${today}'`),
        customer.query(`SELECT campaign.id FROM campaign WHERE campaign.status = 'ENABLED'`),
      ]);
      return {
        ...client,
        spendToday: (todayRows[0]?.metrics?.cost_micros || 0) / 1_000_000,
        spendMonth: (monthRows[0]?.metrics?.cost_micros || 0) / 1_000_000,
        clicksToday: todayRows[0]?.metrics?.clicks || 0,
        activeCampaigns: campaignRows.length,
        apiError: null,
      };
    } catch (err) {
      return { ...client, spendToday: 0, spendMonth: 0, clicksToday: 0, activeCampaigns: 0, apiError: err.message };
    }
  });

  const results = await Promise.all(statsPromises);
  res.json({ clients: results, connected: true });
});

app.get('/api/accounts/:customerId/stats', async (req, res) => {
  const range = req.query.range || 'today';
  try {
    const customer = await getCustomerWithTokens(req.params.customerId);
    const { start, end } = getDateRange(range);
    const [rangeRows, todayRows] = await Promise.all([
      customer.query(`SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.ctr FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`),
      customer.query(`SELECT metrics.cost_micros, metrics.clicks FROM customer WHERE segments.date DURING TODAY`),
    ]);
    const s = rangeRows[0]?.metrics || {};
    const t = todayRows[0]?.metrics || {};
    res.json({
      range, spend: (s.cost_micros || 0) / 1_000_000, clicks: s.clicks || 0,
      impressions: s.impressions || 0, conversions: s.conversions || 0, ctr: s.ctr || 0,
      spend_today: (t.cost_micros || 0) / 1_000_000, clicks_today: t.clicks || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts/:customerId/campaigns', async (req, res) => {
  const range = req.query.range || 'today';
  try {
    const customer = await getCustomerWithTokens(req.params.customerId);
    const { start, end } = getDateRange(range);
    const rows = await customer.query(`
      SELECT campaign.id, campaign.name, campaign.status,
        campaign_budget.amount_micros,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.ctr
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `);
    res.json(rows.map(r => ({
      id: r.campaign.id, name: r.campaign.name, status: r.campaign.status,
      daily_budget: (r.campaign_budget?.amount_micros || 0) / 1_000_000,
      spend: (r.metrics.cost_micros || 0) / 1_000_000,
      clicks: r.metrics.clicks || 0, impressions: r.metrics.impressions || 0,
      conversions: r.metrics.conversions || 0, ctr: r.metrics.ctr || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts/:customerId/campaigns/:campaignId/pause', async (req, res) => {
  try {
    const customer = await getCustomerWithTokens(req.params.customerId);
    await customer.campaigns.update([{
      resource_name: `customers/${formatCustomerId(req.params.customerId)}/campaigns/${req.params.campaignId}`,
      status: 'PAUSED',
    }]);
    res.json({ success: true, status: 'PAUSED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/accounts/:customerId/campaigns/:campaignId/enable', async (req, res) => {
  try {
    const customer = await getCustomerWithTokens(req.params.customerId);
    await customer.campaigns.update([{
      resource_name: `customers/${formatCustomerId(req.params.customerId)}/campaigns/${req.params.campaignId}`,
      status: 'ENABLED',
    }]);
    res.json({ success: true, status: 'ENABLED' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/accounts/:customerId/campaigns/:campaignId/budget', async (req, res) => {
  const { daily_budget } = req.body;
  if (!daily_budget) return res.status(400).json({ error: 'daily_budget required' });
  try {
    const customer = await getCustomerWithTokens(req.params.customerId);
    const rows = await customer.query(`
      SELECT campaign_budget.resource_name FROM campaign
      WHERE campaign.id = ${req.params.campaignId} LIMIT 1
    `);
    if (!rows[0]?.campaign_budget?.resource_name) return res.status(404).json({ error: 'Budget not found' });
    await customer.campaignBudgets.update([{
      resource_name: rows[0].campaign_budget.resource_name,
      amount_micros: Math.round(daily_budget * 1_000_000),
    }]);
    res.json({ success: true, daily_budget: parseFloat(daily_budget) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));
app.get('/client/:id', (req, res) => res.sendFile(path.join(__dirname, 'client', 'client.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'client', 'settings.html')));

// ─── START ────────────────────────────────────────────────────────────────────
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const ipLine = `║  Network:  http://${ip}:${PORT}`;
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║          ADS MANAGER - RUNNING             ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}           ║`);
  console.log(ipLine.padEnd(46) + '║');
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  Phone: connect to the Network URL above   ║');
  console.log('║  Anywhere: run  ngrok http 5000            ║');
  console.log('╚════════════════════════════════════════════╝\n');
});
