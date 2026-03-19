const $ = id => document.getElementById(id);

function toggleSidebar() {
  const sb = $('sidebar'), ov = $('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('open');
}

async function signOut() {
  await fetch('/auth/signout', { method: 'POST' });
  window.location.reload();
}

function showAlert(msg, type = 'info') {
  $('alertArea').innerHTML = `<div class="alert alert-${type}" style="margin-bottom:20px;">${msg}</div>`;
  setTimeout(() => { $('alertArea').innerHTML = ''; }, 5000);
}

// ── Load Settings ──────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const [sRes, cRes, stRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/clients'),
      fetch('/api/settings/status'),
    ]);
    const s = await sRes.json();
    const clients = await cRes.json();
    const status = await stRes.json();

    // Populate form
    $('clientId').value = s.google_client_id || '';
    $('clientSecret').value = s.google_client_secret || '';
    $('developerToken').value = s.developer_token || '';
    $('managerCustomerId').value = s.manager_customer_id || '';

    // Update sidebar user
    if (status.google_email) {
      $('userEmail').textContent = status.google_email;
      $('userAvatar').textContent = status.google_email[0].toUpperCase();
      $('userBadge').textContent = '● Connected';
      $('userBadge').style.color = 'var(--success)';
    }

    // Connection status
    const connEl = $('connectionStatus');
    if (status.connected) {
      connEl.innerHTML = `
        <div class="alert alert-success" style="margin:0;">
          ✅ Connected as <strong>${status.google_email}</strong>
        </div>
      `;
      $('connectActions').innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="/auth/google" class="btn btn-secondary" style="flex:1;justify-content:center;">
            🔄 Reconnect Account
          </a>
          <a href="/" class="btn btn-primary" style="flex:1;justify-content:center;">
            Go to Dashboard →
          </a>
        </div>
      `;
    } else {
      connEl.innerHTML = `
        <div class="alert alert-warning" style="margin:0;">
          ⚠️ Not connected to Google. ${!status.has_credentials ? 'Save your credentials first.' : 'Click below to authorize.'}
        </div>
      `;
    }

    // App info
    $('totalClientsInfo').textContent = clients.length;
    $('networkUrl').textContent = window.location.host;

    // Sidebar clients
    const sbClients = $('sidebarClients');
    if (clients.length) {
      sbClients.innerHTML = clients.map(c => `
        <a href="/client/${c.customer_id}" class="client-nav-item">
          <span class="status-dot ${c.status || 'active'}"></span>
          <span class="client-nav-name">${c.business_name}</span>
        </a>
      `).join('');
    }

    // URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'no_credentials') showAlert('⚠️ Please save your OAuth credentials before connecting.', 'warning');
    if (params.get('error') === 'oauth_denied') showAlert('OAuth was cancelled or denied.', 'warning');
    if (params.get('error') === 'oauth_failed') showAlert('OAuth failed. Check your Client ID and Secret.', 'error');

  } catch (err) {
    console.error('Settings load error:', err);
  }
}

// ── Save Settings ──────────────────────────────────────────────────────────────
async function saveSettings() {
  const payload = {
    google_client_id: $('clientId').value.trim(),
    google_client_secret: $('clientSecret').value.trim(),
    developer_token: $('developerToken').value.trim(),
    manager_customer_id: $('managerCustomerId').value.trim(),
  };

  if (!payload.google_client_id) {
    showAlert('Client ID is required.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (d.success) {
      showAlert('✅ Settings saved! Now connect your Google account below.', 'success');
    } else {
      showAlert('Failed to save settings.', 'error');
    }
  } catch (err) {
    showAlert('Error saving settings: ' + err.message, 'error');
  }
}

loadSettings();
