// ── Shared Helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt$ = n => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => (n || 0) >= 1000 ? ((n/1000).toFixed(1) + 'K') : String(n || 0);
const fmtPct = n => ((n || 0) * 100).toFixed(2) + '%';
const initials = name => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// Extract customer ID from URL: /client/1234567890
const customerId = window.location.pathname.split('/').pop();
let currentRange = 'today';
let clientData = null;

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

async function signOut() {
  await fetch('/auth/signout', { method: 'POST' });
  window.location.href = '/';
}

// ── Load Sidebar Clients ───────────────────────────────────────────────────────
async function loadSidebarClients() {
  try {
    const res = await fetch('/api/clients');
    const clients = await res.json();
    const el = $('sidebarClients');
    if (!clients.length) { el.innerHTML = ''; return; }
    el.innerHTML = clients.map(c => `
      <a href="/client/${c.customer_id}" class="client-nav-item ${c.customer_id === customerId ? 'active' : ''}">
        <span class="status-dot ${c.status || 'active'}"></span>
        <span class="client-nav-name">${c.business_name}</span>
      </a>
    `).join('');
  } catch(e) {}
}

async function loadStatus() {
  try {
    const res = await fetch('/api/settings/status');
    const s = await res.json();
    if (s.google_email) {
      $('userEmail').textContent = s.google_email;
      $('userAvatar').textContent = s.google_email[0].toUpperCase();
      $('userBadge').textContent = '● Connected';
      $('userBadge').style.color = 'var(--success)';
    }
  } catch(e) {}
}

// ── Load Client Info ───────────────────────────────────────────────────────────
async function loadClientInfo() {
  try {
    const res = await fetch('/api/clients');
    const clients = await res.json();
    clientData = clients.find(c => c.customer_id === customerId);
    if (!clientData) {
      document.title = 'Client Not Found';
      $('clientName').textContent = 'Client Not Found';
      return;
    }
    renderClientInfo(clientData);
  } catch (err) {
    console.error('Client info error:', err);
  }
}

function renderClientInfo(c) {
  document.title = `${c.business_name} — Ads Manager`;
  $('topbarTitle').textContent = c.business_name;
  $('clientName').textContent = c.business_name;
  $('clientAvatarLg').textContent = initials(c.business_name);

  const badge = c.status === 'paused' ? 'badge-paused' : c.status === 'inactive' ? 'badge-inactive' : 'badge-active';
  const label = c.status === 'paused' ? 'Paused' : c.status === 'inactive' ? 'Inactive' : 'Active';
  const sb = $('clientStatusBadge');
  sb.className = `client-status-badge ${badge}`;
  sb.textContent = label;

  $('clientIndustry').textContent = c.industry || '';
  $('clientIdDisplay').textContent = `ID: ${c.customer_id}`;

  const webEl = $('clientWebsite');
  if (c.website) {
    webEl.href = c.website.startsWith('http') ? c.website : 'https://' + c.website;
    webEl.textContent = c.website.replace(/^https?:\/\//, '');
  } else { webEl.textContent = '—'; webEl.removeAttribute('href'); }

  $('clientContact').textContent = c.contact_name || '—';

  const phoneEl = $('clientPhone');
  if (c.contact_phone) {
    phoneEl.href = `tel:${c.contact_phone}`;
    phoneEl.textContent = c.contact_phone;
    phoneEl.style.color = 'var(--accent)';
  } else { phoneEl.textContent = '—'; phoneEl.removeAttribute('href'); }

  $('clientBudgetDisplay').textContent = c.monthly_budget ? fmt$(c.monthly_budget) + '/mo' : '—';
  $('clientNotes').textContent = c.notes || '—';
}

// ── Load Stats ─────────────────────────────────────────────────────────────────
async function loadStats(range) {
  ['statSpend','statClicks','statImpressions','statCtr','statConversions','statSpendToday'].forEach(id => {
    $(id).innerHTML = '<span class="skeleton" style="display:inline-block;width:70px;height:24px;border-radius:4px;"></span>';
  });
  try {
    const res = await fetch(`/api/accounts/${customerId}/stats?range=${range}`);
    const s = await res.json();
    if (s.error) throw new Error(s.error);
    $('statSpend').textContent = fmt$(s.spend);
    $('statClicks').textContent = fmtK(s.clicks);
    $('statImpressions').textContent = fmtK(s.impressions);
    $('statCtr').textContent = fmtPct(s.ctr);
    $('statConversions').textContent = (s.conversions || 0).toFixed(1);
    $('statSpendToday').textContent = fmt$(s.spend_today);
  } catch (err) {
    const errMsg = `<span style="color:var(--warning);font-size:12px;">API err</span>`;
    ['statSpend','statClicks','statImpressions','statCtr','statConversions','statSpendToday'].forEach(id => { $(id).innerHTML = errMsg; });
    showApiError(err.message);
  }
}

// ── Load Campaigns ─────────────────────────────────────────────────────────────
async function loadCampaigns(range) {
  const tbody = $('campaignsBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;">
    <div class="skeleton" style="height:16px;width:50%;margin:auto;border-radius:4px;"></div>
  </td></tr>`;

  try {
    const res = await fetch(`/api/accounts/${customerId}/campaigns?range=${range}`);
    const campaigns = await res.json();
    if (campaigns.error) throw new Error(campaigns.error);

    $('campaignCount').textContent = `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`;

    if (!campaigns.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted);">No campaigns found</td></tr>`;
      return;
    }

    tbody.innerHTML = campaigns.map(c => {
      const isEnabled = c.status === 'ENABLED';
      return `
        <tr>
          <td>
            <div style="font-weight:600;color:var(--text-bright);font-size:13px;">${c.name}</div>
            <div style="font-size:11px;color:var(--muted);">${c.status}</div>
          </td>
          <td>
            <label class="toggle" title="${isEnabled ? 'Pause' : 'Enable'} campaign">
              <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleCampaign('${c.id}', this.checked)">
              <span class="toggle-track"></span>
            </label>
          </td>
          <td>
            <input
              class="inline-edit"
              type="number"
              value="${c.daily_budget.toFixed(2)}"
              min="0"
              step="0.01"
              onblur="updateBudget('${c.id}', this)"
              onkeydown="if(event.key==='Enter')this.blur()"
              title="Click to edit daily budget"
            >
          </td>
          <td>${fmt$(c.spend)}</td>
          <td>${fmtK(c.clicks)}</td>
          <td>${fmtK(c.impressions)}</td>
          <td>${fmtPct(c.ctr)}</td>
          <td>${(c.conversions || 0).toFixed(1)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;">
      <div style="color:var(--warning);font-size:13px;margin-bottom:10px;">⚠️ ${err.message}</div>
      <button class="btn btn-secondary btn-sm" onclick="loadCampaigns(currentRange)">Retry</button>
    </td></tr>`;
    showApiError(err.message);
  }
}

// ── Campaign Actions ───────────────────────────────────────────────────────────
async function toggleCampaign(campaignId, enable) {
  const action = enable ? 'enable' : 'pause';
  try {
    const res = await fetch(`/api/accounts/${customerId}/campaigns/${campaignId}/${action}`, { method: 'POST' });
    const d = await res.json();
    if (d.error) alert('Error: ' + d.error);
  } catch (err) {
    alert('Failed to update campaign status');
  }
}

async function updateBudget(campaignId, inputEl) {
  const val = parseFloat(inputEl.value);
  if (isNaN(val) || val < 0) return;
  inputEl.style.opacity = '0.5';
  try {
    const res = await fetch(`/api/accounts/${customerId}/campaigns/${campaignId}/budget`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_budget: val })
    });
    const d = await res.json();
    if (d.error) { alert('Error: ' + d.error); return; }
    inputEl.style.outline = '1px solid var(--success)';
    setTimeout(() => { inputEl.style.outline = ''; }, 1200);
  } catch (err) {
    alert('Failed to update budget');
  } finally {
    inputEl.style.opacity = '';
  }
}

function showApiError(msg) {
  const el = $('apiErrorBadge');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.textContent = '⚠️ ' + (msg.includes('developer token') ? 'Developer token not approved yet' : msg.length > 80 ? msg.slice(0, 80) + '...' : msg);
}

// ── Date Range Tabs ────────────────────────────────────────────────────────────
document.querySelectorAll('.range-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    loadStats(currentRange);
    loadCampaigns(currentRange);
  });
});

// ── Edit Client Modal ──────────────────────────────────────────────────────────
function openEditClientModal() {
  if (!clientData) return;
  $('editName').value = clientData.business_name || '';
  $('editIndustry').value = clientData.industry || '';
  $('editStatus').value = clientData.status || 'active';
  $('editWebsite').value = clientData.website || '';
  $('editContact').value = clientData.contact_name || '';
  $('editPhone').value = clientData.contact_phone || '';
  $('editBudget').value = clientData.monthly_budget || '';
  $('editNotes').value = clientData.notes || '';
  $('editClientModal').classList.add('open');
}
function closeEditClientModal() {
  $('editClientModal').classList.remove('open');
}

async function submitEditClient() {
  try {
    const res = await fetch(`/api/clients/${customerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: $('editName').value.trim(),
        industry: $('editIndustry').value.trim(),
        status: $('editStatus').value,
        website: $('editWebsite').value.trim(),
        contact_name: $('editContact').value.trim(),
        contact_phone: $('editPhone').value.trim(),
        monthly_budget: parseFloat($('editBudget').value) || 0,
        notes: $('editNotes').value.trim(),
      })
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    clientData = data;
    renderClientInfo(data);
    closeEditClientModal();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

async function confirmDeleteClient() {
  if (!confirm(`Remove "${clientData?.business_name}" from Ads Manager? This won't delete their Google Ads account.`)) return;
  try {
    await fetch(`/api/clients/${customerId}`, { method: 'DELETE' });
    window.location.href = '/';
  } catch (err) {
    alert('Failed to delete client');
  }
}

$('editClientModal').addEventListener('click', e => { if (e.target === $('editClientModal')) closeEditClientModal(); });

function refreshData() {
  loadStats(currentRange);
  loadCampaigns(currentRange);
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadStatus();
loadSidebarClients();
loadClientInfo().then(() => {
  loadStats(currentRange);
  loadCampaigns(currentRange);
});
