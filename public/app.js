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
  activeView: 'summary',
  activeProductIndex: null,
  visibleCount: 0
};

let statusEl;
let summaryCards;
let summaryEmpty;
let summaryDashboard;
let views;
let navItems;
let toolbarTitle;
let toolbarSubtitle;
let searchWrapper;
let searchInput;
let refreshBtn;
let loadBtn;
let reloadBtn;
let productModal;
let modalForm;
let modalBody;
let modalTitleEl;
let modalCloseBtn;
let modalCancelBtn;
let modalDeleteBtn;
let loadPromise = null;
let autoSaveTimeoutId = null;

let config = normalizeConfig(loadStoredConfig());

document.addEventListener('DOMContentLoaded', init);

function init() {
  statusEl = document.getElementById('status');
  summaryCards = document.getElementById('summary-cards');
  summaryEmpty = document.getElementById('summary-empty');
  summaryDashboard = document.getElementById('summary-dashboard');
  views = {
    summary: document.getElementById('summary-view'),
    inventory: document.getElementById('inventory-view'),
    settings: document.getElementById('settings-view')
  };
  navItems = Array.from(document.querySelectorAll('.nav-item'));
  toolbarTitle = document.getElementById('toolbar-title');
  toolbarSubtitle = document.getElementById('toolbar-subtitle');
  searchWrapper = document.getElementById('inventory-search-wrapper');
  searchInput = document.getElementById('inventory-search');
  refreshBtn = document.getElementById('refresh-insights');
  loadBtn = document.getElementById('load-inventory');
  reloadBtn = document.getElementById('reload-data');
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

  reloadBtn?.addEventListener('click', () => {
    if (!isConfigComplete(config)) {
      setStatus('Fill in your settings before reloading.', 'error');
      showView('settings');
      return;
    }
    loadInventory().catch(() => {});
  });

  refreshBtn?.addEventListener('click', () => {
    if (!state.header.length) {
      setStatus('Load the inventory first to refresh insights.', 'error');
      return;
    }
    loadInventory({ silent: false }).catch(() => {});
  });

  loadBtn?.addEventListener('click', () => handleNavSelection('inventory'));

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
    if (event.key === 'Escape' && !productModal?.classList.contains('hidden')) closeProductModal();
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
      handleNavSelection('summary');
      loadInventory().catch(() => {});
    } else {
      showView('settings');
    }
  });

  if (isConfigComplete(config)) {
    showView('summary');
    loadInventory().catch(() => {});
  } else {
    showView('settings');
  }
}

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

function handleNavSelection(view, { initial = false } = {}) {
  if (!view) return;
  if (view === state.activeView && !initial) return;

  if (view === 'settings') {
    showView('settings');
    return;
  }

  if (!isConfigComplete(config)) {
    setStatus('Complete your settings before accessing other sections.', 'error');
    showView('settings');
    return;
  }

  showView(view);

  if (!state.header.length) {
    loadInventory({ silent: view !== 'inventory' }).catch(() => {});
  }
}

function showView(view) {
  if (!views?.[view]) return;
  Object.entries(views).forEach(([name, element]) => {
    if (!element) return;
    element.classList.toggle('hidden', name !== view);
  });
  state.activeView = view;
  applyNavStyles();

  const showSearch = view === 'inventory';
  if (searchWrapper) {
    searchWrapper.classList.toggle('hidden', !showSearch);
    if (!showSearch && state.filterText) {
      state.filterText = '';
      if (searchInput) searchInput.value = '';
      renderInventory();
    }
  }

  if (view === 'summary') {
    renderSummary();
  } else if (view === 'inventory') {
    renderInventory();
  }
}

function applyNavStyles() {
  navItems?.forEach(item => {
    const active = item.dataset.view === state.activeView;
    item.classList.toggle('nav-item--active', active);
  });
}

function updateToolbar(view) {
  if (!toolbarTitle || !toolbarSubtitle) return;
  switch (view) {
    case 'summary': {
      toolbarTitle.textContent = 'Summary';
      if (state.summary) {
        const needs = state.summary.needsReplenishment ?? 0;
        const total = state.summary.totalRows ?? state.rows.length;
        toolbarSubtitle.textContent = `${needs} items need attention · ${total} rows`;
      } else {
        toolbarSubtitle.textContent = 'High-level snapshot of your pantry.';
      }
      break;
    }
    case 'inventory': {
      toolbarTitle.textContent = 'Inventory';
      const total = state.rows.length;
      const visible = typeof state.visibleCount === 'number' ? state.visibleCount : total;
      toolbarSubtitle.textContent = state.filterText.trim()
        ? `${visible}/${total} products match your filter.`
        : `${total} products loaded.`;
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
    item.classList.toggle('nav-item--disabled', !hasConfig);
    item.disabled = !hasConfig;
  });
  applyNavStyles();
}

function loadInventory({ silent = false } = {}) {
  if (loadPromise) return loadPromise;
  const errors = validateConfig(config);
  if (errors.length) {
    setStatus(`Add required settings: ${errors.join(', ')}`, 'error');
    showView('settings');
    return Promise.resolve(false);
  }
  if (!silent) setStatus('Syncing inventory…', 'info');
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
      if (!silent) setStatus('Inventory synced.', 'success');
      return true;
    } catch (error) {
      console.error(error);
      setStatus(`Failed to load inventory: ${error.message}`, 'error');
      return false;
    } finally {
      loadPromise = null;
      updateNavState();
    }
  })();
  return loadPromise;
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
    if (refreshed) setStatus('Changes saved.', 'success');
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

function renderSummary() {
  if (!summaryCards) return;
  summaryCards.innerHTML = '';
  summaryDashboard?.classList.add('hidden');
  summaryDashboard && (summaryDashboard.innerHTML = '');

  if (!state.summary) {
    summaryEmpty?.classList.remove('hidden');
    updateToolbar('summary');
    return;
  }

  summaryEmpty?.classList.add('hidden');

  const summaryItems = [
    {
      label: 'Total Products',
      value: state.rows.length
    },
    {
      label: 'Needs Replenishment',
      value: state.summary.needsReplenishment ?? 0
    },
    {
      label: 'Last Sync',
      value: formatDateDisplay(state.summary.generatedAt)
    },
    {
      label: 'Sheet Name',
      value: state.summary.sheetName ?? config.inventory.sheetName
    }
  ];

  summaryItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <span class="summary-card__label">${escapeHtml(item.label)}</span>
      <span class="summary-card__value">${escapeHtml(item.value)}</span>
    `;
    summaryCards.appendChild(card);
  });

  if (summaryDashboard) {
    summaryDashboard.classList.remove('hidden');
    const upcomingCard = document.createElement('div');
    upcomingCard.className = 'dashboard-card';
    upcomingCard.innerHTML = `
      <div class="dashboard-card__heading">
        <div>
          <h3 class="dashboard-card__title">Upcoming Replenishments</h3>
          <p class="dashboard-card__subtitle">Next items that should be reviewed.</p>
        </div>
      </div>
    `;
    const upcomingList = document.createElement('ul');
    upcomingList.className = 'dashboard-list';

    const upcomingItems = state.rows
      .map((row, index) => ({
        index,
        product: rowToObject(row),
        insight: state.computed[index] ?? null
      }))
      .filter(entry => entry.insight?.needsReplenishment)
      .map(entry => ({
        ...entry,
        date: entry.insight?.replenishByDate ? new Date(entry.insight.replenishByDate) : null
      }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date - b.date;
      })
      .slice(0, 5);

    if (upcomingItems.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'dashboard-empty';
      empty.textContent = 'All items are currently within safe levels.';
      upcomingList.appendChild(empty);
    } else {
      upcomingItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'dashboard-list-item';
        const name = escapeHtml(getFieldValue(item.product, ['name', 'product_name', 'item']) || 'Unnamed item');
        const brand = escapeHtml(getFieldValue(item.product, ['brand']) || '—');
        li.innerHTML = `
          <div class="dashboard-list-item__info">
            <span class="dashboard-list-item__title">${name}</span>
            <span class="dashboard-list-item__subtitle">${brand}</span>
          </div>
          <span class="dashboard-list-item__meta">${formatDateDisplay(item.insight?.replenishByDate)}</span>
        `;
        li.addEventListener('click', () => openProductModal(item.index));
        upcomingList.appendChild(li);
      });
    }

    upcomingCard.appendChild(upcomingList);

    const policyCard = document.createElement('div');
    policyCard.className = 'dashboard-card';
    policyCard.innerHTML = `
      <h3 class="dashboard-card__title">Policy Snapshot</h3>
      <div class="dashboard-grid">
        <div class="dashboard-grid__row"><span>Review horizon</span><span>${escapeHtml(state.summary.policy?.reviewHorizonDays ?? '--')} days</span></div>
        <div class="dashboard-grid__row"><span>Target window</span><span>${escapeHtml(state.summary.policy?.targetWindowDays ?? '--')} days</span></div>
        <div class="dashboard-grid__row"><span>Dry run mode</span><span>${state.summary.policy?.dryRun ? 'Enabled' : 'Disabled'}</span></div>
      </div>
    `;

    const activityCard = document.createElement('div');
    activityCard.className = 'dashboard-card';
    activityCard.innerHTML = `
      <h3 class="dashboard-card__title">Quick Insights</h3>
      <ul class="dashboard-list">
        <li class="dashboard-list-item"><span>Total rows</span><span class="dashboard-list-item__meta">${state.rows.length}</span></li>
        <li class="dashboard-list-item"><span>Needs replenishment</span><span class="dashboard-list-item__meta">${state.summary.needsReplenishment ?? 0}</span></li>
        <li class="dashboard-list-item"><span>Last sync</span><span class="dashboard-list-item__meta">${formatDateDisplay(state.summary.generatedAt)}</span></li>
      </ul>
    `;

    summaryDashboard.appendChild(upcomingCard);
    summaryDashboard.appendChild(policyCard);
    summaryDashboard.appendChild(activityCard);
  }

  if (state.activeView === 'summary') updateToolbar('summary');
}

function renderInventory() {
  const container = document.getElementById('inventory-container');
  if (!container) return;
  container.innerHTML = '';

  if (!state.header.length) {
    container.innerHTML = '<p class="text-sm text-slate-500">Load your inventory to start editing.</p>';
    state.visibleCount = 0;
    updateToolbar('inventory');
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
    const matchesFilter =
      !hasFilter || Object.values(product.__raw).some(value => String(value ?? '').toLowerCase().includes(filterQuery));
    if (!matchesFilter) return;

    visibleCount += 1;
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.index = String(rowIndex);
    card.className = 'product-card';
    if (insight?.needsReplenishment) card.classList.add('product-card--alert');

    const name = escapeHtml(getFieldValue(product, ['name', 'product_name', 'item']) || 'Unnamed item');
    const brand = escapeHtml(getFieldValue(product, ['brand']) || '—');
    const qty = escapeHtml(getFieldValue(product, ['qty_remaining', 'quantity', 'stock']) || '—');
    const imageSrc = escapeAttribute(getFieldValue(product, ['image', 'image_url', 'photo']) || PLACEHOLDER_IMAGE);
    const statusClass = insight?.needsReplenishment ? 'status-pill status-pill--alert' : 'status-pill status-pill--ok';
    const statusText = insight?.needsReplenishment ? 'Needs attention' : 'Stock OK';
    const nextDate = formatDateDisplay(insight?.replenishByDate);

    card.innerHTML = `
      <div class="product-card__thumb"><img src="${imageSrc}" alt="${name}" /></div>
      <div class="product-card__info">
        <div>
          <h3 class="product-card__title">${name}</h3>
          <p class="product-card__subtitle">${brand}</p>
        </div>
        <div class="product-card__meta">
          <span class="badge">Qty: ${qty}</span>
          <span class="${statusClass}">${statusText}</span>
        </div>
        <p class="product-card__next">Next check: <strong>${nextDate}</strong></p>
      </div>
    `;

    card.addEventListener('click', () => openProductModal(rowIndex));
    grid.appendChild(card);
  });

  const addCard = createAddCard();
  grid.appendChild(addCard);

  if (visibleCount === 0 && hasFilter) {
    const msg = document.createElement('p');
    const queryLabel = escapeHtml(filterRaw.trim() || 'your search');
    msg.className = 'text-sm text-slate-500';
    msg.textContent = `No items match “${queryLabel}”. Use the card below to add a new product.`;
    container.appendChild(msg);
  }

  container.appendChild(grid);
  state.visibleCount = visibleCount;

  if (state.activeView === 'inventory') updateToolbar('inventory');
}

function createAddCard() {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'product-card product-card--add';
  card.innerHTML = `
    <div class="product-card__add-icon">+</div>
    <p class="product-card__add-title">Add a new product</p>
    <p class="product-card__add-subtitle">Create a blank row and edit its details.</p>
  `;
  card.addEventListener('click', () => {
    const newIndex = addNewProductRow();
    if (newIndex == null) return;
    renderInventory();
    openProductModal(newIndex);
    setStatus('New product added. Saving changes…', 'info');
  });
  return card;
}

function addNewProductRow() {
  if (!state.header.length) return null;
  const newRow = state.header.map(() => '');
  state.rows.push(newRow);
  state.computed.push(null);
  scheduleSave();
  return state.rows.length - 1;
}

function openProductModal(index) {
  if (!productModal || !modalBody || index == null || !state.rows[index]) return;
  state.activeProductIndex = index;
  const product = rowToObject(state.rows[index]);
  modalBody.innerHTML = '';

  if (modalTitleEl) {
    const displayName = getFieldValue(product, ['name', 'product_name', 'item']) || `Product #${index + 1}`;
    modalTitleEl.textContent = displayName || 'Product Details';
  }
  const canDelete = state.rows.length > 0;
  if (modalDeleteBtn) modalDeleteBtn.disabled = !canDelete;

  state.header.forEach((header, fieldIndex) => {
    const fieldId = `modal-field-${fieldIndex}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'modal-field flex flex-col gap-1 text-sm text-slate-600';
    wrapper.setAttribute('for', fieldId);

    const title = document.createElement('span');
    title.className = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
    title.textContent = formatHeaderLabel(header);
    wrapper.appendChild(title);

    const value = product.__raw[header] ?? '';
    const isLong = /note|description|reason|key|details/i.test(header);
    const input = isLong ? document.createElement('textarea') : document.createElement('input');
    input.id = fieldId;
    input.name = String(fieldIndex);
    input.value = value;
    input.className =
      'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200';
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
  scheduleSave();
  closeProductModal();
}

function handleModalDelete(event) {
  event.preventDefault();
  if (state.activeProductIndex == null) {
    closeProductModal();
    return;
  }
  state.rows.splice(state.activeProductIndex, 1);
  state.computed.splice(state.activeProductIndex, 1);
  scheduleSave();
  closeProductModal();
  setStatus('Product removed. Saving changes…', 'info');
}

function handleModalInputChange(event) {
  if (state.activeProductIndex == null) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const fieldIndex = Number(target.name);
  if (!Number.isFinite(fieldIndex)) return;
  if (!state.rows[state.activeProductIndex]) return;
  state.rows[state.activeProductIndex][fieldIndex] = target.value;
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

function getFieldValue(product, keys) {
  for (const key of keys) {
    const normalized = headerKey(key);
    if (normalized && product[normalized] != null && product[normalized] !== '') {
      return product[normalized];
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

function formatDateDisplay(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
  const key = message ? type : 'info';
  statusEl.textContent = message ? String(message) : '';
  statusEl.className = `status status--${key}`;
}

async function parseError(response) {
  try {
    const data = await response.json();
    return data?.message || response.statusText || 'Unknown error';
  } catch {
    return response.statusText || 'Unknown error';
  }
}
