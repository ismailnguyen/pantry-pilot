const STORAGE_KEY = 'pantryPilotSettings';
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/160x120?text=Item';
const SAVE_DEBOUNCE_MS = 800;

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

const state = {
  header: [],
  rows: [],
  computed: [],
  summary: null,
  filterText: '',
  activeView: 'settings',
  activeProductIndex: null,
  visibleCount: 0
};

let statusEl;
let summaryCards;
let summaryEmpty;
let views;
let navItems;
let segmentedButtons;
let toolbarTitle;
let toolbarSubtitle;
let addRowBtn;
let refreshBtn;
let loadBtn;
let reloadBtn;
let searchInput;
let productModal;
let modalForm;
let modalBody;
let modalTitleEl;
let modalCloseBtn;
let modalCancelBtn;
let modalDeleteBtn;
let loadPromise = null;
let autoSaveTimeoutId = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
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
  addRowBtn = document.getElementById('add-row');
  refreshBtn = document.getElementById('refresh-insights');
  loadBtn = document.getElementById('load-inventory');
  reloadBtn = document.getElementById('reload-data');
  searchInput = document.getElementById('inventory-search');
  productModal = document.getElementById('product-modal');
  modalForm = document.getElementById('product-form');
  modalBody = document.getElementById('product-form-body');
  modalTitleEl = document.getElementById('product-modal-title');
  modalCloseBtn = document.getElementById('modal-close');
  modalCancelBtn = document.getElementById('modal-cancel');
  modalDeleteBtn = document.getElementById('modal-delete');

  const form = document.getElementById('settings-form');

  populateForm(config);
  updateNavState();
  renderSummary();
  renderInventory();

  navItems.forEach(item => {
    item.addEventListener('click', () => handleNavSelection(item.dataset.view));
  });

  segmentedButtons.forEach(btn => {
    btn.addEventListener('click', () => handleNavSelection(btn.dataset.view));
  });


  reloadBtn?.addEventListener('click', () => {
    if (!isConfigComplete(config)) {
      setStatus('Fill in your settings before reloading.', 'error');
      showView('settings');
      return;
    }
    loadInventory().catch(() => {});
  });

  loadBtn?.addEventListener('click', () => handleNavSelection('inventory'));
  refreshBtn?.addEventListener('click', () => {
    if (!state.header.length) {
      setStatus('Load the inventory first to refresh insights.', 'error');
      return;
    }
    loadInventory({ silent: false }).catch(() => {});
  });

  addRowBtn?.addEventListener('click', () => {
    if (!state.header.length) return;
    const newRow = state.header.map(() => '');
    state.rows.push(newRow);
    state.computed.push(null);
    state.filterText = '';
    if (searchInput) searchInput.value = '';
    renderInventory();
    openProductModal(state.rows.length - 1);
    setStatus('New product added. Edit details and they will save automatically.', 'info');
  });

  searchInput?.addEventListener('input', event => {
    state.filterText = event.target.value ?? '';
    renderInventory();
  });

  modalCloseBtn?.addEventListener('click', closeProductModal);
  modalCancelBtn?.addEventListener('click', event => {
    event.preventDefault();
    closeProductModal();
  });
  modalDeleteBtn?.addEventListener('click', handleModalDelete);
  productModal?.addEventListener('click', event => {
    if (event.target === productModal) closeProductModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProductModal();
  });
  modalForm?.addEventListener('input', handleModalInputChange);
  modalForm?.addEventListener('submit', handleModalSubmit);

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

  if (isConfigComplete(config)) {
    handleNavSelection('inventory', { initial: true });
  } else {
    showView('settings');
  }
}

let config = normalizeConfig(loadStoredConfig());

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
  if (view === state.activeView && !initial) return;

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
  state.activeView = view;
  updateToolbar(view);
}

function updateToolbar(view) {
  if (!toolbarTitle || !toolbarSubtitle) return;
  switch (view) {
    case 'summary': {
      toolbarTitle.textContent = 'Summary';
      if (state.summary) {
        toolbarSubtitle.textContent = `${state.summary.needsReplenishment} need attention · ${state.summary.totalRows} rows`;
      } else {
        toolbarSubtitle.textContent = 'High-level snapshot of your pantry.';
      }
      break;
    }
    case 'inventory': {
      toolbarTitle.textContent = 'Inventory';
      const total = state.rows.length;
      const visible = typeof state.visibleCount === 'number' ? state.visibleCount : total;
      if (state.filterText.trim()) {
        toolbarSubtitle.textContent = `${visible}/${total} products match filter.`;
      } else {
        toolbarSubtitle.textContent = `${total} products loaded.`;
      }
      break;
    }
    case 'settings':
    default: {
      toolbarTitle.textContent = 'Settings';
      toolbarSubtitle.textContent = 'Connect Google Sheets and email notifications.';
      break;
    }
  }
}

function updateNavState() {
  const hasConfig = isConfigComplete(config);
  navItems.forEach(item => {
    if (item.dataset.view === 'settings') return;
    item.disabled = !hasConfig;
    item.classList.toggle('disabled', !hasConfig);
  });
  segmentedButtons?.forEach(btn => {
    if (btn.dataset.view === 'settings') return;
    btn.disabled = !hasConfig;
    btn.classList.toggle('disabled', !hasConfig);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestPayload(config))
      });
      if (!response.ok) {
        const err = await parseError(response);
        throw new Error(err);
      }
      const data = await response.json();
      state.header = (data.header ?? []).map(h => h ?? '');
      state.rows = (data.rows ?? []).map(row => Array.from({ length: state.header.length }, (_, i) => row?.[i] ?? ''));
      state.computed = Array.from({ length: state.rows.length }, (_, i) => data.computed?.[i] ?? null);
      state.summary = data.summary ?? null;
      state.filterText = '';
      if (searchInput) searchInput.value = '';
      renderSummary();
      renderInventory();
      if (!silent) setStatus('Inventory loaded.', 'success');
      if (state.activeView === 'settings') showView('inventory');
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
  if (!state.header.length) {
    setStatus('Nothing to save. Load the sheet first.', 'error');
    return;
  }
  setStatus('Saving changes…', 'info');
  try {
    const payload = buildRequestPayload(config, collectTableData());
    const response = await fetch('/api/inventory/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const err = await parseError(response);
      throw new Error(err);
    }
    const refreshed = await loadInventory({ silent: true });
    if (refreshed) setStatus('Inventory saved and refreshed.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(`Failed to save: ${error.message}`, 'error');
  }
}

function scheduleSave() {
  if (!isConfigComplete(config)) return;
  if (!state.header.length) return;
  setStatus('Saving changes…', 'info');
  if (autoSaveTimeoutId) clearTimeout(autoSaveTimeoutId);
  autoSaveTimeoutId = setTimeout(() => {
    autoSaveTimeoutId = null;
    saveInventory().catch(() => {});
  }, SAVE_DEBOUNCE_MS);
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
    options: { dryRun: true },
    ...extras
  };
}

function collectTableData() {
  return {
    header: state.header.slice(),
    rows: state.rows.map(row => row.slice())
  };
}

function renderInventory() {
  const container = document.getElementById('inventory-container');
  if (!container) return;
  container.innerHTML = '';

  if (!state.header.length) {
    container.innerHTML = '<p class="empty-state">No data loaded yet. Use “Go To Inventory” after entering your settings.</p>';
    state.visibleCount = 0;
    updateControls();
    return;
  }

  normalizeComputedLength();

  const filterRaw = state.filterText ?? '';
  const filterQuery = filterRaw.trim().toLowerCase();
  const hasFilter = filterQuery.length > 0;
  let visibleCount = 0;

  const grid = document.createElement('div');
  grid.className = 'product-grid';

  state.rows.forEach((row, rowIndex) => {
    const product = rowToObject(row);
    const insight = state.computed[rowIndex] ?? null;
    const matchesFilter = !hasFilter || Object.values(product.__raw).some(value => String(value ?? '').toLowerCase().includes(filterQuery));
    if (!matchesFilter) return;

    visibleCount += 1;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'product-card';
    card.dataset.index = String(rowIndex);

    if (insight?.needsReplenishment) card.classList.add('needs');

    const name = escapeHtml(getFieldValue(product, ['name', 'product_name', 'item'] ) || 'Unnamed item');
    const brand = escapeHtml(getFieldValue(product, ['brand', 'vendor']) || '—');
    const qty = escapeHtml(getFieldValue(product, ['qty_remaining', 'quantity', 'stock']) || '—');
    const imageSrc = escapeAttribute(getFieldValue(product, ['image', 'image_url', 'photo']) || PLACEHOLDER_IMAGE);
    const statusClass = insight?.needsReplenishment ? 'status-alert' : 'status-ok';
    const statusText = insight?.needsReplenishment ? 'Needs attention' : 'Stock OK';
    const nextDate = escapeHtml(insight?.replenishByDate || '—');

    card.innerHTML = `
      <div class="product-thumb"><img src="${imageSrc}" alt="${name}" /></div>
      <div class="product-info">
        <h3 class="product-title">${name}</h3>
        <p class="product-subtitle">${brand}</p>
        <div class="product-meta">
          <span class="badge">Qty: ${qty}</span>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>
        <p class="product-next">Next check: ${nextDate}</p>
      </div>
    `;

    card.addEventListener('click', () => openProductModal(rowIndex));
    grid.appendChild(card);
  });

  state.visibleCount = visibleCount;

  if (visibleCount === 0) {
    if (hasFilter) {
      const msg = document.createElement('p');
      const queryLabel = escapeHtml(filterRaw.trim() || 'your search');
      msg.className = 'empty-state filter-empty';
      msg.innerHTML = `No items match “${queryLabel}”.`;
      container.appendChild(msg);
    } else {
      container.innerHTML = '<p class="empty-state">No rows available.</p>';
    }
  } else {
    container.appendChild(grid);
  }

  updateControls();
  if (state.activeView === 'inventory') updateToolbar('inventory');
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
    { label: 'Rows', value: state.summary.totalRows ?? state.rows.length },
    { label: 'Valid Products', value: state.summary.validProducts ?? state.rows.length },
    { label: 'Needs Replenishment', value: state.summary.needsReplenishment ?? 0 },
    { label: 'Generated At', value: state.summary.generatedAt ? new Date(state.summary.generatedAt).toLocaleString() : '—' }
  ];
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `<span class="summary-label">${escapeHtml(item.label)}</span><span class="summary-value">${escapeHtml(item.value)}</span>`;
    summaryCards.appendChild(card);
  });
  if (state.activeView === 'summary') updateToolbar('summary');
}

function updateControls() {
  const hasData = state.header.length > 0;
  addRowBtn && (addRowBtn.disabled = !hasData);
  refreshBtn && (refreshBtn.disabled = !hasData);
  updateNavState();
}

function openProductModal(index) {
  if (!productModal || !modalBody || index == null || !state.rows[index]) return;
  state.activeProductIndex = index;
  const product = rowToObject(state.rows[index]);
  modalBody.innerHTML = '';

  const modalTitle = modalTitleEl;
  if (modalTitle) {
    const displayName = getFieldValue(product, ['name', 'product_name', 'item']) || `Product #${index + 1}`;
    modalTitle.textContent = displayName || 'Product Details';
  }
  const allowDelete = state.rows.length > 0;
  if (modalDeleteBtn) modalDeleteBtn.disabled = !allowDelete;

  state.header.forEach((header, fieldIndex) => {
    const fieldId = `modal-field-${fieldIndex}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'modal-field';
    wrapper.setAttribute('for', fieldId);

    const title = document.createElement('span');
    title.textContent = formatHeaderLabel(header);
    wrapper.appendChild(title);

    const value = product.__raw[header] ?? '';
    const isLong = /note|description|reason|key|details/i.test(header);
    const input = isLong ? document.createElement('textarea') : document.createElement('input');
    input.id = fieldId;
    input.name = String(fieldIndex);
    input.value = value;
    wrapper.appendChild(input);
    modalBody.appendChild(wrapper);
  });

  document.body.classList.add('modal-open');
  productModal.classList.remove('hidden');
  modalForm?.querySelector('input, textarea')?.focus();
}

function closeProductModal() {
  if (!productModal) return;
  productModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  state.activeProductIndex = null;
  renderInventory();
  renderSummary();
}

function handleModalSubmit(event) {
  event.preventDefault();
  if (state.activeProductIndex == null) {
    closeProductModal();
    return;
  }
  const formData = new FormData(modalForm);
  const updatedRow = state.header.map((_, idx) => formData.get(String(idx))?.toString() ?? '');
  state.rows[state.activeProductIndex] = updatedRow;
  closeProductModal();
  scheduleSave();
}

function handleModalDelete(event) {
  event.preventDefault();
  if (state.activeProductIndex == null) {
    closeProductModal();
    return;
  }
  state.rows.splice(state.activeProductIndex, 1);
  state.computed.splice(state.activeProductIndex, 1);
  closeProductModal();
  scheduleSave();
}

function handleModalInputChange(event) {
  if (state.activeProductIndex == null) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const idx = Number(target.name);
  if (!Number.isFinite(idx)) return;
  if (!state.rows[state.activeProductIndex]) return;
  state.rows[state.activeProductIndex][idx] = target.value;
  scheduleSave();
}

function normalizeComputedLength() {
  if (state.computed.length < state.rows.length) {
    state.computed = state.computed.concat(Array(state.rows.length - state.computed.length).fill(null));
  } else if (state.computed.length > state.rows.length) {
    state.computed.length = state.rows.length;
  }
}

function rowToObject(row) {
  const raw = {};
  const normalized = {};
  state.header.forEach((header, idx) => {
    const value = row?.[idx] ?? '';
    raw[header] = value;
    const key = headerKey(header);
    if (key) normalized[key] = value;
  });
  return { __raw: raw, ...normalized };
}

function headerKey(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function getFieldValue(product, candidates) {
  for (const candidate of candidates) {
    const key = headerKey(candidate);
    if (key && product[key] != null && product[key] !== '') {
      return product[key];
    }
  }
  return '';
}

function formatHeaderLabel(header) {
  return headerKey(header)
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
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
