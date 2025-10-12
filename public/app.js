const STORAGE_KEY = 'pantryPilotSettings';

const defaultConfig = {
  inventory: {
    spreadsheetId: '',
    sheetName: 'Inventory'
  },
  secrets: {
    google: {
      clientEmail: '',
      privateKey: ''
    },
    smtp: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: '',
      pass: '',
      from: 'Pantry Pilot you@gmail.com',
      to: 'you@gmail.com'
    }
  }
};

const computedColumns = [
  {
    key: 'needsReplenishment',
    label: 'Needs Replenishment',
    render: insight => {
      if (!insight || !insight.valid) return '—';
      return insight.needsReplenishment ? 'Yes' : 'No';
    }
  },
  {
    key: 'replenishByDate',
    label: 'Replenish By',
    render: insight => (insight && insight.valid && insight.replenishByDate) || '—'
  },
  {
    key: 'recommendedOrderQty',
    label: 'Recommended Qty',
    render: insight => {
      if (!insight || !insight.valid) return '—';
      return insight.recommendedOrderQty ?? '—';
    }
  },
  {
    key: 'daysUntilDepletion',
    label: 'Days Remaining',
    render: insight => {
      if (!insight || !insight.valid) return '—';
      return insight.daysUntilDepletion ?? '—';
    }
  },
  {
    key: 'reason',
    label: 'Reason / Issue',
    render: insight => {
      if (!insight) return '—';
      if (!insight.valid) return insight.issue ?? 'Invalid row';
      return insight.reason ?? '—';
    }
  }
];

let config = normalizeConfig(loadStoredConfig());
const state = {
  header: [],
  rows: [],
  computed: [],
  summary: null,
  filterText: ''
};

let statusEl;
let summaryCards;
let summaryEmpty;
let views;
let navItems;
let segmentedButtons;
let toolbarTitle;
let toolbarSubtitle;
let openSettingsBtn;
let activeView = 'settings';
let loadPromise = null;

document.addEventListener('DOMContentLoaded', () => {
  statusEl = document.getElementById('status');
  summaryCards = document.getElementById('summary-cards');
  summaryEmpty = document.getElementById('summary-empty');
  views = {
    summary: document.getElementById('summary-view'),
    inventory: document.getElementById('inventory-view'),
    settings: document.getElementById('settings-view')
  };
  navItems = Array.from(document.querySelectorAll('.nav-item'));
  segmentedButtons = Array.from(document.querySelectorAll('.segmented-btn'));
  toolbarTitle = document.getElementById('toolbar-title');
  toolbarSubtitle = document.getElementById('toolbar-subtitle');
  openSettingsBtn = document.getElementById('open-settings');
  const form = document.getElementById('settings-form');
  const loadBtn = document.getElementById('load-inventory');
  const saveBtn = document.getElementById('save-inventory');
  const addRowBtn = document.getElementById('add-row');
  const refreshBtn = document.getElementById('refresh-insights');
  const reloadBtn = document.getElementById('reload-data');

  populateForm(config);
  updateControls();
  renderSummary();

  navItems.forEach(item => {
    item.addEventListener('click', () => handleNavSelection(item.dataset.view));
  });

  segmentedButtons.forEach(btn => {
    btn.addEventListener('click', () => handleNavSelection(btn.dataset.view));
  });

  const searchInput = document.getElementById('inventory-search');
  searchInput?.addEventListener('input', event => {
    state.filterText = event.target.value ?? '';
    renderInventory();
  });

  openSettingsBtn?.addEventListener('click', () => {
    handleNavSelection('settings');
  });

  reloadBtn?.addEventListener('click', () => {
    if (!isConfigComplete(config)) {
      setStatus('Fill in your settings before reloading.', 'error');
      showView('settings');
      return;
    }
    loadInventory().catch(() => {});
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    config = gatherConfigFromForm(form);
    saveConfig(config);
    updateNavState();
    setStatus('Settings saved locally.', 'success');
    if (isConfigComplete(config)) {
      handleNavSelection('inventory');
    } else {
      showView('settings');
    }
  });

  loadBtn.addEventListener('click', () => {
    handleNavSelection('inventory');
  });

  saveBtn.addEventListener('click', () => {
    saveInventory().catch(() => {});
  });

  addRowBtn.addEventListener('click', () => {
    if (!state.header.length) return;
    syncTableToState();
    const newRow = Array.from({ length: state.header.length }, () => '');
    state.rows.push(newRow);
    state.computed.push(null);
    renderInventory();
    setStatus('New row added. Don’t forget to save changes.', 'info');
  });

  refreshBtn.addEventListener('click', () => {
    if (!state.header.length) {
      setStatus('Load the inventory first to refresh insights.', 'error');
      return;
    }
    loadInventory({ silent: false }).catch(() => {});
  });

  if (isConfigComplete(config)) {
    handleNavSelection('inventory', { initial: true });
  } else {
    showView('settings');
  }
});

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig;
    return JSON.parse(raw);
  } catch {
    return defaultConfig;
  }
}

function normalizeConfig(raw) {
  return {
    inventory: {
      spreadsheetId: raw?.inventory?.spreadsheetId ?? '',
      sheetName: raw?.inventory?.sheetName ?? 'Inventory'
    },
    secrets: {
      google: {
        clientEmail: raw?.secrets?.google?.clientEmail ?? '',
        privateKey: raw?.secrets?.google?.privateKey ?? ''
      },
      smtp: {
        host: raw?.secrets?.smtp?.host ?? 'smtp.gmail.com',
        port: Number(raw?.secrets?.smtp?.port ?? 465),
        secure: raw?.secrets?.smtp?.secure ?? true,
        user: raw?.secrets?.smtp?.user ?? '',
        pass: raw?.secrets?.smtp?.pass ?? '',
        from: raw?.secrets?.smtp?.from ?? 'Pantry Pilot you@gmail.com',
        to: raw?.secrets?.smtp?.to ?? 'you@gmail.com'
      }
    }
  };
}

function saveConfig(nextConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
}

function populateForm(cfg) {
  const form = document.getElementById('settings-form');
  form.elements.spreadsheetId.value = cfg.inventory.spreadsheetId;
  form.elements.sheetName.value = cfg.inventory.sheetName;
  form.elements.googleClientEmail.value = cfg.secrets.google.clientEmail;
  form.elements.googlePrivateKey.value = cfg.secrets.google.privateKey;
  form.elements.smtpHost.value = cfg.secrets.smtp.host;
  form.elements.smtpPort.value = cfg.secrets.smtp.port;
  form.elements.smtpSecure.checked = Boolean(cfg.secrets.smtp.secure);
  form.elements.smtpUser.value = cfg.secrets.smtp.user;
  form.elements.smtpPass.value = cfg.secrets.smtp.pass;
  form.elements.emailFrom.value = cfg.secrets.smtp.from;
  form.elements.emailTo.value = cfg.secrets.smtp.to;
}

function gatherConfigFromForm(form) {
  const formData = new FormData(form);
  return normalizeConfig({
    inventory: {
      spreadsheetId: formData.get('spreadsheetId')?.trim() ?? '',
      sheetName: formData.get('sheetName')?.trim() || 'Inventory'
    },
    secrets: {
      google: {
        clientEmail: formData.get('googleClientEmail')?.trim() ?? '',
        privateKey: (formData.get('googlePrivateKey') ?? '').toString()
      },
      smtp: {
        host: formData.get('smtpHost')?.trim() || 'smtp.gmail.com',
        port: Number(formData.get('smtpPort') ?? 465),
        secure: formData.get('smtpSecure') === 'on',
        user: formData.get('smtpUser')?.trim() ?? '',
        pass: formData.get('smtpPass')?.toString() ?? '',
        from: formData.get('emailFrom')?.trim() || 'Pantry Pilot you@gmail.com',
        to: formData.get('emailTo')?.trim() || 'you@gmail.com'
      }
    }
  });
}

function validateConfig(cfg) {
  const missing = [];
  if (!cfg.inventory.spreadsheetId) missing.push('Google Spreadsheet ID');
  if (!cfg.secrets.google.clientEmail) missing.push('Google Client Email');
  if (!cfg.secrets.google.privateKey) missing.push('Google Private Key');
  return missing;
}

function isConfigComplete(cfg) {
  return validateConfig(cfg).length === 0;
}

function handleNavSelection(view, { initial = false, silent = false } = {}) {
  if (!view) return;
  if (view === activeView && !initial) return;

  if (view === 'settings') {
    showView('settings');
    updateNavState();
    return;
  }

  if (!isConfigComplete(config)) {
    setStatus('Complete your settings before accessing other sections.', 'error');
    showView('settings');
    return;
  }

  if (!state.header.length) {
    showView(view);
    loadInventory({ silent }).then(success => {
      if (!success) showView('settings');
    });
  } else {
    showView(view);
  }
}

function showView(view) {
  if (!views?.[view]) return;
  Object.entries(views).forEach(([name, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', name !== view);
  });
  navItems?.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  segmentedButtons?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  updateToolbar(view);
  activeView = view;
}

function updateToolbar(view) {
  if (!toolbarTitle || !toolbarSubtitle) return;
  switch (view) {
    case 'summary':
      toolbarTitle.textContent = 'Summary';
      toolbarSubtitle.textContent = 'High-level snapshot of your pantry.';
      break;
    case 'inventory':
      toolbarTitle.textContent = 'Inventory';
      toolbarSubtitle.textContent = 'Inspect and edit your stock levels.';
      break;
    case 'settings':
    default:
      toolbarTitle.textContent = 'Settings';
      toolbarSubtitle.textContent = 'Connect Google Sheets and email notifications.';
      break;
  }
}

function updateNavState() {
  if (!navItems) return;
  const hasConfig = isConfigComplete(config);
  navItems.forEach(item => {
    const view = item.dataset.view;
    if (view === 'settings') {
      item.disabled = false;
      item.classList.remove('disabled');
      return;
    }
    const disabled = !hasConfig;
    item.disabled = disabled;
    item.classList.toggle('disabled', disabled);
  });
  segmentedButtons?.forEach(btn => {
    const view = btn.dataset.view;
    if (view === 'settings') {
      btn.disabled = false;
      btn.classList.remove('disabled');
      return;
    }
    const disabled = !hasConfig;
    btn.disabled = disabled;
    if (disabled) btn.classList.add('disabled');
    else btn.classList.remove('disabled');
  });
}

function loadInventory({ silent = false } = {}) {
  if (loadPromise) return loadPromise;
  const errors = validateConfig(config);
  if (errors.length) {
    setStatus(`Add required settings: ${errors.join(', ')}`, 'error');
    showView('settings');
    return Promise.resolve(false);
  }
  if (!silent) setStatus('Loading inventory…', 'info');
  loadPromise = (async () => {
    try {
      const response = await fetch('/api/inventory/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildRequestPayload(config))
      });
      if (!response.ok) {
        const err = await parseError(response);
        throw new Error(err);
      }
      const data = await response.json();
      state.header = data.header ?? [];
      state.rows = (data.rows ?? []).map(row => Array.from({ length: state.header.length }, (_, i) => row?.[i] ?? ''));
      state.computed = data.computed ?? [];
      state.summary = data.summary ?? null;
      renderInventory();
      renderSummary();
      updateControls();
      if (!silent) setStatus('Inventory loaded.', 'success');
      if (activeView === 'settings') showView('inventory');
      return true;
    } catch (error) {
      console.error(error);
      setStatus(`Failed to load inventory: ${error.message}`, 'error');
      showView('settings');
      return false;
    } finally {
      loadPromise = null;
      updateNavState();
    }
  })();
  return loadPromise;
}

async function saveInventory() {
  const errors = validateConfig(config);
  if (errors.length) {
    setStatus(`Add required settings: ${errors.join(', ')}`, 'error');
    return;
  }
  const tableData = collectTableData();
  if (!tableData || !tableData.header.length) {
    setStatus('Nothing to save. Load the sheet first.', 'error');
    return;
  }
  setStatus('Saving changes…', 'info');
  try {
    const response = await fetch('/api/inventory/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRequestPayload(config, tableData))
    });
    if (!response.ok) {
      const err = await parseError(response);
      throw new Error(err);
    }
    const refreshed = await loadInventory({ silent: true });
    if (refreshed) {
      setStatus('Inventory saved and refreshed.', 'success');
    }
  } catch (error) {
    console.error(error);
    setStatus(`Failed to save: ${error.message}`, 'error');
  }
}

function buildRequestPayload(cfg, extras = {}) {
  return {
    inventory: {
      spreadsheetId: cfg.inventory.spreadsheetId,
      sheetName: cfg.inventory.sheetName
    },
    secrets: {
      google: {
        clientEmail: cfg.secrets.google.clientEmail,
        privateKey: cfg.secrets.google.privateKey
      },
      smtp: {
        host: cfg.secrets.smtp.host,
        port: cfg.secrets.smtp.port,
        secure: cfg.secrets.smtp.secure,
        user: cfg.secrets.smtp.user,
        pass: cfg.secrets.smtp.pass,
        from: cfg.secrets.smtp.from,
        to: cfg.secrets.smtp.to
      }
    },
    options: {
      dryRun: true
    },
    ...extras
  };
}

function collectTableData() {
  const table = document.getElementById('inventory-table');
  if (!table) return null;
  const headerCells = Array.from(table.querySelectorAll('thead th[data-col]'));
  const header = headerCells.map(cell => cell.textContent.trim());
  const rowElements = Array.from(table.querySelectorAll('tbody tr'));
  const rows = rowElements.map(rowEl =>
    header.map((__, colIndex) => {
      const input = rowEl.querySelector(`input[data-col="${colIndex}"]`);
      return input ? input.value : '';
    })
  );
  return { header, rows };
}

function syncTableToState() {
  const data = collectTableData();
  if (data) {
    state.header = data.header;
    state.rows = data.rows;
  }
}

function renderInventory() {
  const container = document.getElementById('inventory-container');
  container.innerHTML = '';
  if (!state.header.length) {
    container.innerHTML = '<p class="empty-state">No data loaded yet. Use “Go To Inventory” after entering your settings.</p>';
    updateControls();
    return;
  }

  const filterRaw = state.filterText ?? '';
  const filterQuery = filterRaw.trim().toLowerCase();
  const hasFilter = filterQuery.length > 0;
  let visibleCount = 0;

  const table = document.createElement('table');
  table.id = 'inventory-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const indexTh = document.createElement('th');
  indexTh.textContent = '#';
  indexTh.className = 'row-index';
  headerRow.appendChild(indexTh);

  state.header.forEach((label, colIndex) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.contentEditable = 'true';
    th.dataset.col = String(colIndex);
    th.className = 'editable-header';
    th.addEventListener('blur', () => {
      syncTableToState();
    });
    headerRow.appendChild(th);
  });

  const actionsTh = document.createElement('th');
  actionsTh.textContent = 'Actions';
  headerRow.appendChild(actionsTh);

  computedColumns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.className = 'computed';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  state.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rowIndex);
    const insight = state.computed[rowIndex] ?? null;
    if (insight?.valid && insight.needsReplenishment) tr.classList.add('needs-replenishment');
    if (insight && !insight.valid) tr.classList.add('invalid-row');

    const normalizedRow = Array.from({ length: state.header.length }, (_, colIndex) => row?.[colIndex] ?? '');
    const matchesFilter = !hasFilter || normalizedRow.some(value => String(value ?? '').toLowerCase().includes(filterQuery));
    if (!matchesFilter) {
      tr.classList.add('row-hidden');
    } else {
      visibleCount += 1;
      tr.classList.remove('row-hidden');
    }

    const indexTd = document.createElement('td');
    indexTd.textContent = String(rowIndex + 1);
    indexTd.className = 'row-index';
    tr.appendChild(indexTd);

    normalizedRow.forEach((value, colIndex) => {
      const td = document.createElement('td');
      td.className = 'data-cell';
      td.dataset.col = String(colIndex);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.dataset.row = String(rowIndex);
      input.dataset.col = String(colIndex);
      td.appendChild(input);
      tr.appendChild(td);
    });

    const actionTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'secondary';
    deleteBtn.addEventListener('click', () => {
      syncTableToState();
      state.rows.splice(rowIndex, 1);
      state.computed.splice(rowIndex, 1);
      renderInventory();
      setStatus('Row deleted. Save to persist changes.', 'info');
    });
    actionTd.appendChild(deleteBtn);
    tr.appendChild(actionTd);

    computedColumns.forEach(col => {
      const td = document.createElement('td');
      td.className = 'computed';
      td.textContent = col.render(insight);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  const existingMessage = container.querySelector('.filter-empty');
  if (existingMessage) existingMessage.remove();
  if (hasFilter && visibleCount === 0) {
    const message = document.createElement('p');
    message.className = 'empty-state filter-empty';
    const queryLabel = filterRaw.trim() || 'your search';
    message.textContent = `No items match “${queryLabel}”.`;
    container.appendChild(message);
    table.classList.add('filter-hidden');
  } else {
    table.classList.remove('filter-hidden');
  }

  updateControls();
}

function renderSummary() {
  if (!summaryCards) return;
  summaryCards.innerHTML = '';
  if (!state.summary) {
    summaryCards.classList.add('hidden');
    summaryEmpty?.classList.remove('hidden');
    return;
  }
  summaryCards.classList.remove('hidden');
  summaryEmpty?.classList.add('hidden');
  const items = [
    { label: 'Sheet Name', value: state.summary.sheetName ?? config.inventory.sheetName },
    { label: 'Rows', value: state.summary.totalRows ?? 0 },
    { label: 'Valid Products', value: state.summary.validProducts ?? 0 },
    { label: 'Needs Replenishment', value: state.summary.needsReplenishment ?? 0 },
    {
      label: 'Generated At',
      value: state.summary.generatedAt ? new Date(state.summary.generatedAt).toLocaleString() : '—'
    }
  ];
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `<span class="summary-label">${item.label}</span><span class="summary-value">${item.value}</span>`;
    summaryCards.appendChild(card);
  });
}

function updateControls() {
  const hasData = state.header.length > 0;
  document.getElementById('add-row').disabled = !hasData;
  document.getElementById('save-inventory').disabled = !hasData;
  document.getElementById('refresh-insights').disabled = !hasData;
  updateNavState();
}

function setStatus(message, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = message ?? '';
  statusEl.className = `status ${type}`;
}

async function parseError(response) {
  try {
    const data = await response.json();
    return data?.message || response.statusText || 'Unknown error';
  } catch {
    return response.statusText || 'Unknown error';
  }
}
