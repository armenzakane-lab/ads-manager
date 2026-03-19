# Ads Manager

> Agency dashboard for managing multiple clients' Google Ads accounts from one place.

Dark, mobile-first UI. Runs locally on your machine. No subscriptions, no cloud — your data stays on your computer.

---

## Quick Start

```bash
cd ads-manager
npm install
node server.js
```

Open **http://localhost:5000** in your browser, or the **Network URL** printed in the console to open it on your phone.

---

## Setup (5 minutes)

### Step 1 — Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Ads Manager")
3. APIs & Services → Library → search **Google Ads API** → Enable it

### Step 2 — OAuth Credentials

1. APIs & Services → Credentials → **Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorized redirect URIs: add `http://localhost:5000/auth/callback`
4. Copy your **Client ID** and **Client Secret**

### Step 3 — Developer Token

1. Go to [ads.google.com/aw/apicenter](https://ads.google.com/aw/apicenter)
2. Apply for a developer token (Google reviews these — can take a few days)
3. For testing, you'll get a **Test** token immediately (works with test accounts)

### Step 4 — Enter Credentials

1. Open Ads Manager → Settings
2. Enter your Client ID, Client Secret, Developer Token, and MCC ID
3. Click **Save Settings**
4. Click **Connect Google Account** → authorize in the browser

### Step 5 — Add Clients

On the dashboard, click **Add Client** and enter:
- Business name (e.g. "Zaragoza Detailz")
- Google Ads Customer ID (e.g. `123-456-7890`)
- Website, contact info, industry, notes

---

## Access From Your Phone

### On Home Wi-Fi (Local Network)

When the server starts, it prints your local IP:

```
║  Network:  http://192.168.1.100:5000
```

Open that URL on any device on the same Wi-Fi network.

### From Anywhere (ngrok)

To access the dashboard from anywhere — not just home:

1. **Install ngrok**: [ngrok.com/download](https://ngrok.com/download) (free)
2. **Run it**:
   ```bash
   ngrok http 5000
   ```
3. ngrok gives you a public URL like `https://abc123.ngrok-free.app`
4. Open that URL on your phone, from a client's office, anywhere

> **Note:** Add the ngrok URL as an authorized redirect URI in Google Cloud Console if you want OAuth to work over ngrok.

---

## File Structure

```
ads-manager/
  server.js           Express backend + Google Ads API + OAuth
  ads-manager.db      SQLite database (auto-created on first run)
  package.json
  .env.example        Environment variable template
  README.md
  client/
    index.html        Dashboard (agency overview)
    client.html       Client detail + campaigns
    settings.html     OAuth setup + ngrok guide
    css/
      app.css         All styles (dark theme, mobile-first)
    js/
      app.js          Dashboard logic
      client.js       Client detail + campaign management
      settings.js     Settings page logic
```

---

## Environment Variables (Optional)

Instead of entering credentials via Settings UI, create a `.env` file:

```bash
cp .env.example .env
```

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN=your_dev_token
GOOGLE_ADS_MANAGER_CUSTOMER_ID=1234567890
SESSION_SECRET=some_random_string_here
PORT=5000
```

---

## Notes

- **Data stored**: client info + OAuth refresh token in `ads-manager.db` (local SQLite, never leaves your machine)
- **Google Ads API**: uses the `google-ads-api` package by Opteo — the best Node.js client
- **MCC support**: if you have a Manager Account (MCC), enter that ID and the app will use it to access all child accounts
- **Developer token approval**: basic/test tokens work for development; standard access required for production use with real spend data
