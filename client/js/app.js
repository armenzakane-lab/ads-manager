// ── Shared Helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt$ = n => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => (n || 0) >= 1000 ? ((n/1000).toFixed(1) + 'K') : String(n || 0);
const initials = name => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// ── Sidebar ────────────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = $('sidebar'), ov = $('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('open');
}

// ── Sign Out ───────────────────────────────────────────────────────────────────
async function signOut() {
  await fetch('/auth/signout', { method: 'POST' });
  window.location.reload();
}

// ── Status Check + Sidebar User ───────────────────────────────────────────────
async function loadStatus() {
  const res = await fetch('/api/settings/status');
  const s = await res.json();
  if (s.google_email) {
    $('userEmail').textContent = s.google_email;
    $('userAvatar').textContent = s.google_email[0].toUpperCase();
    $('userBadge').textContent = '● Connected';
    $('userBadge').style.color = 'var(--success)';
  }
  if (!s.setup_complete) {
    $('setupBanner').style.display = 'block';
  }
}

// ── Load Sidebar Clients ───────────────────────────────────────────────────────
async function loadSidebarClients(clients) {
  const el = $('sidebarClients');
  if (!clients || !clients.length) {
    el.innerHTML = '<div style="padding:8px 20px;font-size:12px;color:var(--muted);">No clients yet</div>';
    return;
  }
  el.innerHTML = clients.map(c => `
    <a href="/client/${c.customer_id}" class="client-nav-item">
      <span class="status-dot ${c.status || 'active'}"></span>
      <span class="client-nav-name">${c.business_name}</span>
      ${c.spendMonth !== undefined ? `<span class="client-nav-spend">${fmt$(c.spendMonth)}</span>` : ''}
    </a>
  `).join('');
}

// ── Load Dashboard ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch('/api/accounts');
    const data = await res.json();
    const clients = data.clients || [];

    loadSidebarClients(clients);

    // Agency headline
    const totalSpendMonth = clients.reduce((s, c) => s + (c.spendMonth || 0), 0);
    const activeCount = clients.filter(c => c.status !== 'inactive').length;
    $('agencyHeadline').textContent =
      `Managing ${activeCount} client${activeCount !== 1 ? 's' : ''} · ${fmt$(totalSpendMonth)} total spend this month`;
    $('clientCount').textContent = `${clients.length} total client${clients.length !== 1 ? 's' : ''}`;

    // Summary stats
    const totalSpendToday = clients.reduce((s, c) => s + (c.spendToday || 0), 0);
    const totalClicksToday = clients.reduce((s, c) => s + (c.clicksToday || 0), 0);
    const totalActiveCampaigns = clients.reduce((s, c) => s + (c.activeCampaigns || 0), 0);

    $('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Spend Today</div>
        <div class="stat-value">${fmt$(totalSpendToday)}</div>
        <div class="stat-sub">Across all clients</div>
        <div class="stat-icon">💸</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Spend This Month</div>
        <div class="stat-value">${fmt$(totalSpendMonth)}</div>
        <div class="stat-sub">Current calendar month</div>
        <div class="stat-icon">📅</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Clicks Today</div>
        <div class="stat-value">${fmtK(totalClicksToday)}</div>
        <div class="stat-sub">Combined all clients</div>
        <div class="stat-icon">👆</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Campaigns</div>
        <div class="stat-value">${totalActiveCampaigns}</div>
        <div class="stat-sub">Across all accounts</div>
        <div class="stat-icon">🚀</div>
      </div>
    `;

    // Client cards
    if (!clients.length) {
      $('clientsGrid').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">📋</div>
          <h3>No clients yet</h3>
          <p>Add your first client to start managing their Google Ads campaigns.</p>
          <button class="btn btn-primary btn-lg" onclick="openAddClientModal()">Add Your First Client</button>
        </div>
      `;
      return;
    }

    $('clientsGrid').innerHTML = clients.map(c => {
      const badge = c.status === 'paused' ? 'badge-paused' : c.status === 'inactive' ? 'badge-inactive' : 'badge-active';
      const label = c.status === 'paused' ? 'Paused' : c.status === 'inactive' ? 'Inactive' : 'Active';
      const hasErr = c.apiError;
      return `
        <div class="client-card" onclick="window.location.href='/client/${c.customer_id}'">
          <div class="client-card-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="client-avatar">${initials(c.business_name)}</div>
              <div>
                <div class="client-card-name">${c.business_name}</div>
                <div class="client-card-meta">
                  ${c.industry ? `<span>🏷️ ${c.industry}</span>` : ''}
                </div>
                ${c.website ? `<div class="client-card-website">🔗 ${c.website.replace(/^https?:\/\//, '')}</div>` : ''}
              </div>
            </div>
            <span class="client-status-badge ${badge}">${label}</span>
          </div>

          <div class="client-stats">
            <div class="client-stat-item">
              <div class="label">Spend Today</div>
              <div class="value">${hasErr ? '—' : fmt$(c.spendToday)}</div>
            </div>
            <div class="client-stat-item">
              <div class="label">This Month</div>
              <div class="value">${hasErr ? '—' : fmt$(c.spendMonth)}</div>
            </div>
            <div class="client-stat-item">
              <div class="label">Clicks Today</div>
              <div class="value">${hasErr ? '—' : fmtK(c.clicksToday)}</div>
            </div>
            <div class="client-stat-item">
              <div class="label">Campaigns</div>
              <div class="value">${hasErr ? '—' : c.activeCampaigns}</div>
            </div>
          </div>

          ${hasErr ? `<div style="font-size:11px;color:var(--warning);padding:6px 0;">⚠️ API unavailable</div>` : ''}
          ${c.monthly_budget ? `<div style="font-size:11px;color:var(--muted);padding:2px 0;">Budget: ${fmt$(c.monthly_budget)}/mo</div>` : ''}

          <div class="client-card-footer">
            <span class="client-id">${c.customer_id}</span>
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window.location.href='/client/${c.customer_id}'">View →</button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Dashboard error:', err);
    $('statsGrid').innerHTML = `<div class="alert alert-error" style="grid-column:1/-1;">Failed to load data. <button class="btn btn-sm btn-secondary" onclick="loadDashboard()">Retry</button></div>`;
  }
}

// ── Add Client Modal ───────────────────────────────────────────────────────────
function openAddClientModal() {
  $('addClientModal').classList.add('open');
  $('addClientError').style.display = 'none';
  $('newClientName').focus();
}
function closeAddClientModal() {
  $('addClientModal').classList.remove('open');
}

async function submitAddClient() {
  const name = $('newClientName').value.trim();
  const cid  = $('newClientId').value.trim();
  if (!name || !cid) {
    $('addClientError').textContent = 'Business name and Customer ID are required.';
    $('addClientError').style.display = 'flex';
    return;
  }
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: name,
        customer_id: cid,
        website: $('newClientWebsite').value.trim(),
        industry: $('newClientIndustry').value.trim(),
        contact_name: $('newClientContact').value.trim(),
        contact_phone: $('newClientPhone').value.trim(),
        monthly_budget: parseFloat($('newClientBudget').value) || 0,
        notes: $('newClientNotes').value.trim(),
      })
    });
    const data = await res.json();
    if (data.error) {
      $('addClientError').textContent = data.error;
      $('addClientError').style.display = 'flex';
      return;
    }
    closeAddClientModal();
    ['newClientName','newClientId','newClientWebsite','newClientIndustry','newClientContact','newClientPhone','newClientBudget','newClientNotes']
      .forEach(id => { $(id).value = ''; });
    loadDashboard();
  } catch (err) {
    $('addClientError').textContent = 'Failed to add client.';
    $('addClientError').style.display = 'flex';
  }
}

function refreshData() { loadDashboard(); }

// Close modal on backdrop click
$('addClientModal').addEventListener('click', e => { if (e.target === $('addClientModal')) closeAddClientModal(); });

// ── Init ───────────────────────────────────────────────────────────────────────
loadStatus();
loadDashboard();
