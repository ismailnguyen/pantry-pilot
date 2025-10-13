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
    },
    openai: {
      apiKey: ''
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
  visibleCount: 0,
  aiSuggestions: [],
  aiLoading: false,
  aiError: null,
  aiGeneratedAt: null
};

const MODAL_FIELD_GROUPS = [
  {
    key: 'identity',
    title: 'Identity',
    description: 'Basic descriptors that help you recognise this product.',
    matchers: [
      'id',
      'name',
      'brand',
      'unit',
      'category',
      'sku',
      'image',
      'image_url',
      'photo'
    ]
  },
  {
    key: 'inventory',
    title: 'Inventory & Usage',
    description: 'Quantities, consumption rates, and replenishment history.',
    matchers: [
      'qty_remaining',
      'quantity',
      'stock',
      'avg_daily_consumption',
      'avg_monthly_consumption',
      'last_replenished_at'
    ]
  },
  {
    key: 'planning',
    title: 'Planning Parameters',
    description: 'Lead times, buffers, and ordering constraints.',
    matchers: ['lead_time_days', 'safety_stock_days', 'min_order_qty', 'pack_size']
  },
  {
    key: 'buying',
    title: 'Buying Details',
    description: 'Quick links and preferred vendors for reordering.',
    matchers: ['buy_place', 'buy_url', 'supplier', 'cost', 'price']
  },
  {
    key: 'automation',
    title: 'Automation',
    description: 'Subscription or automation context.',
    matchers: ['auto_subscription', 'auto_subscription_note']
  },
  {
    key: 'computed',
    title: 'Policy Output',
    description: 'Derived fields updated by Pantry Pilot.',
    matchers: ['needs_replenishment', 'replenish_by_date', 'recommended_order_qty', 'reason', 'last_check_at']
  },
  {
    key: 'notes',
    title: 'Notes',
    description: 'Free-form notes and commentary.',
    matchers: ['notes', 'note', 'comment', 'comments']
  },
  {
    key: 'other',
    title: 'Other Columns',
    description: 'Additional sheet columns not categorised above.',
    matchers: []
  }
];

const MODAL_FIELD_CONFIG = {
  id: { component: 'text', placeholder: 'e.g. abc-001', autoCapitalize: false },
  name: { component: 'text', placeholder: 'Product name' },
  brand: { component: 'text', placeholder: 'Brand or manufacturer' },
  unit: { component: 'select', options: ['', 'count', 'ml', 'g', 'kg', 'l'] },
  qty_remaining: { component: 'number', min: 0, step: 'any' },
  quantity: { component: 'number', min: 0, step: 'any' },
  stock: { component: 'number', min: 0, step: 'any' },
  avg_daily_consumption: { component: 'number', min: 0, step: 'any', hint: 'Average daily usage in the base unit.' },
  avg_monthly_consumption: {
    component: 'number',
    min: 0,
    step: 'any',
    hint: 'Average monthly usage. Used if daily consumption is blank.'
  },
  last_replenished_at: { component: 'date' },
  auto_subscription: {
    component: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'TRUE', label: 'Active' },
      { value: 'FALSE', label: 'Inactive' }
    ]
  },
  auto_subscription_note: { component: 'textarea', rows: 2, fullWidth: true },
  buy_place: { component: 'text', placeholder: 'Amazon, Costco…' },
  supplier: { component: 'text' },
  cost: { component: 'number', min: 0, step: '0.01' },
  price: { component: 'number', min: 0, step: '0.01' },
  buy_url: { component: 'url', placeholder: 'https://…', fullWidth: true },
  lead_time_days: { component: 'number', min: 0, step: 1 },
  safety_stock_days: { component: 'number', min: 0, step: 1 },
  min_order_qty: { component: 'number', min: 0, step: 1 },
  pack_size: { component: 'number', min: 0, step: 1 },
  notes: { component: 'textarea', rows: 3, fullWidth: true },
  note: { component: 'textarea', rows: 3, fullWidth: true },
  comment: { component: 'textarea', rows: 3, fullWidth: true },
  comments: { component: 'textarea', rows: 3, fullWidth: true },
  needs_replenishment: {
    component: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'TRUE', label: 'Needs replenishment' },
      { value: 'FALSE', label: 'Stock OK' }
    ],
    badge: 'computed'
  },
  replenish_by_date: { component: 'date', badge: 'computed' },
  recommended_order_qty: { component: 'number', min: 0, step: 'any', badge: 'computed' },
  reason: { component: 'text', placeholder: 'Reason code', badge: 'computed' },
  last_check_at: { component: 'datetime', badge: 'computed' },
  image: { component: 'url', placeholder: 'Image URL' },
  image_url: { component: 'url', placeholder: 'Image URL' },
  photo: { component: 'url', placeholder: 'Image URL' }
};

let statusEl;
let summaryCards;
let summaryEmpty;
let summaryDashboard;
let summaryAiActions;
let summaryAiResults;
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
  summaryAiActions = document.getElementById('summary-ai-actions');
  summaryAiResults = document.getElementById('summary-ai-results');
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
      },
      openai: {
        apiKey: raw?.secrets?.openai?.apiKey ?? ''
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
  if (form.elements.openaiApiKey) {
    form.elements.openaiApiKey.value = cfg.secrets.openai.apiKey;
  }
}

function gatherConfigFromForm(form) {
  const formData = new FormData(form);
  const rawOpenAiKey = formData.get('openaiApiKey');
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
      },
      openai: {
        apiKey: rawOpenAiKey ? rawOpenAiKey.toString().trim() : ''
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
      state.aiSuggestions = [];
      state.aiError = null;
      state.aiGeneratedAt = null;
      state.aiLoading = false;
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
      },
      openai: {
        apiKey: cfg.secrets.openai.apiKey
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
  const hasSummary = Boolean(state.summary);
  summaryCards.innerHTML = '';
  summaryDashboard?.classList.add('hidden');
  summaryDashboard && (summaryDashboard.innerHTML = '');
  if (summaryAiActions) {
    summaryAiActions.innerHTML = '';
  }

  renderSummaryAiActions({ hasSummary });
  renderSummaryAiResults();

  if (!hasSummary) {
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

function renderSummaryAiActions({ hasSummary }) {
  if (!summaryAiActions) return;
  summaryAiActions.innerHTML = '';
  const isLoading = state.aiLoading;
  const actions = [
    {
      key: 'ai-find-alternatives',
      title: 'Find alternative products',
      description:
        'Use OpenAI Deep Search to surface substitute items with better pricing, availability, or quality signals.',
      cta: 'Find alternatives',
      handler: handleFindAlternativeProducts,
      requiresSummary: true,
      requiresApiKey: true
    }
  ];

  if (actions.length === 0) {
    summaryAiActions.classList.add('hidden');
    return;
  }

  const hasKey = hasOpenAiKey();

  actions.forEach(action => {
    const card = document.createElement('article');
    card.className = 'summary-ai-card';

    const title = document.createElement('h3');
    title.className = 'summary-ai-card__title';
    title.textContent = action.title;
    card.appendChild(title);

    const description = document.createElement('p');
    description.className = 'summary-ai-card__description';
    description.textContent = action.description;
    card.appendChild(description);

    const footer = document.createElement('div');
    footer.className = 'summary-ai-card__footer';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--primary';
    button.textContent = action.cta;

    const hints = [];
    let disabled = false;
    if (action.requiresSummary && !hasSummary) {
      hints.push('Load your inventory to enable this action.');
      disabled = true;
    }
    if (action.requiresApiKey && !hasKey) {
      hints.push('Add your OpenAI API key in Settings to enable.');
      disabled = true;
    }
    if (isLoading) {
      hints.push('Working on alternatives…');
      button.textContent = 'Finding alternatives…';
      disabled = true;
    }
    if (disabled) {
      button.disabled = true;
      card.classList.add('summary-ai-card--disabled');
    } else {
      button.addEventListener('click', action.handler);
    }
    footer.appendChild(button);

    if (hints.length > 0) {
      const hint = document.createElement('span');
      hint.className = 'summary-ai-card__hint';
      hint.textContent = hints.join(' ');
      footer.appendChild(hint);
    }

    if (state.aiGeneratedAt) {
      const meta = document.createElement('span');
      meta.className = 'summary-ai-card__hint';
      meta.textContent = `Last run: ${formatDateTime(state.aiGeneratedAt)}`;
      footer.appendChild(meta);
    }

    card.appendChild(footer);
    summaryAiActions.appendChild(card);
  });

  summaryAiActions.classList.remove('hidden');
}

function renderSummaryAiResults() {
  if (!summaryAiResults) return;
  summaryAiResults.innerHTML = '';

  const isLoading = state.aiLoading;
  const error = state.aiError;
  const suggestions = Array.isArray(state.aiSuggestions) ? state.aiSuggestions : [];
  const hasSuggestions = suggestions.length > 0;

  if (!isLoading && !error && !hasSuggestions) {
    summaryAiResults.classList.add('hidden');
    return;
  }

  summaryAiResults.classList.remove('hidden');

  if (isLoading) {
    const loading = document.createElement('div');
    loading.className = 'summary-ai-results__message summary-ai-results__message--info';
    loading.textContent = 'Finding viable alternatives…';
    summaryAiResults.appendChild(loading);
    return;
  }

  if (error) {
    const errorBox = document.createElement('div');
    errorBox.className = 'summary-ai-results__message summary-ai-results__message--error';
    errorBox.textContent = error;
    summaryAiResults.appendChild(errorBox);
    return;
  }

  if (!hasSuggestions) {
    const empty = document.createElement('div');
    empty.className = 'summary-ai-results__message summary-ai-results__message--muted';
    empty.textContent = state.aiGeneratedAt
      ? 'No pending AI suggestions. Run Find alternative products again for a fresh batch.'
      : 'No AI suggestions yet. Run an action to populate this space.';
    summaryAiResults.appendChild(empty);
    return;
  }

  if (state.aiGeneratedAt) {
    const meta = document.createElement('p');
    meta.className = 'summary-ai-results__meta';
    meta.textContent = `Generated ${formatDateTime(state.aiGeneratedAt)} via OpenAI.`;
    summaryAiResults.appendChild(meta);
  }

  suggestions.forEach(suggestion => {
    const card = document.createElement('article');
    card.className = 'summary-ai-result';
    card.dataset.suggestionId = suggestion.id;

    const header = document.createElement('div');
    header.className = 'summary-ai-result__header';

    const title = document.createElement('h3');
    title.className = 'summary-ai-result__title';
    title.textContent = suggestion.productName || suggestion.productId || 'Product';
    header.appendChild(title);

    if (suggestion.reason || suggestion.context) {
      const subtitle = document.createElement('p');
      subtitle.className = 'summary-ai-result__subtitle';
      subtitle.textContent = suggestion.reason || suggestion.context;
      header.appendChild(subtitle);
    }

    card.appendChild(header);

    const altList = document.createElement('div');
    altList.className = 'summary-ai-alternatives';

    suggestion.alternatives.forEach(alternative => {
      altList.appendChild(createAiAlternativeCard(suggestion, alternative));
    });

    card.appendChild(altList);
    summaryAiResults.appendChild(card);
  });
}

function createAiAlternativeCard(suggestion, alternative) {
  const altCard = document.createElement('div');
  altCard.className = 'summary-ai-alt';
  altCard.dataset.altId = alternative.id;

  const header = document.createElement('div');
  header.className = 'summary-ai-alt__header';

  const title = document.createElement('h4');
  title.className = 'summary-ai-alt__title';
  title.textContent = alternative.name || 'Alternative';
  header.appendChild(title);

  if (typeof alternative.confidence === 'number' && Number.isFinite(alternative.confidence)) {
    const confidence = document.createElement('span');
    confidence.className = 'summary-ai-alt__confidence';
    confidence.textContent = `${Math.round(alternative.confidence * 100)}% match`;
    header.appendChild(confidence);
  }

  altCard.appendChild(header);

  if (alternative.summary) {
    const description = document.createElement('p');
    description.className = 'summary-ai-alt__description';
    description.textContent = alternative.summary;
    altCard.appendChild(description);
  }

  const metaList = document.createElement('ul');
  metaList.className = 'summary-ai-alt__meta';

  if (alternative.vendor) {
    const vendor = document.createElement('li');
    vendor.textContent = `Vendor: ${alternative.vendor}`;
    metaList.appendChild(vendor);
  }

  if (alternative.price) {
    const price = document.createElement('li');
    price.textContent = `Price: ${alternative.price}`;
    metaList.appendChild(price);
  }

  if (metaList.childNodes.length > 0) {
    altCard.appendChild(metaList);
  }

  const actions = document.createElement('div');
  actions.className = 'summary-ai-alt__actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'button button--primary button--sm';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', () => applyAiAlternative(suggestion.id, alternative.id));
  actions.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'button button--ghost button--sm';
  rejectBtn.textContent = 'Reject';
  rejectBtn.addEventListener('click', () => dismissAiAlternative(suggestion.id, alternative.id));
  actions.appendChild(rejectBtn);

  if (alternative.url) {
    const link = document.createElement('a');
    link.href = alternative.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'summary-ai-alt__link';
    link.textContent = 'Open link';
    actions.appendChild(link);
  }

  altCard.appendChild(actions);

  return altCard;
}

async function handleFindAlternativeProducts() {
  if (!hasOpenAiKey()) {
    setStatus('Add your OpenAI API key in Settings to run AI actions.', 'error');
    handleNavSelection('settings');
    return;
  }
  if (!state.summary || state.rows.length === 0) {
    setStatus('Load your inventory first to explore AI alternatives.', 'error');
    return;
  }
  if (state.aiLoading) return;

  state.aiLoading = true;
  state.aiError = null;
  state.aiSuggestions = [];
  state.aiGeneratedAt = null;
  renderSummaryAiActions({ hasSummary: Boolean(state.summary) });
  renderSummaryAiResults();

  const products = buildAiProducts();
  if (!products.length) {
    state.aiLoading = false;
    state.aiError = 'No valid products found to analyse.';
    renderSummaryAiResults();
    renderSummaryAiActions({ hasSummary: Boolean(state.summary) });
    setStatus('No valid products found to analyse.', 'error');
    return;
  }

  try {
    setStatus('Connecting to OpenAI Deep Search…', 'info');
    const payload = buildRequestPayload(config, {
      ai: {
        action: 'find-alternatives',
        summary: state.summary
          ? {
              generatedAt: state.summary.generatedAt,
              needsReplenishment: state.summary.needsReplenishment,
              policy: state.summary.policy ?? null
            }
          : null,
        products
      }
    });
    const response = await fetch('/api/ai/find-alternatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const err = await parseError(response);
      throw new Error(err);
    }
    const data = await response.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    const normalized = suggestions
      .map((suggestion, suggestionIndex) => {
        const alternatives = Array.isArray(suggestion?.alternatives)
          ? suggestion.alternatives
              .filter(alt => alt && alt.name)
              .map((alt, altIndex) => ({
                ...alt,
                id: `${Date.now()}-${suggestionIndex}-${altIndex}`
              }))
          : [];
        return {
          id: `ai-suggestion-${Date.now()}-${suggestionIndex}`,
          productId: suggestion?.productId ?? null,
          productName: suggestion?.productName ?? suggestion?.productId ?? `Product #${suggestionIndex + 1}`,
          reason: suggestion?.reason ?? '',
          context: suggestion?.context ?? '',
          alternatives
        };
      })
      .filter(entry => entry.alternatives.length > 0);

    state.aiSuggestions = normalized;
    state.aiGeneratedAt = data?.generatedAt ?? new Date().toISOString();
    state.aiError = null;

    if (state.aiSuggestions.length === 0) {
      setStatus('OpenAI returned no alternative recommendations.', 'info');
    } else {
      const totalAlternatives = state.aiSuggestions.reduce((count, item) => count + item.alternatives.length, 0);
      setStatus(`AI surfaced ${totalAlternatives} alternative option(s). Review below.`, 'success');
    }
  } catch (error) {
    console.error(error);
    state.aiError = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to retrieve AI suggestions: ${state.aiError}`, 'error');
  } finally {
    state.aiLoading = false;
    renderSummaryAiActions({ hasSummary: Boolean(state.summary) });
    renderSummaryAiResults();
  }
}

function hasOpenAiKey() {
  const key = config?.secrets?.openai?.apiKey;
  return typeof key === 'string' && key.trim().length > 0;
}

function buildAiProducts() {
  if (!state.header.length || !state.rows.length) return [];
  const products = state.rows.map((row, index) => {
    const product = rowToObject(row);
    const insight = state.computed?.[index] ?? null;
    const id = getFieldValue(product, ['id']);
    const name = getFieldValue(product, ['name', 'product_name', 'item']);
    if (!id && !name) return null;
    const qtyRemaining = toNumberOrNull(getFieldValue(product, ['qty_remaining', 'quantity', 'stock']));
    const avgDaily = toNumberOrNull(getFieldValue(product, ['avg_daily_consumption']));
    const avgMonthly = toNumberOrNull(getFieldValue(product, ['avg_monthly_consumption']));
  const explicitReplenishBy = getFieldValue(product, ['replenish_by_date']);
  const computedReplenishBy =
    insight && insight.replenishByDate !== undefined && insight.replenishByDate !== null
      ? insight.replenishByDate
      : null;
  const replenishBy = explicitReplenishBy || computedReplenishBy || null;
    const autoSubscription =
      (getFieldValue(product, ['auto_subscription']) || '').toString().toUpperCase() === 'TRUE';
    const notes = getFieldValue(product, ['notes', 'note', 'comment', 'comments']);
    const buyPlace = getFieldValue(product, ['buy_place', 'supplier']);
    const buyUrl = getFieldValue(product, ['buy_url']);
    return {
      id: id || `row-${index + 1}`,
      productName: name || id || `Row ${index + 1}`,
      brand: getFieldValue(product, ['brand']) || null,
      unit: getFieldValue(product, ['unit']) || null,
      qtyRemaining,
      avgDailyConsumption: avgDaily,
      avgMonthlyConsumption: avgMonthly,
      replenishByDate: replenishBy || null,
      autoSubscriptionActive: autoSubscription,
      needsReplenishment: Boolean(insight?.needsReplenishment),
      reason: insight?.reason ?? null,
      buy: {
        place: buyPlace || null,
        url: buyUrl || null
      },
      notes: notes || null
    };
  });
  const valid = products.filter(Boolean);
  if (!valid.length) return [];
  const prioritized = valid.filter(item => item.needsReplenishment);
  return (prioritized.length ? prioritized : valid).slice(0, 20);
}

function applyAiAlternative(suggestionId, alternativeId) {
  const suggestion = state.aiSuggestions.find(entry => entry.id === suggestionId);
  if (!suggestion) return;
  const alternative = suggestion.alternatives.find(entry => entry.id === alternativeId);
  if (!alternative) return;

  const rowIndex = findRowIndexForProduct(suggestion.productId, suggestion.productName);
  if (rowIndex === -1) {
    setStatus(`Unable to locate ${suggestion.productName} in the inventory grid.`, 'error');
    return;
  }

  const updates = [];
  if (alternative.vendor && updateRowField(rowIndex, 'buy_place', alternative.vendor)) {
    updates.push('preferred vendor');
  }
  if (alternative.url && updateRowField(rowIndex, 'buy_url', alternative.url)) {
    updates.push('purchase link');
  }
  const note = buildAiNote(alternative);
  if (note && updateRowField(rowIndex, 'notes', note, { append: true })) {
    updates.push('notes');
  }

  removeAiAlternative(suggestionId, alternativeId);
  renderSummaryAiActions({ hasSummary: Boolean(state.summary) });
  renderSummaryAiResults();

  const appliedLabel = updates.length ? updates.join(', ') : null;
  if (updates.length) {
    scheduleSave();
    setStatus(`Applied AI recommendation for ${suggestion.productName} (${appliedLabel}). Saving changes…`, 'success');
  } else {
    setStatus(`Recorded AI feedback for ${suggestion.productName}.`, 'info');
  }
}

function dismissAiAlternative(suggestionId, alternativeId) {
  const suggestion = state.aiSuggestions.find(entry => entry.id === suggestionId);
  if (!suggestion) return;
  const alternative = suggestion.alternatives.find(entry => entry.id === alternativeId);
  removeAiAlternative(suggestionId, alternativeId);
  renderSummaryAiActions({ hasSummary: Boolean(state.summary) });
  setStatus(
    `Dismissed ${alternative?.name ?? 'alternative'} for ${suggestion.productName}. You can rerun AI actions anytime.`,
    'info'
  );
}

function removeAiAlternative(suggestionId, alternativeId) {
  state.aiSuggestions = state.aiSuggestions
    .map(entry => {
      if (entry.id !== suggestionId) return entry;
      const remaining = entry.alternatives.filter(alt => alt.id !== alternativeId);
      return { ...entry, alternatives: remaining };
    })
    .filter(entry => entry.alternatives.length > 0);
  renderSummaryAiResults();
}

function findRowIndexForProduct(productId, productName) {
  if (!state.header.length) return -1;
  for (let index = 0; index < state.rows.length; index += 1) {
    const product = rowToObject(state.rows[index]);
    const id = getFieldValue(product, ['id']);
    if (productId && id && id === productId) return index;
  }
  if (productName) {
    const normalizedName = productName.trim().toLowerCase();
    for (let index = 0; index < state.rows.length; index += 1) {
      const product = rowToObject(state.rows[index]);
      const name = getFieldValue(product, ['name', 'product_name', 'item']);
      if (name && name.trim().toLowerCase() === normalizedName) return index;
    }
  }
  return -1;
}

function updateRowField(rowIndex, normalizedKey, value, { append = false } = {}) {
  const targetIndex = state.header.findIndex(header => headerKey(header) === normalizedKey);
  if (targetIndex === -1) return false;
  const nextValue = value == null ? '' : String(value);
  const currentValue = state.rows[rowIndex][targetIndex] ?? '';
  if (append && currentValue) {
    const combined = `${currentValue}`.includes(nextValue) ? currentValue : `${currentValue}\n${nextValue}`.trim();
    state.rows[rowIndex][targetIndex] = combined;
  } else {
    state.rows[rowIndex][targetIndex] = nextValue;
  }
  return true;
}

function buildAiNote(alternative) {
  const lines = [];
  if (alternative.summary) lines.push(alternative.summary);
  const metaParts = [];
  if (alternative.vendor) metaParts.push(`Vendor: ${alternative.vendor}`);
  if (alternative.price) metaParts.push(`Price: ${alternative.price}`);
  if (typeof alternative.confidence === 'number' && Number.isFinite(alternative.confidence)) {
    metaParts.push(`Confidence: ${Math.round(alternative.confidence * 100)}%`);
  }
  if (metaParts.length) lines.push(metaParts.join(' · '));
  if (alternative.url) lines.push(alternative.url);
  return lines.join('\n');
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
  const insight = state.computed?.[index] ?? null;
  modalBody.innerHTML = '';

  if (modalTitleEl) {
    const displayName = getFieldValue(product, ['name', 'product_name', 'item']) || `Product #${index + 1}`;
    modalTitleEl.textContent = displayName || 'Product Details';
  }
  const canDelete = state.rows.length > 0;
  if (modalDeleteBtn) modalDeleteBtn.disabled = !canDelete;

  const overview = buildModalOverview(product, insight);
  if (overview) modalBody.appendChild(overview);

  const sections = buildModalSections({
    headers: state.header,
    product,
    insight
  });
  sections.forEach(section => modalBody.appendChild(section));

  document.body.classList.add('modal-open');
  productModal.classList.remove('hidden');
  modalForm?.querySelector('input, textarea, select')?.focus();
}

function buildModalSections({ headers, product }) {
  if (!headers || headers.length === 0) return [];
  const sectionMap = new Map();

  MODAL_FIELD_GROUPS.forEach(group => {
    sectionMap.set(group.key, createModalSection(group));
  });

  headers.forEach((header, fieldIndex) => {
    if (header == null || header === '') return;
    const normalizedKey = headerKey(header);
    if (!normalizedKey) return;

    const fieldElement = buildModalField({
      header,
      fieldIndex,
      value: product.__raw?.[header] ?? '',
      normalizedKey
    });
    if (!fieldElement) return;

    const groupKey = resolveFieldGroup(normalizedKey);
    const target = sectionMap.get(groupKey) ?? sectionMap.get('other');
    if (!target) return;
    target.grid.appendChild(fieldElement);
  });

  return MODAL_FIELD_GROUPS.map(group => sectionMap.get(group.key))
    .filter(section => section && section.grid.childNodes.length > 0)
    .map(section => {
      if (section.header) section.section.appendChild(section.header);
      section.body.appendChild(section.grid);
      section.section.appendChild(section.body);
      return section.section;
    });
}

function createModalSection(group) {
  const section = document.createElement('section');
  section.className = 'modal-section';
  section.dataset.group = group.key;

  let header = null;
  if (group.title || group.description) {
    header = document.createElement('div');
    header.className = 'modal-section__header';
    if (group.title) {
      const title = document.createElement('h3');
      title.className = 'modal-section__title';
      title.textContent = group.title;
      header.appendChild(title);
    }
    if (group.description) {
      const subtitle = document.createElement('p');
      subtitle.className = 'modal-section__subtitle';
      subtitle.textContent = group.description;
      header.appendChild(subtitle);
    }
  }

  const body = document.createElement('div');
  body.className = 'modal-section__body';

  const grid = document.createElement('div');
  grid.className = 'modal-grid';

  return { section, header, body, grid };
}

function resolveFieldGroup(normalizedKey) {
  if (!normalizedKey) return 'other';
  const config = MODAL_FIELD_CONFIG[normalizedKey];
  if (config?.group) return config.group;
  const match = MODAL_FIELD_GROUPS.find(group => group.matchers.includes(normalizedKey));
  return match ? match.key : 'other';
}

function buildModalField({ header, fieldIndex, value, normalizedKey }) {
  const config = MODAL_FIELD_CONFIG[normalizedKey] ?? {};
  const labelText = config.label ?? formatHeaderLabel(header || normalizedKey);
  const controlId = `modal-field-${fieldIndex}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-field';
  wrapper.dataset.field = normalizedKey;
  if (config.fullWidth) wrapper.classList.add('modal-field--wide');

  const isComputed = resolveFieldGroup(normalizedKey) === 'computed' || config.badge === 'computed';
  if (isComputed) wrapper.classList.add('modal-field--computed');

  const labelRow = document.createElement('div');
  labelRow.className = 'modal-field__label-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'modal-field__label';
  labelEl.setAttribute('for', controlId);
  labelEl.textContent = labelText;
  labelRow.appendChild(labelEl);

  if (isComputed) {
    const badge = document.createElement('span');
    badge.className = 'modal-field__badge';
    badge.textContent = 'Policy output';
    labelRow.appendChild(badge);
  }

  wrapper.appendChild(labelRow);

  const control = createModalControl({
    config,
    value,
    fieldIndex,
    normalizedKey,
    controlId
  });
  if (!control) return null;
  wrapper.appendChild(control);

  if (config.hint) {
    const hint = document.createElement('p');
    hint.className = 'modal-field__hint';
    hint.textContent = config.hint;
    wrapper.appendChild(hint);
  }

  return wrapper;
}

function createModalControl({ config, value, fieldIndex, normalizedKey, controlId }) {
  const component = config.component ?? 'text';
  const initialValue = value == null ? '' : String(value);
  let control;

  switch (component) {
    case 'textarea': {
      control = document.createElement('textarea');
      control.className = 'modal-textarea';
      control.rows = config.rows ?? 3;
      control.value = initialValue;
      break;
    }
    case 'select': {
      control = document.createElement('select');
      control.className = 'modal-select';
      populateSelectOptions(control, config.options, initialValue);
      control.value = initialValue;
      break;
    }
    case 'number': {
      control = document.createElement('input');
      control.type = 'number';
      control.inputMode = 'decimal';
      control.className = 'modal-input';
      if (config.min != null) control.min = String(config.min);
      if (config.max != null) control.max = String(config.max);
      if (config.step != null) control.step = String(config.step);
      control.value = initialValue;
      break;
    }
    case 'date': {
      control = document.createElement('input');
      control.type = 'date';
      control.className = 'modal-input';
      const dateValue = toInputDate(initialValue);
      control.value = dateValue || initialValue;
      break;
    }
    case 'datetime': {
      control = document.createElement('input');
      control.type = 'datetime-local';
      control.className = 'modal-input';
      const dateTimeValue = toInputDateTime(initialValue);
      control.value = dateTimeValue || initialValue;
      break;
    }
    case 'url': {
      control = document.createElement('input');
      control.type = 'url';
      control.className = 'modal-input';
      control.placeholder = config.placeholder ?? '';
      control.value = initialValue;
      break;
    }
    case 'text':
    default: {
      control = document.createElement('input');
      control.type = 'text';
      control.className = 'modal-input';
      control.value = initialValue;
      break;
    }
  }

  if (!control) return null;

  control.id = controlId;
  control.name = String(fieldIndex);
  control.dataset.field = normalizedKey;
  control.autocomplete = 'off';
  if (config.autoCapitalize === false && 'autocapitalize' in control) {
    control.autocapitalize = 'none';
  }
  if (config.spellcheck === false && 'spellcheck' in control) {
    control.spellcheck = false;
  }
  if (config.maxLength != null && 'maxLength' in control) {
    control.maxLength = Number(config.maxLength);
  }
  if (config.placeholder && component !== 'select') control.placeholder = config.placeholder;
  if (config.required) control.required = true;
  if (config.readOnly) control.readOnly = true;

  return control;
}

function populateSelectOptions(select, options, currentValue) {
  const items = Array.isArray(options) ? options : [];
  const seen = new Set();
  if (items.length === 0) {
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '—';
    select.appendChild(blankOption);
    if (currentValue && currentValue !== '') {
      const currentOption = document.createElement('option');
      currentOption.value = currentValue;
      currentOption.textContent = currentValue;
      select.appendChild(currentOption);
    }
    return;
  }

  items.forEach(option => {
    const optionEl = document.createElement('option');
    if (typeof option === 'string') {
      optionEl.value = option;
      optionEl.textContent = option === '' ? '—' : option;
      seen.add(String(optionEl.value));
    } else if (option && typeof option === 'object') {
      const val = option.value ?? '';
      optionEl.value = val;
      optionEl.textContent = option.label ?? (val === '' ? '—' : String(val));
      seen.add(String(optionEl.value));
    }
    select.appendChild(optionEl);
  });

  const normalizedCurrent = currentValue == null ? '' : String(currentValue);
  if (normalizedCurrent && !seen.has(normalizedCurrent)) {
    const currentOption = document.createElement('option');
    currentOption.value = normalizedCurrent;
    currentOption.textContent = normalizedCurrent;
    select.appendChild(currentOption);
  }
}

function buildModalOverview(product, insight) {
  const name = getFieldValue(product, ['name', 'product_name', 'item']) || 'Product Details';
  const brand = getFieldValue(product, ['brand']);
  const unit = getFieldValue(product, ['unit']);
  const qtyRemaining = getFieldValue(product, ['qty_remaining', 'quantity', 'stock']);
  const imageSrc = getFieldValue(product, ['image', 'image_url', 'photo']) || PLACEHOLDER_IMAGE;
  const needsReplenishment =
    insight?.needsReplenishment ??
    (getFieldValue(product, ['needs_replenishment']) || '').toString().toUpperCase() === 'TRUE';
  const recommendation = insight?.recommendedOrderQty ?? getFieldValue(product, ['recommended_order_qty']);
  const replenishBy = insight?.replenishByDate ?? getFieldValue(product, ['replenish_by_date']);
  const daysLeft = insight?.daysUntilDepletion;
  const reason = insight?.reason ?? getFieldValue(product, ['reason']);
  const autoSubscription =
    (getFieldValue(product, ['auto_subscription']) || '').toString().toUpperCase() === 'TRUE';
  const autoSubscriptionNote = getFieldValue(product, ['auto_subscription_note']);
  const buyPlace = getFieldValue(product, ['buy_place', 'supplier']);
  const buyUrl = getFieldValue(product, ['buy_url']);

  const overview = document.createElement('section');
  overview.className = 'product-overview';

  const primary = document.createElement('div');
  primary.className = 'product-overview__primary';

  const thumb = document.createElement('div');
  thumb.className = 'product-overview__thumb';
  const img = document.createElement('img');
  img.src = imageSrc || PLACEHOLDER_IMAGE;
  img.alt = `${name} preview`;
  img.loading = 'lazy';
  thumb.appendChild(img);
  primary.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'product-overview__info';

  const title = document.createElement('h3');
  title.className = 'product-overview__title';
  title.textContent = name;
  info.appendChild(title);

  if (brand) {
    const brandEl = document.createElement('p');
    brandEl.className = 'product-overview__brand';
    brandEl.textContent = brand;
    info.appendChild(brandEl);
  }

  const badgeRow = document.createElement('div');
  badgeRow.className = 'product-overview__badges';

  const statusBadge = document.createElement('span');
  statusBadge.className = needsReplenishment ? 'product-pill product-pill--alert' : 'product-pill product-pill--ok';
  statusBadge.textContent = needsReplenishment ? 'Needs replenishment' : 'Stock healthy';
  badgeRow.appendChild(statusBadge);

  if (autoSubscription) {
    const autoBadge = document.createElement('span');
    autoBadge.className = 'product-pill product-pill--neutral';
    autoBadge.textContent = 'Subscription active';
    badgeRow.appendChild(autoBadge);
  }

  if (buyPlace) {
    const buyBadge = document.createElement('span');
    buyBadge.className = 'product-pill product-pill--soft';
    buyBadge.textContent = `Preferred: ${buyPlace}`;
    badgeRow.appendChild(buyBadge);
  }

  info.appendChild(badgeRow);
  primary.appendChild(info);
  overview.appendChild(primary);

  const formattedQty = formatNumberDisplay(qtyRemaining, { decimals: 2, fallback: '—' });
  const metrics = [
    {
      label: 'Qty remaining',
      value: formattedQty === '—' ? '—' : `${formattedQty}${unit ? ` ${unit}` : ''}`
    },
    {
      label: 'Days left',
      value: formatDaysDisplay(daysLeft)
    },
    {
      label: 'Replenish by',
      value: formatDateDisplay(replenishBy)
    },
    {
      label: 'Recommended order',
      value: formatNumberDisplay(recommendation, { decimals: 0, fallback: '—' })
    }
  ];

  const metricsList = document.createElement('dl');
  metricsList.className = 'product-overview__metrics';
  metrics.forEach(metric => {
    const item = document.createElement('div');
    item.className = 'product-overview__metric';
    const term = document.createElement('dt');
    term.textContent = metric.label;
    const value = document.createElement('dd');
    value.textContent = metric.value;
    item.appendChild(term);
    item.appendChild(value);
    metricsList.appendChild(item);
  });
  overview.appendChild(metricsList);

  if (reason || autoSubscriptionNote || buyUrl) {
    const footnotes = document.createElement('div');
    footnotes.className = 'product-overview__footnotes';

    if (reason) {
      const reasonEl = document.createElement('p');
      reasonEl.className = 'product-overview__note';
      reasonEl.textContent = `Reason: ${reason}`;
      footnotes.appendChild(reasonEl);
    }

    if (autoSubscriptionNote) {
      const subEl = document.createElement('p');
      subEl.className = 'product-overview__note';
      subEl.textContent = autoSubscriptionNote;
      footnotes.appendChild(subEl);
    }

    if (buyUrl) {
      const link = document.createElement('a');
      link.className = 'product-overview__link';
      link.href = buyUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open purchase link';
      footnotes.appendChild(link);
    }

    overview.appendChild(footnotes);
  }

  return overview;
}

function formatNumberDisplay(value, { decimals = 1, fallback = '—' } = {}) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (decimals === 0) return String(Math.round(number));
  const fixed = number.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatDaysDisplay(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (number <= 0) return '0 days';
  if (number < 2) return `${Math.max(1, Math.round(number))} day`;
  if (number < 7) return `${number.toFixed(1).replace(/\.0$/, '')} days`;
  return `${Math.round(number)} days`;
}

function toInputDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toInputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
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

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function toNumberOrNull(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
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
